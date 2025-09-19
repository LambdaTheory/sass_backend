# 构建阶段
FROM node:20-slim AS builder

WORKDIR /app

# 安装构建工具
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

# 启用 pnpm
RUN corepack enable

# 复制包管理文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖（包含 dev 依赖用于构建）
RUN pnpm install --frozen-lockfile


# 复制 Prisma schema 并生成客户端
COPY prisma ./prisma
RUN npx prisma generate

# 复制 TypeScript 配置和源码
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# 构建 TypeScript
RUN pnpm run build

# 生产镜像
FROM node:20-slim AS runner

WORKDIR /app

# 安装运行期需要的工具
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl netcat-traditional \
  && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
ENV NODE_ENV=production

# 启用 pnpm 并设置全局目录
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN mkdir -p $PNPM_HOME
RUN pnpm config set global-bin-dir $PNPM_HOME
RUN pnpm add -g pm2 prisma

# 从构建阶段复制文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY ecosystem.config.js ./
COPY scripts ./scripts

# 入口脚本
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3389

ENTRYPOINT ["/entrypoint.sh"]