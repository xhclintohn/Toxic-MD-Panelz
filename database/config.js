const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DB_DIR, 'settings.json');
const GROUP_SETTINGS_FILE = path.join(DB_DIR, 'group_settings.json');
const CONVERSATION_FILE = path.join(DB_DIR, 'conversations.json');
const SUDO_USERS_FILE = path.join(DB_DIR, 'sudo_users.json');
const BANNED_USERS_FILE = path.join(DB_DIR, 'banned_users.json');
const USERS_FILE = path.join(DB_DIR, 'users.json');

const cache = {
    settings: { data: null, time: 0, ttl: 30000 },
    sudoUsers: { data: null, time: 0, ttl: 60000 },
    bannedUsers: { data: null, time: 0, ttl: 60000 },
    groupSettings: new Map()
};

const GROUP_SETTINGS_TTL = 60000;

function ensureDir() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
}

function readJSON(filePath, defaultValue = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            writeJSON(filePath, defaultValue);
            return defaultValue;
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return defaultValue;
    }
}

function writeJSON(filePath, data) {
    try {
        ensureDir();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
    }
}

function isCacheValid(entry) {
    return entry.data !== null && (Date.now() - entry.time) < entry.ttl;
}

async function initializeDatabase() {
    ensureDir();
    
    const defaultSettings = {
        prefix: '.',
        packname: 'Toxic-MD',
        mode: 'public',
        presence: 'online',
        autoview: 'true',
        autolike: 'false',
        autoread: 'false',
        autobio: 'false',
        anticall: 'false',
        chatbotpm: 'false',
        autolikeemoji: '❤️',
        antilink: 'off',
        antidelete: 'false',
        antiedit: 'false',
        antistatusmention: 'delete',
        startmessage: 'true'
    };

    const existingSettings = readJSON(SETTINGS_FILE, {});
    const mergedSettings = { ...defaultSettings, ...existingSettings };
    writeJSON(SETTINGS_FILE, mergedSettings);

    readJSON(GROUP_SETTINGS_FILE, {});
    readJSON(CONVERSATION_FILE, {});
    readJSON(SUDO_USERS_FILE, []);
    readJSON(BANNED_USERS_FILE, []);
    readJSON(USERS_FILE, []);
}

async function getSettings() {
    if (isCacheValid(cache.settings)) {
        return cache.settings.data;
    }
    try {
        const settings = readJSON(SETTINGS_FILE, {});
        const processed = {};
        Object.keys(settings).forEach(key => {
            if (settings[key] === 'true') processed[key] = true;
            else if (settings[key] === 'false') processed[key] = false;
            else processed[key] = settings[key];
        });
        cache.settings.data = processed;
        cache.settings.time = Date.now();
        return processed;
    } catch (error) {
        if (cache.settings.data) return cache.settings.data;
        return {};
    }
}

async function updateSetting(key, value) {
    try {
        const settings = readJSON(SETTINGS_FILE, {});
        const valueToStore = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
        settings[key] = valueToStore;
        writeJSON(SETTINGS_FILE, settings);
        cache.settings.data = null;
        cache.settings.time = 0;
    } catch (error) {
    }
}

async function getGroupSettings(jid) {
    const cached = cache.groupSettings.get(jid);
    if (cached && (Date.now() - cached.time) < GROUP_SETTINGS_TTL) {
        return cached.data;
    }
    try {
        const globalSettings = await getSettings();
        const groupSettings = readJSON(GROUP_SETTINGS_FILE, {});
        let result;
        if (groupSettings[jid]) {
            result = groupSettings[jid];
        } else {
            result = {
                antidelete: globalSettings.antidelete || true,
                gcpresence: false,
                events: false,
                antidemote: false,
                antipromote: false
            };
        }
        cache.groupSettings.set(jid, { data: result, time: Date.now() });
        if (cache.groupSettings.size > 500) {
            const oldestKey = cache.groupSettings.keys().next().value;
            cache.groupSettings.delete(oldestKey);
        }
        return result;
    } catch (error) {
        return {
            antidelete: true,
            gcpresence: false,
            events: false,
            antidemote: false,
            antipromote: false
        };
    }
}

