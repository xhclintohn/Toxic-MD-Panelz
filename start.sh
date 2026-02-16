#!/bin/bash

export NODE_OPTIONS="--expose-gc --max-old-space-size=256"

mkdir -p logs Session

if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    pm2 delete all 2>/dev/null
    pm2 start ecosystem.config.js
    pm2 save --force
    pm2 logs
else
    echo "Starting directly..."
    node --expose-gc --max-old-space-size=256 index.js &
    node keep-alive.js &
    wait
fi
