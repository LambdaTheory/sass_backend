# Docker OpenSSL 兼容性问题修复

## 问题描述

在 Docker 容器中运行 Prisma 时遇到以下错误：

```
Unable to require(`/app/node_modules/.prisma/client/libquery_engine-linux-musl-arm64-openssl-1.1.x.so.node`).
The Prisma engines do not seem to be compatible with your system.
Details: Error loading shared library libssl.so.1.1: No such file or directory
```

## 问题原因

1. Alpine Linux 容器缺少 Prisma 所需的 OpenSSL 库
2. Prisma 引擎二进制文件与容器系统不兼容
3. 缺少必要的系统库依赖

## 解决方案

### 1. 修改 Dockerfile

在 Dockerfile 中添加了以下修改：

- 安装必要的系统库：`openssl`、`openssl-dev`、`ca-certificates`、`libc6-compat`
- 设置 OpenSSL 环境变量
- 配置 Prisma 二进制目标为 `linux-musl`

### 2. 修改 Prisma Schema

在 `prisma/schema.prisma` 中添加了二进制目标配置：

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl"]
}
```

## 修改内容

### Dockerfile 变更

1. 添加系统库安装
2. 设置环境变量 `OPENSSL_CONF` 和 `PRISMA_CLI_BINARY_TARGETS`
3. 确保 CA 证书更新

### Prisma Schema 变更

1. 添加 `binaryTargets` 配置，支持 `native` 和 `linux-musl` 平台

## 验证

重新构建 Docker 镜像后，Prisma 应该能够正常工作，不再出现 OpenSSL 兼容性错误。

## 注意事项

- 这些修改确保了 Prisma 在 Alpine Linux 容器中的兼容性
- 二进制目标配置支持多平台部署
- 系统库的安装确保了运行时依赖的满足