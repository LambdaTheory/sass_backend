FROM node:18-alpine

# 设置环境变量
ENV OPENSSL_CONF=/etc/ssl/
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 安装必要工具、OpenSSL和PM2
# 安装 Prisma 所需的系统库
RUN apk add --no-cache \
    netcat-openbsd \
    openssl \
    openssl-dev \
    ca-certificates \
    libc6-compat \
    && update-ca-certificates

# 安装 pnpm 和 PM2
RUN corepack enable
RUN npm install -g pm2

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json pnpm-lock.yaml ./

# 安装依赖（包含开发依赖，用于ts-node）
RUN pnpm install --frozen-lockfile

# 复制应用代码
COPY . .

# 生成Prisma客户端
# 设置 Prisma 二进制目标为 linux-musl
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl
RUN npx prisma generate
# RUN npx prisma db push --accept-data-loss

# 构建应用
RUN pnpm run build

# 创建日志目录
RUN mkdir -p /app/logs

# 复制启动脚本
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# 暴露端口
EXPOSE 3389

# 使用启动脚本
CMD ["/start.sh"]