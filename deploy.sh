#!/bin/bash

# 道具SaaS平台一键部署脚本

set -e

echo "=== 道具SaaS平台部署开始 ==="

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "复制环境变量模板..."
    cp .env.production .env
    echo "⚠️  请编辑 .env 文件设置正确的数据库密码和其他配置"
    echo "⚠️  编辑完成后重新运行此脚本"
    exit 1
fi

# 停止现有服务
echo "停止现有服务..."
docker-compose down

# 清理旧镜像（可选）
read -p "是否清理旧的Docker镜像？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "清理旧镜像..."
    docker-compose down --rmi all
fi

# 构建并启动服务
echo "构建并启动服务..."
docker-compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

# 显示日志
echo "\n=== 服务启动日志 ==="
docker-compose logs --tail=20

echo "\n=== 部署完成 ==="
echo "主应用地址: http://localhost:3389"
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"