FROM node:20-slim

WORKDIR /app

# 安装运行期需要的工具（用于健康检查和数据库连接检查）以及构建工具
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl netcat-traditional build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai

# 启用 pnpm 并设置全局目录
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 仅复制包管理文件，优先利用缓存
COPY package*.json pnpm-lock.yaml ./

# 安装依赖（包含 dev 依赖用于构建）
RUN pnpm install --frozen-lockfile

# 修复 bcrypt 模块兼容性问题
RUN pnpm rebuild bcrypt

# 复制 Prisma schema 并生成客户端
COPY prisma ./prisma
RUN npx prisma generate

# 复制其余源码并构建
COPY . .
RUN pnpm run build

# 运行期：设置生产环境并安装运行所需全局工具
ENV NODE_ENV=production
RUN pnpm add -g pm2 prisma

# 入口脚本（执行迁移 → 启动 PM2）
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3389

ENTRYPOINT ["/entrypoint.sh"]