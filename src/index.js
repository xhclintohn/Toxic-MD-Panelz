const {
  default: toxicConnect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  downloadContentFromMessage,
  jidDecode,
  proto,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  generateWAMessageContent,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const FileType = require("file-type");
const { exec, spawn, execSync } = require("child_process");
const axios = require("axios");
const chalk = require("chalk");
const express = require("express");
const rootSettings = require('../settings');
const app = express();
const port = rootSettings.PORT;
const PhoneNumber = require("awesome-phonenumber");
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('../lib/exif');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep } = require('../lib/botFunctions');
const store = makeInMemoryStore({ 
  logger: pino().child({ level: "silent", stream: "store" })
});

const authenticationn = require('../auth/auth.js');
const { smsg } = require('../handlers/smsg');
const { getSettings, getBannedUsers, banUser } = require("../database/config");

const { botname } = require('../config/settings');
const { DateTime } = require('luxon');
const { commands, totalCommands } = require('../handlers/commandHandler');
authenticationn();

const path = require('path');

const sessionName = path.join(__dirname, '..', 'Session');

const groupEvents = require("../handlers/eventHandler");
const connectionHandler = require('../handlers/connectionHandler');
const antilink = require('../features/antilink');

let cachedSettings = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = rootSettings.SETTINGS_CACHE_TTL;

async function getCachedSettings() {
    const now = Date.now();
    if (cachedSettings && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
        return cachedSettings;
    }
    cachedSettings = await getSettings();
    settingsCacheTime = now;
    return cachedSettings;
}

function invalidateSettingsCache() {
    cachedSettings = null;
    settingsCacheTime = 0;
}

function cleanupSessionFiles() {
    try {
        if (!fs.existsSync(sessionName)) return;

        const files = fs.readdirSync(sessionName);
        const keepFiles = ['creds.json', 'app-state-sync-version.json', 'pre-key-', 'session-', 'sender-key-', 'app-state-sync-key-'];

        files.forEach(file => {
            const filePath = path.join(sessionName, file);
            try {
                const stats = fs.statSync(filePath);

                const shouldKeep = keepFiles.some(pattern => {
                    if (pattern.endsWith('-')) return file.startsWith(pattern);
                    return file === pattern;
                });

                if (!shouldKeep) {
                    const fileAge = Date.now() - stats.mtimeMs;
                    const hoursOld = fileAge / (1000 * 60 * 60);

                    if (hoursOld > rootSettings.SESSION_CLEANUP_HOURS) {
                        fs.unlinkSync(filePath);
                    }
                }
            } catch (fileError) {}
        });
    } catch (error) {}
}

const activeIntervals = [];
function safeSetInterval(fn, ms) {
    const id = setInterval(fn, ms);
    activeIntervals.push(id);
    return id;
}

function clearAllIntervals() {
    while (activeIntervals.length > 0) {
        clearInterval(activeIntervals.pop());
    }
}

let isRestarting = false;
let reconnectTimeout = null;
let activeClient = null;

