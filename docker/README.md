# Docker 部署指南

本项目提供了完整的 Docker 部署方案，包括主应用、定时任务和数据库服务。

## 文件说明

### Dockerfile 文件

1. **Dockerfile** - 主应用的 Docker 镜像
   - 基于 Node.js 18 Alpine
   - 包含完整的应用代码和依赖
   - 暴露 3000 端口

2. **docker/Dockerfile.cron** - 定时任务的 Docker 镜像
   - 基于 Node.js 18 Alpine
   - 包含 cron 守护进程
   - 每天 0 点执行道具模板清理任务

### Docker Compose 文件

1. **docker-compose.yml** - 完整的生产环境部署
   - 主应用服务 (daojusaas-api)
   - 定时任务服务 (daojusaas-cron)
   - MySQL 数据库服务


2. **docker/docker-compose.cron.yml** - 仅定时任务部署（独立使用）

## 部署步骤

### 方式一：一键部署（推荐）
```bash
# 运行一键部署脚本
./deploy.sh
```

### 方式二：手动部署

#### 1. 环境准备

```bash
# 复制环境变量文件
cp .env.production .env

# 编辑环境变量，设置密码等敏感信息
vim .env
```

#### 2. 完整部署（推荐）- 自动化部署

```bash
# 构建并启动所有服务（包含自动初始化）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

**自动化功能：**
- 主应用启动时自动执行数据库结构推送
- 自动初始化权限和管理员账号
- 自动启动定时任务容器
- 定时任务每天0点自动清理过期模板

### 3. 仅部署定时任务

如果您已有主应用和数据库，只需要部署定时任务：

```bash
# 使用独立的定时任务配置
docker-compose -f docker/docker-compose.cron.yml up -d
```

### 4. 数据库初始化

首次部署后，需要同步数据库结构：

```bash
# 进入主应用容器
docker exec -it daojusaas-api sh

# 同步数据库结构
npx prisma db push

# 初始化权限数据（如果需要）
npm run init:permissions

# 创建管理员账户（如果需要）
npm run init:admin
```

## 服务说明

### 主应用服务 (daojusaas-api)
- **端口**: 3000
- **功能**: 提供 REST API 服务
- **健康检查**: 依赖 MySQL 服务健康状态

### 定时任务服务 (daojusaas-cron)
- **功能**: 执行定时清理任务
- **调度**: 每天 0:00 执行
- **日志**: 输出到 `/var/log/cleanup-templates.log`

### MySQL 数据库服务
- **端口**: 3306
- **数据库**: daojusaas
- **用户**: daojusaas
- **持久化**: 使用 Docker volume



## 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f [service_name]

# 重启服务
docker-compose restart [service_name]

# 停止所有服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v

# 重新构建镜像
docker-compose build --no-cache

# 进入容器
docker exec -it [container_name] sh
```

## 监控和维护

### 查看定时任务日志

```bash
# 查看清理任务日志
docker exec daojusaas-cron tail -f /var/log/cleanup-templates.log

# 手动执行清理任务
docker exec daojusaas-cron npm run cleanup:templates
```

### 数据库备份

```bash
# 备份数据库
docker exec daojusaas-mysql mysqldump -u root -p daojusaas > backup.sql

# 恢复数据库
docker exec -i daojusaas-mysql mysql -u root -p daojusaas < backup.sql
```

## 注意事项

1. **环境变量安全**: 生产环境请务必修改默认密码
2. **数据持久化**: MySQL 和 Redis 数据使用 Docker volume 持久化
3. **网络隔离**: 所有服务在同一个 Docker 网络中通信
4. **健康检查**: MySQL 服务包含健康检查，确保服务可用性
5. **日志管理**: 建议配置日志轮转，避免日志文件过大

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查环境变量配置
   - 确认 MySQL 服务健康状态
   - 查看数据库日志

2. **定时任务不执行**
   - 检查 cron 服务状态
   - 查看定时任务日志
   - 验证数据库连接

3. **应用启动失败**
   - 检查依赖安装
   - 查看应用日志
   - 确认端口占用情况