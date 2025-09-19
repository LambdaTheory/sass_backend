#!/bin/sh

# 等待数据库启动
echo "等待数据库连接..."
while ! nc -z mysql 3306; do
  sleep 1
done
echo "数据库连接成功"

# 推送数据库结构
echo "推送数据库结构..."
pnpm exec prisma db push --accept-data-loss

# 执行初始化脚本
echo "执行权限初始化..."
node -r ts-node/register scripts/init-permissions.ts || echo "权限初始化失败或已存在"

echo "执行管理员初始化..."
node -r ts-node/register scripts/init-admin.ts || echo "管理员初始化失败或已存在"

# 直接使用node启动应用（不使用PM2）
echo "使用node直接启动应用..."
node dist/index.js