async function startToxic() {
  if (isRestarting) return;
  
  clearAllIntervals();
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  safeSetInterval(cleanupSessionFiles, 12 * 60 * 60 * 1000);
  cleanupSessionFiles();

  safeSetInterval(() => {
    try {
      const mem = process.memoryUsage();
      const usedMB = Math.round(mem.rss / 1024 / 1024);
      if (usedMB > rootSettings.MAX_MEMORY_MB) {
        if (global.gc) global.gc();
        if (store && store.messages) {
          const jids = Object.keys(store.messages);
          for (const jid of jids) {
            const msgs = Object.keys(store.messages[jid]);
            if (msgs.length > 50) {
              const toRemove = msgs.slice(0, msgs.length - 50);
              for (const id of toRemove) {
                delete store.messages[jid][id];
              }
            }
          }
        }
      }
    } catch (e) {}
  }, 5 * 60 * 1000);

  let settingss = await getSettings();
  if (!settingss) {
    console.log(`❌ TOXIC-MD FAILED TO CONNECT - Settings not found`);
    reconnectTimeout = setTimeout(() => {
      startToxic();
    }, 10000);
    return;
  }

  cachedSettings = settingss;
  settingsCacheTime = Date.now();

  const { autobio, mode, anticall } = settingss;
  const { version } = await fetchLatestBaileysVersion();

  const { saveCreds, state } = await useMultiFileAuthState(sessionName);

  const client = toxicConnect({
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: rootSettings.CONNECT_TIMEOUT,
    defaultQueryTimeoutMs: 45000,
    keepAliveIntervalMs: rootSettings.KEEP_ALIVE_WS_INTERVAL,
    generateHighQualityLinkPreview: false,
    emitOwnEvents: false,
    fireInitQueries: false,
    retryRequestDelayMs: 2000,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: "" };
    },
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        message.templateMessage ||
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },
    version,
    browser: ["Ubuntu", 'Chrome', "20.0.04"],
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: "silent", stream: 'store' }))
    }
  });

  activeClient = client;
  store.bind(client.ev);

  safeSetInterval(() => {
    try {
      store.writeToFile("store.json");
    } catch (e) {}
  }, rootSettings.STORE_WRITE_INTERVAL);

  if (autobio) {
    safeSetInterval(() => {
      try {
        const date = new Date();
        client.updateProfileStatus(
          `${botname} 𝐢𝐬 𝐚𝐜𝐭𝐢𝐯𝐞 𝟐𝟒/𝟕\n\n${date.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })} 𝐈𝐭'𝐬 𝐚 ${date.toLocaleString('en-US', { weekday: 'long', timeZone: 'Africa/Nairobi' })}.`
        );
      } catch (e) {}
    }, 120 * 1000);
  }

  const processedCalls = new Set();

  safeSetInterval(() => {
    processedCalls.clear();
  }, 10 * 60 * 1000);

  client.ws.on('CB:call', async (json) => {
    try {
      const settingszs = await getCachedSettings();
      if (!settingszs?.anticall) return;

      const callId = json.content?.[0]?.attrs?.['call-id'];
      const callerJid = json.content?.[0]?.attrs?.['call-creator'];

      if (!callId || !callerJid) return;

      if (processedCalls.has(callId)) return;
      processedCalls.add(callId);

      const callerNumber = callerJid.split('@')[0];
      const ownerJid = client.decodeJid(client.user.id);
      if (callerJid === ownerJid) return;

      const fakeQuoted = {
        key: {
          remoteJid: callerJid,
          fromMe: false,
          id: `TOXICCALL${Date.now()}`,
          participant: callerJid
        },
        message: {
          extendedTextMessage: {
            text: "Toxic-MD Anti-Call System",
            contextInfo: {
              externalAdReply: {
                showAdAttribution: false,
                title: "TOXIC-MD",
                body: "Anti-Call Protection",
                sourceUrl: "https://github.com/xhclintohn/Toxic-MD",
                mediaType: 1,
                renderLargerThumbnail: false
              }
            }
          }
        }
      };

      await client.rejectCall(callId, callerJid);
      await client.sendMessage(callerJid, {
        text: "> Calling without permission is highly prohibited ⚠️!"
      }, { quoted: fakeQuoted });

      const bannedUsers = await getBannedUsers();
      if (!bannedUsers.includes(callerNumber)) {
        await banUser(callerNumber);
      }
    } catch (callError) {
      console.error('❌ [CALL HANDLER] Error:', callError.message);
    }
  });

  client.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    let settings = await getCachedSettings();
    if (!settings) return;

    const { autoread, autolike, autoview, presence, autolikeemoji } = settings;

    for (const mek of messages) {
      if (!mek || !mek.key) continue;

      const remoteJid = mek.key.remoteJid;

      if (remoteJid === "status@broadcast") {
        if (autolike && mek.key) {
          try {
            let reactEmoji = autolikeemoji || 'random';

            if (reactEmoji === 'random') {
              const emojis = ['❤️', '👍', '🔥', '😍', '👏', '🎉', '🤩', '💯', '✨', '🌟'];
              reactEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            }

            const nickk = client.decodeJid(client.user.id);

            await client.sendMessage(mek.key.remoteJid, {
              react: {
                text: reactEmoji,
                key: mek.key
              }
            }, { statusJidList: [mek.key.participant, nickk] });
          } catch (sendError) {
            try {
              let reactEmoji = autolikeemoji || '❤️';
              await client.sendMessage(mek.key.remoteJid, {
                react: {
                  text: reactEmoji,
                  key: mek.key
                }
              });
            } catch (error2) {
            }
          }
        }

        if (autoview) {
          try {
            await client.readMessages([mek.key]);
          } catch (error) {
          }
        }

        continue;
      }

      if (!mek.message) continue;

      mek.message = Object.keys(mek.message)[0] === "ephemeralMessage" ? mek.message.ephemeralMessage.message : mek.message;

      if (!mek.message) continue;

      await antilink(client, mek, store);

      if (autoread && remoteJid.endsWith('@s.whatsapp.net')) {
        try {
          await client.readMessages([mek.key]);
        } catch (error) {}
      }

      if (remoteJid.endsWith('@s.whatsapp.net')) {
        const Chat = remoteJid;
        try {
          if (presence === 'online') {
            await client.sendPresenceUpdate("available", Chat);
          } else if (presence === 'typing') {
            await client.sendPresenceUpdate("composing", Chat);
          } else if (presence === 'recording') {
            await client.sendPresenceUpdate("recording", Chat);
          } else {
            await client.sendPresenceUpdate("unavailable", Chat);
          }
        } catch (error) {}
      }

      if (!client.public && !mek.key.fromMe) continue;

      if (mek.message?.listResponseMessage) {
        const selectedCmd = mek.message.listResponseMessage.singleSelectReply?.selectedRowId;
        if (selectedCmd) {
          const effectivePrefix = settings?.prefix || '.';
          let command = selectedCmd.startsWith(effectivePrefix)
            ? selectedCmd.slice(effectivePrefix.length).toLowerCase()
            : selectedCmd.toLowerCase();

          const listM = {
            ...mek,
            body: selectedCmd,
            text: selectedCmd,
            command: command,
            prefix: effectivePrefix,
            sender: mek.key.remoteJid,
            from: mek.key.remoteJid,
            chat: mek.key.remoteJid,
            isGroup: mek.key.remoteJid.endsWith('@g.us')
          };

          try {
            require("./toxic")(client, listM, { type: "notify" }, store);
          } catch (error) {
            console.error('❌ [LIST SELECTION] Error:', error.message);
          }
          continue;
        }
      }

      try {
        const m = smsg(client, mek, store);
        require("./toxic")(client, m, { type: "notify" }, store);
      } catch (error) {
        console.error('❌ [MESSAGE HANDLER] Error:', error.message);
      }
    }
  });

  client.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (update.key && update.key.remoteJid === "status@broadcast" && update.update?.messageStubType === 1) {
        const settings = await getCachedSettings();
        if (settings?.autoview) {
          try {
            await client.readMessages([update.key]);
          } catch (error) {}
        }
      }
    }
  });

  client.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  client.getName = (jid, withoutContact = false) => {
    const id = client.decodeJid(jid);
    withoutContact = client.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us"))
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {};
        if (!(v.name || v.subject)) v = client.groupMetadata(id) || {};
        resolve(v.name || v.subject || PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber("international"));
      });
    else
      v = id === "0@s.whatsapp.net"
        ? { id, name: "WhatsApp" }
        : id === client.decodeJid(client.user.id)
          ? client.user
          : store.contacts[id] || {};
    return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber("international");
  };

  client.public = true;

  client.serializeM = (m) => smsg(client, m, store);

  client.ev.on("group-participants.update", async (m) => {
    try {
      groupEvents(client, m);
    } catch (error) {
      console.error('❌ [GROUP EVENT] Error:', error.message);
    }
  });

  let reconnectAttempts = 0;
  const maxReconnectAttempts = rootSettings.MAX_RECONNECT_ATTEMPTS;
  const baseReconnectDelay = rootSettings.RECONNECT_BASE_DELAY;

  function scheduleReconnect(delay) {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    isRestarting = true;
    reconnectTimeout = setTimeout(() => {
      isRestarting = false;
      startToxic();
    }, delay);
  }

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const reason = lastDisconnect?.error ? new Boom(lastDisconnect.error).output.statusCode : null;

    if (connection === "open") {
      reconnectAttempts = 0;
      isRestarting = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      console.log(`✅ [CONNECTION] Connected to WhatsApp successfully!`);
    }

    if (connection === "close") {
      if (isRestarting) return;
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      clearAllIntervals();

      if (reason === DisconnectReason.loggedOut || reason === 401) {
        try {
          fs.rmSync(sessionName, { recursive: true, force: true });
        } catch (e) {}
        invalidateSettingsCache();
        scheduleReconnect(3000);
        return;
      }

      if (reason === DisconnectReason.restartRequired || reason === 515) {
        console.log('♻️ Restart required, restarting...');
        scheduleReconnect(2000);
        return;
      }

      if (reason === DisconnectReason.connectionClosed || 
          reason === DisconnectReason.connectionLost || 
          reason === DisconnectReason.timedOut || 
          reason === 408 || reason === 503 || reason === 500 || reason === 428) {
        
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(baseReconnectDelay * Math.pow(1.3, reconnectAttempts), 45000);
          reconnectAttempts++;
          console.log(`⏳ Connection lost (${reason}). Reconnecting in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
          scheduleReconnect(delay);
          return;
        }
      }

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log(`❌ Max reconnection attempts reached. Restarting in 60s...`);
        reconnectAttempts = 0;
        scheduleReconnect(60000);
        return;
      }

      const delay = Math.min(baseReconnectDelay * Math.pow(1.5, reconnectAttempts), 45000);
      reconnectAttempts++;
      console.log(`⏳ Reconnecting in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
      scheduleReconnect(delay);
      return;
    }

    await connectionHandler(client, update, startToxic);
  });

  client.ev.on("creds.update", saveCreds);

  client.sendText = (jid, text, quoted = "", options) => client.sendMessage(jid, { text: text, ...options }, { quoted });

  client.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const validTypes = ['image', 'video', 'audio', 'sticker', 'document', 'ptv'];
    if (!validTypes.includes(messageType)) {
      if (mime.startsWith('application/') || mime.startsWith('text/')) {
        messageType = 'document';
      } else if (mime.startsWith('image/')) {
        messageType = 'image';
      } else if (mime.startsWith('video/')) {
        messageType = 'video';
      } else if (mime.startsWith('audio/')) {
        messageType = 'audio';
      } else {
        messageType = 'document';
      }
    }
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  };

  client.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    let quoted = message.msg ? message.msg : message;
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const validSaveTypes = ['image', 'video', 'audio', 'sticker', 'document', 'ptv'];
    if (!validSaveTypes.includes(messageType)) {
      if (mime.startsWith('application/') || mime.startsWith('text/')) messageType = 'document';
      else if (mime.startsWith('image/')) messageType = 'image';
      else if (mime.startsWith('video/')) messageType = 'video';
      else if (mime.startsWith('audio/')) messageType = 'audio';
      else messageType = 'document';
    }
    const stream = await downloadContentFromMessage(quoted, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    let type = await FileType.fromBuffer(buffer);
    const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
    await fs.writeFileSync(trueFileName, buffer);
    return trueFileName;
  };

  const totalCmds = totalCommands || 0;
  const mem = process.memoryUsage();
  const usedMB = (mem.rss / 1024 / 1024).toFixed(2);
  const platform = process.env.DYNO ? 'Heroku' : process.env.REPLIT_DEPLOYMENT ? 'Replit' : process.platform;

  console.log(chalk.green(`\n╔══════════════════════════════════════╗`));
  console.log(chalk.green(`║`) + chalk.bold.cyan(`     TOXIC-MD v2 - CONNECTED`) + chalk.green(`         ║`));
  console.log(chalk.green(`╠══════════════════════════════════════╣`));
  console.log(chalk.green(`║`) + chalk.white(` Bot Name    : ${(botname || 'Toxic-MD').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Prefix      : ${(settingss.prefix || '.').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Mode        : ${(settingss.mode || 'public').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Platform    : ${String(platform).padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` NodeJS      : ${process.version.padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Memory      : ${(usedMB + ' MB').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Commands    : ${String(totalCmds).padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`╠══════════════════════════════════════╣`));
  console.log(chalk.green(`║`) + chalk.bold.yellow(`  FEATURE STATUS`) + chalk.green(`                      ║`));
  console.log(chalk.green(`╠══════════════════════════════════════╣`));
  console.log(chalk.green(`║`) + chalk.white(` Anticall    : ${settingss.anticall ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Autobio     : ${settingss.autobio ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Autolike    : ${settingss.autolike ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Autoview    : ${settingss.autoview ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Autoread    : ${settingss.autoread ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` ChatbotPM   : ${settingss.chatbotpm ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Antidelete  : ${settingss.antidelete ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Antiedit    : ${settingss.antiedit ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Antilink    : ${(settingss.antilink || 'off').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Presence    : ${(settingss.presence || 'online').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` React Emoji : ${(settingss.autolikeemoji || 'random').padEnd(21)}`) + chalk.green(`║`));
  console.log(chalk.green(`║`) + chalk.white(` Start Msg   : ${settingss.startmessage ? '✅ ON ' : '❌ OFF'} `.padEnd(22)) + chalk.green(`║`));
  console.log(chalk.green(`╠══════════════════════════════════════╣`));
  console.log(chalk.green(`║`) + chalk.gray(`  Powered by xh_clinton`) + chalk.green(`               ║`));
  console.log(chalk.green(`╚══════════════════════════════════════╝\n`));
}

app.use(express.static('public'));
app.use(express.json());

let botStatus = {
  alive: true,
  startTime: Date.now(),
  lastPing: Date.now(),
  reconnects: 0
};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get("/health", (req, res) => {
  botStatus.lastPing = Date.now();
  const uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
  const mem = process.memoryUsage();
  res.json({
    status: "alive",
    uptime: uptime,
    memory: Math.round(mem.rss / 1024 / 1024) + "MB",
    timestamp: new Date().toISOString()
  });
});

app.get("/ping", (req, res) => {
  botStatus.lastPing = Date.now();
  res.send("pong");
});

app.get("/status", (req, res) => {
  const uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const mem = process.memoryUsage();
  res.json({
    bot: "Toxic-MD",
    status: "online",
    uptime: `${hours}h ${minutes}m`,
    memory: Math.round(mem.rss / 1024 / 1024) + "MB",
    reconnects: botStatus.reconnects,
    platform: process.env.DYNO ? 'Heroku' : process.env.REPLIT_DEPLOYMENT ? 'Replit' : 'Other'
  });
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

process.on("unhandledRejection", (reason, promise) => {
  console.error('❌ [UNHANDLED ERROR] Unhandled Rejection:', reason?.message?.substring(0, 200) || reason);
});

process.on("uncaughtException", (error) => {
  console.error('❌ [UNCAUGHT ERROR]:', error?.message?.substring(0, 200) || error);
});

startToxic();

module.exports = { startToxic, invalidateSettingsCache };
