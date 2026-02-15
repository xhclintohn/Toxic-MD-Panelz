const http = require('http');
const https = require('https');

const PING_INTERVAL = 5 * 60 * 1000;
const BOT_URL = process.env.BOT_URL || 'http://localhost:10000';

function pingBot() {
    const url = new URL(BOT_URL + '/ping');
    const protocol = url.protocol === 'https:' ? https : http;
    
    const req = protocol.get(url, (res) => {
        if (res.statusCode === 200) {
            console.log(`✅ [${new Date().toLocaleTimeString()}] Bot is alive`);
        }
    });
    
    req.on('error', (error) => {
        console.log(`⚠️ [${new Date().toLocaleTimeString()}] Ping failed:`, error.message);
    });
    
    req.end();
}

console.log(`🔄 Keep-Alive Service Started`);
console.log(`📍 Pinging: ${BOT_URL}`);
console.log(`⏰ Interval: ${PING_INTERVAL / 1000}s\n`);

pingBot();
setInterval(pingBot, PING_INTERVAL);

process.on('SIGINT', () => {
    console.log('\n👋 Keep-Alive service stopped');
    process.exit(0);
});
