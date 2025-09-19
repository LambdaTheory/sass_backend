FROM node:18-alpine

# 安装必要工具
RUN apk add --no-cache netcat-openbsd

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖（包含开发依赖，用于ts-node）
RUN npm ci

# 复制应用代码
COPY . .

# 生成Prisma客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 复制启动脚本
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# 暴露端口
EXPOSE 3000

# 使用启动脚本
CMD ["/start.sh"]