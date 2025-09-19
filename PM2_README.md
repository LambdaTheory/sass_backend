# PM2 进程管理配置

本项目已配置PM2进程管理器，提供自动重启、日志管理、监控等功能。

## PM2 的优势

1. **自动重启**: 应用崩溃时自动重启
2. **内存监控**: 内存超限时自动重启（配置为1G）
3. **日志管理**: 统一管理应用日志
4. **零停机重载**: 支持无缝更新
5. **进程监控**: 实时监控应用状态

## 可用命令

### 开发环境
```bash
npm run dev          # 开发模式（使用nodemon）
```

### 生产环境（PM2）
```bash
npm run start:pm2    # 启动PM2应用
npm run stop:pm2     # 停止PM2应用
npm run restart:pm2  # 重启PM2应用
npm run reload:pm2   # 零停机重载
npm run delete:pm2   # 删除PM2应用
npm run logs:pm2     # 查看应用日志
npm run monit:pm2    # 打开PM2监控界面
```

### 直接PM2命令
```bash
pm2 list            # 查看所有应用状态
pm2 show daojusaas-backend  # 查看应用详情
pm2 logs daojusaas-backend  # 查看实时日志
pm2 monit           # 监控界面
pm2 restart all     # 重启所有应用
pm2 stop all        # 停止所有应用
pm2 delete all      # 删除所有应用
```

## 配置说明

### ecosystem.config.js
- **instances**: 1 (单实例，可根据CPU核心数调整)
- **max_memory_restart**: 1G (内存超限重启)
- **autorestart**: true (自动重启)
- **min_uptime**: 10s (最小运行时间)
- **max_restarts**: 10 (最大重启次数)

### 日志文件
- **错误日志**: `./logs/err.log`
- **输出日志**: `./logs/out.log`
- **合并日志**: `./logs/combined.log`

## Docker 部署

在Docker容器中，PM2使用`pm2-runtime`模式运行，这样可以：
- 保持容器前台运行
- 正确处理信号
- 自动重启应用

## 注意事项

1. 生产环境建议使用PM2
2. 开发环境可以继续使用`npm run dev`
3. 日志文件会自动轮转，避免占用过多磁盘空间
4. 可以通过修改`ecosystem.config.js`调整配置
5. 在Docker中重启容器会重启PM2应用

## 监控和调试

```bash
# 查看应用状态
pm2 list

# 查看详细信息
pm2 show daojusaas-backend

# 实时日志
pm2 logs daojusaas-backend --lines 100

# 监控界面（CPU、内存使用情况）
pm2 monit
```