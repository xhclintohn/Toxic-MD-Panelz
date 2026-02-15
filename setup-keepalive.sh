#!/bin/bash

echo "=========================================="
echo "   TOXIC-MD KEEP-ALIVE SETUP"
echo "=========================================="
echo ""

if [ -z "$1" ]; then
    echo "Usage: bash setup-keepalive.sh <your-bot-url>"
    echo ""
    echo "Example:"
    echo "  bash setup-keepalive.sh https://mybot.herokuapp.com"
    echo "  bash setup-keepalive.sh https://node1.panel.com:25565"
    echo ""
    echo "The bot will be pinged at: <your-url>/ping"
    echo ""
    exit 1
fi

BOT_URL=$1

echo "Testing bot connection..."
if command -v curl &> /dev/null; then
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BOT_URL}/ping" 2>/dev/null)
    if [ "$RESPONSE" = "200" ]; then
        echo "✅ Bot is reachable!"
    else
        echo "⚠️  Warning: Could not reach bot (HTTP $RESPONSE)"
        echo "   Make sure your bot is running first!"
    fi
else
    echo "⚠️  curl not found, skipping connection test"
fi

echo ""
echo "Setting up keep-alive service..."
export BOT_URL="${BOT_URL}"

if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    BOT_URL="${BOT_URL}" pm2 start keep-alive.js --name "bot-keepalive"
    pm2 save
    echo ""
    echo "✅ Keep-alive service started with PM2!"
    echo ""
    echo "Commands:"
    echo "  pm2 status          - Check status"
    echo "  pm2 logs keepalive  - View logs"
    echo "  pm2 stop keepalive  - Stop service"
else
    echo "PM2 not found. Starting directly..."
    echo ""
    echo "To run keep-alive in background:"
    echo "  export BOT_URL='${BOT_URL}'"
    echo "  nohup node keep-alive.js > keepalive.log 2>&1 &"
    echo ""
    echo "Or install PM2:"
    echo "  npm install -g pm2"
    echo "  Then run this script again"
fi

echo ""
echo "=========================================="
echo "   EXTERNAL SERVICES (RECOMMENDED)"
echo "=========================================="
echo ""
echo "For best results, also setup external monitoring:"
echo ""
echo "1. UptimeRobot (FREE):"
echo "   https://uptimerobot.com"
echo "   Monitor: ${BOT_URL}/ping"
echo ""
echo "2. Cron-Job.org (FREE):"
echo "   https://cron-job.org"
echo "   URL: ${BOT_URL}/ping"
echo ""
echo "3. Check status anytime:"
echo "   ${BOT_URL}/status"
echo ""
echo "See KEEP-ALIVE-GUIDE.md for detailed setup!"
echo "=========================================="
