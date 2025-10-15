# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**道具SaaS平台后端** - 为游戏开发者提供道具管理服务的SaaS平台。基于 Node.js + TypeScript + Express + Prisma + MySQL 构建。

## 核心架构特性

### 1. 数据分片架构 (Sharding)

系统使用动态分表策略管理大规模玩家道具数据:

- **玩家道具表** (`player_items_${appId}_${YYYYMM}`): 按月分片
- **道具流水表** (`item_records_${appId}_${YYYYMMDD}`): 按日分片
- **每日配额表** (`item_limits_${appId}_${YYYYMMDD}`): 按日分片
- **总配额表** (`item_total_limits_${appId}`): 不分片,永久表

分片逻辑在 `src/services/sharding.service.ts` 中实现。系统会自动创建当天和明天的分表,确保服务可用性。

### 2. 双认证机制

- **JWT Token认证**: 用于管理后台 (`src/middleware/auth.middleware.ts`)
- **HMAC签名认证**: 用于C端商户API (`src/middleware/merchant-auth.middleware.ts`)
  - 验证请求头: `X-Signature`, `X-Timestamp`
  - 签名算法: HMAC-SHA256

### 3. 道具发放核心逻辑

在 `src/services/player-item.service.ts` 中的 `grantPlayerItem` 方法:

1. 幂等性检查: 通过 `idempotencyKey` 防止重复发放
2. 道具模板验证: 检查状态、过期时间
3. 持有上限检查: `limit_max` (带行锁并发控制)
4. 每日配额检查: `daily_limit_max` (原子计数表 `reserveDailyQuotaWithCounter`)
5. 总发放限制检查: `total_limit` (原子计数表 `reserveTotalQuotaWithCounter`)
6. 事务隔离级别: `RepeatableRead`

**关键**: 每日和总配额使用计数表+原子UPDATE确保并发安全,防止超额发放。

### 4. 权限管理系统

基于资源-动作模型:
- Permission: `resource` + `action` 组合定义权限
- UserPermission: 用户权限关联表
- 中间件: `src/middleware/permission.middleware.ts`

## 常用开发命令

### 开发环境
```bash
npm run dev                 # 启动开发服务器 (nodemon + ts-node)
npm run build               # 编译 TypeScript (src -> dist)
npm start                   # 启动生产服务器 (需先build)
```

### 数据库操作
```bash
npm run db:generate         # 生成 Prisma Client
npm run db:push             # 推送 schema 到数据库 (开发环境)
npm run db:migrate          # 创建迁移 (生产环境)
npm run db:studio           # 打开 Prisma Studio GUI
```

### 测试
```bash
npm test                    # 运行所有测试 (Jest)
npm run test:watch          # 监听模式运行测试
npm run test:coverage       # 生成测试覆盖率报告
```

### 初始化脚本
```bash
npm run init:permissions    # 初始化权限数据
npm run init:admin          # 创建超级管理员账户
npm run cleanup:templates   # 清理已删除的道具模板
npm run cleanup:expired-items # 清理过期道具 (定时任务)
```

### PM2 进程管理
```bash
npm run start:pm2           # 启动 PM2
npm run stop:pm2            # 停止
npm run restart:pm2         # 重启
npm run logs:pm2            # 查看日志
npm run monit:pm2           # 监控面板
```

## 项目结构关键点

```
src/
├── controllers/    # HTTP请求处理层
├── services/       # 业务逻辑层 (核心在此)
│   ├── player-item.service.ts      # 道具发放/消费核心逻辑
│   ├── sharding.service.ts         # 分片管理
│   ├── merchant-key.service.ts     # HMAC签名验证
│   └── item-template.service.ts    # 道具模板管理
├── middleware/     # 认证、权限、日志中间件
├── routes/         # API路由定义
├── utils/          # 工具函数 (database, response, errors, permission)
└── types/          # TypeScript类型定义

prisma/schema.prisma # 数据库模型定义 (核心表结构)
scripts/             # 维护脚本 (初始化、清理任务)
tests/               # 单元测试 (使用 Jest + Supertest)
```

## 重要技术细节

### 时间戳处理
- 代码中统一使用**秒时间戳** (Unix timestamp)
- 数据库 `BigInt` 字段存储毫秒时间戳 (如 `expire_date`)
- `sharding.service.ts` 中 `normalizeToSeconds` 统一时间格式

### 并发安全机制
1. **行锁**: `FOR UPDATE` 查询防止并发读
2. **原子更新**: 配额检查使用 `UPDATE ... WHERE granted + ? <= limit` 保证原子性
3. **事务隔离**: `RepeatableRead` 级别防止幻读

### 道具过期处理
- 查询时动态计算过期状态 (`getPlayerItems`)
- 发放前先执行 `updateMany` 批量更新过期模板状态
- 过期道具自动记录流水 (`handleExpiredItems`)

### 幂等性设计
- 流水表 `remark` 字段存储: `idempotency:${key} | ${备注}`
- 发放/消费前查询所有历史分表检查重复

## 测试注意事项

- 测试环境配置: `tests/setup.ts`
- 需要 MySQL 测试数据库 (配置 `DATABASE_URL`)
- 并发测试: 参考 `src/services/player-item.concurrency.test.ts`
- 运行单个测试: `npm test -- path/to/test.ts`

## Docker 部署

```bash
./deploy.sh                 # 一键部署脚本
docker-compose up -d        # 手动启动容器
```

Docker配置包含 OpenSSL 3.x 兼容性修复 (参考 `DOCKER_OPENSSL_FIX.md`),使用 `linux-musl` 二进制目标。

## 环境变量配置

关键环境变量 (参考 `.env.example`):
- `DATABASE_URL`: MySQL连接字符串
- `PORT`: 服务端口 (默认3389)
- `JWT_SECRET`: JWT密钥 (生产环境必须强密码)
- `JWT_EXPIRES_IN`: Token有效期 (默认7d)
- `CORS_ORIGIN`: CORS允许源

## API文档参考

- `API_DOCS_C_PLAYER_ITEM.md`: C端商户API (HMAC签名)
- `API_DOCS_EXPORT.md`: 数据导出功能

## 常见问题排查

1. **分表不存在 (1146错误)**: 检查 `sharding_metadata` 表,运行 `ensureTablesExist`
2. **配额超额发放**: 检查 `item_limits` 或 `item_total_limits` 表计数是否正确
3. **HMAC签名失败**: 验证商户密钥状态 (`key_status=1`) 和时间戳有效性
4. **道具模板过期**: 系统会在发放时自动更新过期状态,无需手动干预
