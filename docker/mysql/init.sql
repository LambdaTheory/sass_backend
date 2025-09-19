-- MySQL初始化脚本
-- 在容器首次启动时执行

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS daojusaas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE daojusaas;

-- 设置时区
SET time_zone = '+08:00';

-- 注意：用户创建由Docker环境变量自动处理
-- 这里只需要确保权限设置

-- 授权
GRANT ALL PRIVILEGES ON daojusaas.* TO 'daojusaas'@'%';
FLUSH PRIVILEGES;

-- 优化MySQL配置
SET GLOBAL innodb_buffer_pool_size = 268435456; -- 256MB
SET GLOBAL max_connections = 200;
SET GLOBAL query_cache_size = 67108864; -- 64MB