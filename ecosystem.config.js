module.exports = {
  apps: [{
    name: 'daojusaas-backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3389
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // 自动重启配置
    min_uptime: '10s',
    max_restarts: 10,
    // 优雅关闭
    kill_timeout: 5000,
    // 健康检查
    health_check_grace_period: 3000
  }]
};