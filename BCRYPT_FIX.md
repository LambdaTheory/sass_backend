# Docker部署兼容性问题解决方案

> **最新更新**: 推荐使用 `node:20-slim` (基于Debian) 替代 `node:18-alpine` 来解决兼容性问题。

## 问题描述
在Docker容器中部署时，可能遇到以下兼容性问题：

### 1. Bcrypt模块问题
bcrypt模块在Alpine Linux环境下的兼容性问题，错误信息通常包含：
```
Require stack: 
 - /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/bcrypt.js
```

### 2. Prisma引擎问题
Prisma引擎二进制文件缺失，特别是在ARM64架构下：
```
Error: Could not find schema-engine binary. Searched in:
 - /app/node_modules/.pnpm/@prisma+engines@5.22.0/node_modules/@prisma/engines/schema-engine-linux-musl-arm64-openssl-3.0.x
```

## 解决方案

### 1. 基础镜像切换（推荐方案）
**从 `node:18-alpine` 切换到 `node:20-slim`**
- 基于Debian的镜像对原生模块支持更好
- 避免了Alpine Linux的musl libc兼容性问题
- 简化了依赖安装和编译过程
- 更新到Node.js 20 LTS版本

### 2. Dockerfile优化
已在Dockerfile中添加以下改进：

#### Bcrypt模块修复：
- 添加 `linux-headers` 包
- 重新构建bcrypt模块：`pnpm rebuild bcrypt`
- 从源码构建bcrypt：`npm rebuild bcrypt --build-from-source`

#### Prisma引擎修复：
- 设置正确的二进制目标：`PRISMA_CLI_BINARY_TARGETS="linux-arm64-openssl-3.0.x,debian-openssl-3.0.x"`
- 设置引擎镜像：`PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh`
- 在安装依赖前就设置环境变量
- 强制下载引擎文件：`npx prisma version`
- 验证引擎文件存在

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

3. **检查Prisma引擎**
```bash
# 进入容器
docker exec -it <container_name> sh

# 检查Prisma版本和引擎
npx prisma version

# 查看引擎文件
find /app/node_modules -name "*schema-engine*" -type f

# 测试Prisma连接
npx prisma db pull --preview-feature || echo "数据库连接测试"
```

4. **查看详细错误日志**
```bash
docker-compose logs app
```

5. **检查系统架构**
```bash
# 在容器内检查架构
uname -m
cat /etc/os-release
```

### 5. 替代方案

如果bcrypt问题无法解决，可以考虑：
- 使用 `bcryptjs`（纯JavaScript实现）
- 使用 `argon2`（更现代的密码哈希库）

## 注意事项

- Alpine Linux环境下原生模块编译可能存在兼容性问题
- 确保容器有足够的内存进行编译
- 生产环境建议使用多阶段构建优化镜像大小