const http = require('http');
const https = require('https');

let rootSettings;
try {
    rootSettings = require('./settings');
} catch (e) {
    rootSettings = {};
}

const PING_INTERVAL = rootSettings.KEEP_ALIVE_INTERVAL || 4 * 60 * 1000;
const BOT_URL = process.env.BOT_URL || 'http://localhost:' + (rootSettings.PORT || 10000);

let consecutiveFailures = 0;
const MAX_FAILURES = 5;

function pingBot() {
    try {
        const url = new URL(BOT_URL + '/ping');
        const protocol = url.protocol === 'https:' ? https : http;
        
        const req = protocol.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode === 200) {
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
            }
            res.resume();
        });
        
        req.on('error', (error) => {
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_FAILURES) {
                console.log(`⚠️ Bot unreachable ${consecutiveFailures} times`);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            consecutiveFailures++;
        });
        
        req.end();
    } catch (e) {}
}

pingBot();
setInterval(pingBot, PING_INTERVAL);

process.on('SIGINT', () => {
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});
