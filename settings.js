const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'session.json');

let sessionId = '';
try {
    if (fs.existsSync(SESSION_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessionId = data.SESSION_ID || '';
    }
} catch (e) {}

module.exports = {
    SESSION_ID: process.env.SESSION_ID || sessionId,
    BOTNAME: process.env.BOTNAME || 'Toxic-MD',
    COUNTRY_CODE: process.env.CODE || '254',
    PORT: parseInt(process.env.PORT) || 10000,
    HEROKU_APP_NAME: process.env.HEROKU_APP_NAME || '',
    HEROKU_API_KEY: process.env.HEROKU_API_KEY || '',
    MAX_MEMORY_MB: parseInt(process.env.MAX_MEMORY_MB) || 300,
    KEEP_ALIVE_INTERVAL: parseInt(process.env.KEEP_ALIVE_INTERVAL) || 4 * 60 * 1000,
    SESSION_CLEANUP_HOURS: parseInt(process.env.SESSION_CLEANUP_HOURS) || 24,
    STORE_WRITE_INTERVAL: parseInt(process.env.STORE_WRITE_INTERVAL) || 10 * 60 * 1000,
    MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 25,
    RECONNECT_BASE_DELAY: parseInt(process.env.RECONNECT_BASE_DELAY) || 3000,
    CONNECT_TIMEOUT: parseInt(process.env.CONNECT_TIMEOUT) || 90000,
    KEEP_ALIVE_WS_INTERVAL: parseInt(process.env.KEEP_ALIVE_WS_INTERVAL) || 25000,
    SETTINGS_CACHE_TTL: parseInt(process.env.SETTINGS_CACHE_TTL) || 60000,
};
