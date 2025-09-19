# Bcrypt 兼容性问题解决方案

## 问题描述
在Docker容器中部署时，bcrypt模块可能出现兼容性问题，特别是在Alpine Linux环境下。错误信息通常包含：
```
Require stack: 
 - /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/bcrypt.js
```

## 解决方案

### 1. Dockerfile优化
已在Dockerfile中添加以下改进：
- 添加 `linux-headers` 包
- 重新构建bcrypt模块：`pnpm rebuild bcrypt`
- 从源码构建bcrypt：`npm rebuild bcrypt --build-from-source`

### 2. 测试方法

#### 方法1：使用node直接启动（排除PM2问题）
```bash
# 使用环境变量启动
docker-compose -f docker-compose.node.yml up --build
```

#### 方法2：在现有容器中测试
```bash
# 进入容器
docker exec -it <container_name> sh

# 直接测试node启动
node dist/index.js
```

### 3. 部署选项

#### 默认部署（使用PM2）
```bash
docker-compose up --build
```

#### 使用node直接启动
```bash
# 设置环境变量
export USE_NODE=true
docker-compose up --build
```

或者在docker-compose.yml中添加环境变量：
```yaml
environment:
  - USE_NODE=true
```

### 4. 故障排除

如果问题仍然存在，可以尝试：

1. **清理并重新构建**
```bash
docker-compose down -v
docker system prune -f
docker-compose up --build
```

2. **检查bcrypt模块**
```bash
# 进入容器
docker exec -it <container_name> sh

# 测试bcrypt
node -e "console.log(require('bcrypt'))"
```

3. **查看详细错误日志**
```bash
docker-compose logs app
```

### 5. 替代方案

如果bcrypt问题无法解决，可以考虑：
- 使用 `bcryptjs`（纯JavaScript实现）
- 使用 `argon2`（更现代的密码哈希库）

## 注意事项

- Alpine Linux环境下原生模块编译可能存在兼容性问题
- 确保容器有足够的内存进行编译
- 生产环境建议使用多阶段构建优化镜像大小