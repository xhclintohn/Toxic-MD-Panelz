module.exports = {
  apps: [{
    name: 'Toxic-MD',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '450M',
    env: {
      NODE_ENV: 'production'
    },
    node_args: '--expose-gc --max-old-space-size=400',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    exp_backoff_restart_delay: 100
  }, {
    name: 'Keep-Alive',
    script: 'keep-alive.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    env: {
      BOT_URL: process.env.BOT_URL || 'http://localhost:10000'
    },
    error_file: 'logs/keepalive-err.log',
    out_file: 'logs/keepalive-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
