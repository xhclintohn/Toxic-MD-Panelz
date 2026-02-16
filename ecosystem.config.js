module.exports = {
  apps: [{
    name: 'Toxic-MD',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production'
    },
    node_args: '--expose-gc --max-old-space-size=256',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    min_uptime: '30s',
    max_restarts: 15,
    restart_delay: 5000,
    exp_backoff_restart_delay: 500,
    kill_timeout: 10000,
    listen_timeout: 15000
  }, {
    name: 'Keep-Alive',
    script: 'keep-alive.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '50M',
    env: {
      BOT_URL: process.env.BOT_URL || 'http://localhost:10000'
    },
    node_args: '--max-old-space-size=32',
    error_file: 'logs/keepalive-err.log',
    out_file: 'logs/keepalive-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
