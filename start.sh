#!/bin/bash

export NODE_OPTIONS="--expose-gc --max-old-space-size=400"

mkdir -p logs Session

if [ ! -f "node_modules/.bin/pm2" ]; then
    echo "Installing dependencies..."
    npm install --omit=dev --no-audit --no-fund
fi

if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    pm2 start ecosystem.config.js
    pm2 logs
else
    echo "Starting directly..."
    node --expose-gc --max-old-space-size=400 index.js
fi