async function updateGroupSetting(jid, key, value) {
    try {
        const groupSettings = readJSON(GROUP_SETTINGS_FILE, {});
        if (!groupSettings[jid]) {
            groupSettings[jid] = {
                antidelete: true,
                gcpresence: false,
                events: false,
                antidemote: false,
                antipromote: false
            };
        }
        groupSettings[jid][key] = value;
        writeJSON(GROUP_SETTINGS_FILE, groupSettings);
        cache.groupSettings.delete(jid);
    } catch (error) {
    }
}

async function banUser(num) {
    try {
        const bannedUsers = readJSON(BANNED_USERS_FILE, []);
        if (!bannedUsers.includes(num)) {
            bannedUsers.push(num);
            writeJSON(BANNED_USERS_FILE, bannedUsers);
        }
        cache.bannedUsers.data = null;
        cache.bannedUsers.time = 0;
    } catch (error) {
    }
}

async function unbanUser(num) {
    try {
        let bannedUsers = readJSON(BANNED_USERS_FILE, []);
        bannedUsers = bannedUsers.filter(user => user !== num);
        writeJSON(BANNED_USERS_FILE, bannedUsers);
        cache.bannedUsers.data = null;
        cache.bannedUsers.time = 0;
    } catch (error) {
    }
}

async function addSudoUser(num) {
    try {
        const sudoUsers = readJSON(SUDO_USERS_FILE, []);
        if (!sudoUsers.includes(num)) {
            sudoUsers.push(num);
            writeJSON(SUDO_USERS_FILE, sudoUsers);
        }
        cache.sudoUsers.data = null;
        cache.sudoUsers.time = 0;
    } catch (error) {
    }
}

async function removeSudoUser(num) {
    try {
        let sudoUsers = readJSON(SUDO_USERS_FILE, []);
        sudoUsers = sudoUsers.filter(user => user !== num);
        writeJSON(SUDO_USERS_FILE, sudoUsers);
        cache.sudoUsers.data = null;
        cache.sudoUsers.time = 0;
    } catch (error) {
    }
}

async function getSudoUsers() {
    if (isCacheValid(cache.sudoUsers)) {
        return cache.sudoUsers.data;
    }
    try {
        const users = readJSON(SUDO_USERS_FILE, []);
        cache.sudoUsers.data = users;
        cache.sudoUsers.time = Date.now();
        return users;
    } catch (error) {
        if (cache.sudoUsers.data) return cache.sudoUsers.data;
        return [];
    }
}

async function saveConversation(num, role, message) {
    try {
        const conversations = readJSON(CONVERSATION_FILE, {});
        if (!conversations[num]) {
            conversations[num] = [];
        }
        conversations[num].push({
            role,
            message,
            timestamp: new Date().toISOString()
        });
        writeJSON(CONVERSATION_FILE, conversations);
    } catch (error) {
    }
}

async function getRecentMessages(num) {
    try {
        const conversations = readJSON(CONVERSATION_FILE, {});
        return conversations[num] || [];
    } catch (error) {
        return [];
    }
}

async function deleteUserHistory(num) {
    try {
        const conversations = readJSON(CONVERSATION_FILE, {});
        delete conversations[num];
        writeJSON(CONVERSATION_FILE, conversations);
    } catch (error) {
    }
}

async function getBannedUsers() {
    if (isCacheValid(cache.bannedUsers)) {
        return cache.bannedUsers.data;
    }
    try {
        const users = readJSON(BANNED_USERS_FILE, []);
        cache.bannedUsers.data = users;
        cache.bannedUsers.time = Date.now();
        return users;
    } catch (error) {
        if (cache.bannedUsers.data) return cache.bannedUsers.data;
        return [];
    }
}

initializeDatabase();

module.exports = {
    addSudoUser,
    saveConversation,
    getRecentMessages,
    deleteUserHistory,
    getSudoUsers,
    removeSudoUser,
    banUser,
    unbanUser,
    getBannedUsers,
    getSettings,
    updateSetting,
    getGroupSettings,
    updateGroupSetting
};
