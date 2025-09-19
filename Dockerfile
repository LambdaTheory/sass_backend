FROM node:18-alpine

# 设置环境变量
ENV OPENSSL_CONF=/etc/ssl/
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 安装必要工具、OpenSSL和PM2
# 安装 Prisma 所需的系统库和bcrypt编译依赖
RUN apk add --no-cache \
    netcat-openbsd \
    openssl \
    openssl-dev \
    ca-certificates \
    libc6-compat \
    build-base \
    python3 \
    make \
    g++ \
    linux-headers \
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

# 重新构建bcrypt和其他原生模块
RUN pnpm rebuild bcrypt
RUN npm rebuild bcrypt --build-from-source

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
COPY docker/start-node.sh /start-node.sh
RUN chmod +x /start.sh
RUN chmod +x /start-node.sh

# 暴露端口
EXPOSE 3389

# 默认使用PM2启动脚本，可以通过环境变量USE_NODE=true来使用node直接启动
CMD ["sh", "-c", "if [ \"$USE_NODE\" = \"true\" ]; then /start-node.sh; else /start.sh; fi"]