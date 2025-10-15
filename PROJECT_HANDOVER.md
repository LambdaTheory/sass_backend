# 道具SaaS平台后端项目交接文档

## 项目概述

**项目名称**: 道具SaaS平台后端API  
**当前版本**: v1.2.0  
**最后更新**: 2025-09-25 14:57:30  
**项目描述**: 为游戏开发者提供道具管理服务的SaaS平台后端系统

### 核心功能
- 多商户管理系统
- 道具模板管理
- 玩家道具背包系统
- 道具发放与消费
- 数据统计与导出
- 权限管理系统
- 自动化定时任务

## 技术栈

### 核心技术
- **运行环境**: Node.js 20
- **开发语言**: TypeScript
- **Web框架**: Express.js
- **数据库**: MySQL
- **ORM**: Prisma
- **进程管理**: PM2
- **容器化**: Docker + Docker Compose

### 主要依赖
```json
{
  "核心依赖": {
    "@prisma/client": "^5.7.1",
    "express": "^4.18.2",
    "typescript": "^5.3.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.3.1",
    "exceljs": "^4.4.0"
  },
  "开发依赖": {
    "jest": "^30.1.3",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "supertest": "^7.1.4"
  }
}
```

## 项目架构

### 目录结构
```
backend/
├── src/
│   ├── controllers/     # 控制器层 - 处理HTTP请求
│   ├── services/        # 服务层 - 业务逻辑处理
│   ├── middleware/      # 中间件 - 认证、权限、日志等
│   ├── routes/          # 路由层 - API路由定义
│   ├── utils/           # 工具类 - 数据库、响应、错误处理
│   ├── types/           # TypeScript类型定义
│   └── index.ts         # 应用入口文件
├── prisma/
│   └── schema.prisma    # 数据库模型定义
├── scripts/             # 初始化和维护脚本
├── tests/               # 单元测试
├── docker/              # Docker相关配置
└── coverage/            # 测试覆盖率报告
```

### MVC架构设计
- **控制器层**: 负责处理HTTP请求，调用服务层方法，返回响应
- **服务层**: 负责业务逻辑处理，调用数据访问层方法
- **数据访问层**: 通过Prisma ORM与MySQL数据库交互

## 数据库设计

### 核心数据模型
1. **Merchant** - 商户表
2. **App** - 应用表
3. **ItemTemplate** - 道具模板表
4. **User** - 用户表
5. **Permission** - 权限表
6. **ShardingMetadata** - 分片元数据表

### 分片策略
- 玩家道具数据按商户+应用+时间范围进行分片
- 支持动态表创建和管理
- 通过ShardingMetadata表管理分片信息

## Prisma ORM 使用指南

### Prisma 概述
本项目使用 Prisma 作为数据库 ORM，提供类型安全的数据库访问和强大的查询功能。

### Schema 文件结构
```prisma
// prisma/schema.prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl"]  // 支持 Docker 部署
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

### 常用 Prisma 命令

#### 开发环境命令
```bash
# 生成 Prisma 客户端（必须在每次 schema 变更后执行）
npx prisma generate

# 推送 schema 到数据库（开发环境推荐）
npx prisma db push

# 查看数据库内容（启动 Prisma Studio）
npx prisma studio

# 重置数据库（谨慎使用，会删除所有数据）
npx prisma db push --force-reset
```

#### 生产环境命令
```bash
# 创建迁移文件（生产环境推荐）
npx prisma migrate dev --name migration_name

# 应用迁移到生产数据库
npx prisma migrate deploy

# 生成客户端（部署时必须执行）
npx prisma generate
```

### 数据库初始化详细步骤

#### 1. 环境变量配置
确保 `DATABASE_URL` 正确配置：
```bash
# MySQL 连接字符串格式
DATABASE_URL="mysql://用户名:密码@主机:端口/数据库名"

# 示例
DATABASE_URL="mysql://root:password@localhost:3306/daojusaas"
```

#### 2. 客户端生成
```bash
# 生成 TypeScript 类型和客户端代码
npx prisma generate
```
**作用**:
- 根据 `schema.prisma` 生成 TypeScript 类型定义
- 创建 `@prisma/client` 实例
- 生成的文件位于 `node_modules/.prisma/client/`

#### 3. 数据库同步
```bash
# 将 schema 推送到数据库
npx prisma db push
```
**作用**:
- 创建数据库（如果不存在）
- 创建所有表结构
- 创建索引和约束
- 不会生成迁移文件（适合开发环境）

#### 4. 验证数据库结构
```bash
# 启动 Prisma Studio 查看数据库
npx prisma studio
```
访问 `http://localhost:5555` 查看数据库内容。

### Prisma 客户端使用示例

#### 基本查询
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 查询单个记录
const merchant = await prisma.merchant.findUnique({
  where: { id: 'merchant-id' }
});

// 查询多个记录
const merchants = await prisma.merchant.findMany({
  where: { status: 1 },
  include: { apps: true }
});

// 创建记录
const newMerchant = await prisma.merchant.create({
  data: {
    id: 'new-merchant-id',
    name: '新商户',
    created_at: BigInt(Date.now()),
    updated_at: BigInt(Date.now())
  }
});
```

#### 事务处理
```typescript
// 使用事务确保数据一致性
const result = await prisma.$transaction(async (tx) => {
  const merchant = await tx.merchant.create({
    data: { /* merchant data */ }
  });
  
  const app = await tx.app.create({
    data: { 
      merchant_id: merchant.id,
      /* other app data */
    }
  });
  
  return { merchant, app };
});
```

## 系统初始化脚本详解

### 初始化脚本概述
系统提供了两个重要的初始化脚本，用于设置基础数据和管理员账户。

### 1. 权限系统初始化

#### 脚本位置
`scripts/init-permissions.ts`

#### 执行命令
```bash
npm run init:permissions
# 或者
ts-node scripts/init-permissions.ts
```

#### 功能说明
- **创建基础权限**: 初始化系统所需的所有权限数据
- **权限分类**: 包含商户管理、应用管理、道具管理等权限
- **角色权限映射**: 为不同角色预设权限组合

#### 权限列表
```typescript
// 商户管理权限
- merchant_create: 创建商户
- merchant_edit: 编辑商户信息
- merchant_ban: 禁用商户
- merchant_unban: 解禁商户

// 应用管理权限
- application_create: 创建应用
- application_ban: 禁用应用
- application_unban: 解禁应用

// 道具管理权限
- item_create: 创建道具
- item_modify: 修改道具
- item_ban: 禁用道具
- item_unban: 解禁道具
```

#### 执行结果
```bash
🚀 开始初始化权限数据...
✅ 权限初始化完成！
   - 创建权限数量: 11
   - 角色配置: SUPER_ADMIN, MERCHANT_OWNER
```

#### 注意事项
- **幂等性**: 脚本支持重复执行，不会创建重复数据
- **依赖关系**: 必须在数据库表创建后执行
- **执行时机**: 仅在首次部署时执行一次

### 2. 超级管理员初始化

#### 脚本位置
`scripts/init-admin.ts`

#### 执行命令
```bash
npm run init:admin
# 或者
ts-node scripts/init-admin.ts
```

#### 功能说明
- **创建超级管理员**: 创建系统默认的超级管理员账户
- **权限分配**: 自动分配所有系统权限
- **密码加密**: 使用 bcrypt 加密存储密码

#### 默认账户信息
```bash
用户名: admin
密码: admin123
角色: SUPER_ADMIN
权限: 全部系统权限
```

#### 执行结果
```bash
✅ 超级管理员账号创建成功！
   用户名: admin
   用户ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   超管ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   分配权限数量: 11
```

#### 安全建议
- **修改默认密码**: 首次登录后立即修改默认密码
- **强密码策略**: 使用包含大小写字母、数字和特殊字符的强密码
- **定期更换**: 建议定期更换管理员密码

### 3. 初始化脚本执行顺序

**重要**: 必须按以下顺序执行初始化脚本：

```bash
# 1. 首先初始化权限系统
npm run init:permissions

# 2. 然后创建超级管理员（依赖权限数据）
npm run init:admin
```

#### 依赖关系说明
- `init:admin` 脚本依赖 `init:permissions` 脚本创建的权限数据
- 如果权限数据不存在，管理员账户将无法获得正确的权限配置

### 4. 常见问题和解决方案

#### 问题1: 权限初始化失败
```bash
错误: 数据库连接失败
```
**解决方案**:
- 检查 `DATABASE_URL` 配置是否正确
- 确认 MySQL 服务正在运行
- 验证数据库用户权限

#### 问题2: 管理员创建失败
```bash
警告: 系统中没有权限数据，请先运行 npm run init:permissions
```
**解决方案**:
- 先执行 `npm run init:permissions`
- 再执行 `npm run init:admin`

#### 问题3: 重复执行脚本
```bash
超级管理员账号已存在，跳过初始化
```
**说明**: 这是正常行为，脚本具有幂等性，不会创建重复数据。

### 5. 脚本自定义

#### 修改默认管理员信息
编辑 `scripts/init-admin.ts` 文件：
```typescript
// 修改默认用户名
const username = 'your-admin-username';

// 修改默认密码
const password = 'your-secure-password';
```

#### 添加自定义权限
编辑 `scripts/init-permissions.ts` 文件：
```typescript
const defaultPermissions = [
  // 添加新权限
  {
    name: 'custom_permission',
    description: '自定义权限描述',
    resource: 'custom_resource',
    action: 'custom_action'
  }
];
```

## API接口设计

### 认证方式
1. **JWT Token认证** - 管理后台使用
2. **HMAC签名认证** - C端商户API使用

### 主要API模块

#### 1. 认证模块 (`/api/auth`)
- `POST /login` - 用户登录
- `GET /verify` - Token验证
- `POST /logout` - 用户登出

#### 2. 商户管理 (`/api/merchant`)
- 商户CRUD操作
- 商户密钥管理

#### 3. 应用管理 (`/api/app`)
- 应用创建和管理
- 应用统计信息

#### 4. 道具模板 (`/api/item-templates`)
- 道具模板CRUD操作
- 支持批量操作和状态管理

#### 5. 玩家道具 (`/api/player-items`)
- 玩家背包查询
- 道具发放和消费
- 流水记录查询

#### 6. C端商户API (`/api/merchant/player-items`)
- 使用HMAC签名认证
- 提供给游戏客户端调用的接口

#### 7. 统计模块 (`/api/merchant/statistics`)
- 道具统计数据
- 应用概览统计

## 环境配置

### 环境变量 (.env)
```bash
# 数据库配置
DATABASE_URL="mysql://username:password@localhost:3306/daojusaas"

# 服务器配置
PORT=3389
NODE_ENV=development

# JWT配置
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"

# CORS配置
CORS_ORIGIN="http://localhost:3389"
```

### 开发环境启动

#### 1. 环境准备
```bash
# 安装依赖
npm install

# 复制环境变量配置文件
cp .env.example .env
```

#### 2. 配置环境变量
编辑 `.env` 文件，配置数据库连接：
```bash
# 数据库配置 - 请根据实际情况修改
DATABASE_URL="mysql://username:password@localhost:3306/daojusaas"

# 服务器配置
PORT=3389
NODE_ENV=development

# JWT配置 - 生产环境请使用强密码
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"

# CORS配置
CORS_ORIGIN="http://localhost:3389"
```

#### 3. Prisma 初次启动步骤

**重要提示**: 首次启动时，请按以下顺序执行命令，确保数据库正确初始化。

##### 3.1 数据库初始化
```bash
# 生成 Prisma 客户端
npx prisma generate

# 将 schema 推送到数据库（创建表结构）
npx prisma db push
```

**说明**:
- `prisma generate`: 根据 `schema.prisma` 生成 TypeScript 类型定义和客户端代码
- `prisma db push`: 将 schema 中定义的数据模型同步到数据库，创建相应的表结构
- 首次运行时会自动创建数据库（如果不存在）

##### 3.2 初始化系统数据
```bash
# 初始化权限系统
npm run init:permissions

# 创建超级管理员账户
npm run init:admin
```

**注意事项**:
- 权限初始化脚本会创建系统所需的基础权限数据
- 管理员初始化脚本会提示输入管理员账户信息
- 这两个脚本只需要在首次部署时执行一次

##### 3.3 启动开发服务器
```bash
# 启动开发服务器（支持热重载）
npm run dev
```

#### 4. 验证启动成功
启动成功后，你应该能看到：
```
Server is running on port 3389
Database connected successfully
```

访问 `http://localhost:3389/api/health` 检查服务状态。

## 部署指南

### Docker部署（推荐）
```bash
# 一键部署
./deploy.sh

# 手动部署
docker-compose up -d --build
```

### PM2部署
```bash
# 构建项目
npm run build

# 启动PM2
npm run start:pm2

# 查看状态
npm run monit:pm2
```

### 生产环境配置
1. 复制 `.env.example` 为 `.env`
2. 配置正确的数据库连接
3. 设置强密码的JWT_SECRET
4. 配置正确的CORS_ORIGIN

## 定时任务

### 过期道具清理
- **脚本**: `scripts/cleanup-expired-items.ts`
- **频率**: 每5分钟执行一次
- **功能**: 自动将过期道具状态从USABLE更新为UNUSABLE

### 删除模板清理
- **脚本**: `scripts/cleanup-deleted-templates.ts`
- **功能**: 清理标记为删除的道具模板

## 测试

### 运行测试
```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖率
- 当前覆盖率报告位于 `coverage/` 目录
- 包含详细的代码覆盖率分析

## 监控与日志

### PM2监控
```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs daojusaas-backend

# 监控面板
pm2 monit
```

### 日志文件
- 错误日志: `logs/err.log`
- 输出日志: `logs/out.log`
- 合并日志: `logs/combined.log`

## 安全考虑

### 认证安全
- JWT Token有效期24小时
- HMAC签名验证防止API伪造
- 密码使用bcrypt加密存储

### 权限控制
- 基于角色的权限管理
- 细粒度的资源权限控制
- 商户数据隔离

### 数据安全
- 使用Helmet增强HTTP安全
- CORS配置防止跨域攻击
- 输入验证和SQL注入防护

## 性能优化

### 数据库优化
- 合理的索引设计
- 分片策略减少单表压力
- 连接池管理

### 缓存策略
- 可考虑引入Redis缓存热点数据
- 数据库查询优化

## 常见问题

### 1. 数据库连接问题
- 检查DATABASE_URL配置
- 确认MySQL服务运行状态
- 验证数据库权限

### 2. JWT Token失效
- 检查JWT_SECRET配置
- 确认Token未过期
- 验证请求头格式

### 3. 权限验证失败
- 确认用户权限配置
- 检查权限中间件逻辑
- 验证商户访问权限

### 4. Prisma 相关问题

#### 4.1 Prisma 客户端生成失败
**错误信息**:
```bash
Error: Cannot find module '@prisma/client'
```
**解决方案**:
```bash
# 重新生成 Prisma 客户端
npx prisma generate

# 如果仍然失败，清理并重新安装
rm -rf node_modules/.prisma
npm install
npx prisma generate
```

#### 4.2 数据库连接字符串错误
**错误信息**:
```bash
Error: P1001: Can't reach database server
```
**解决方案**:
1. 检查 `DATABASE_URL` 格式：
```bash
# 正确格式
DATABASE_URL="mysql://username:password@host:port/database"

# 示例
DATABASE_URL="mysql://root:password@localhost:3306/daojusaas"
```

2. 验证数据库服务状态：
```bash
# macOS 使用 Homebrew 安装的 MySQL
brew services list | grep mysql
brew services start mysql

# 或者检查 MySQL 进程
ps aux | grep mysql
```

3. 测试数据库连接：
```bash
mysql -u username -p -h host -P port database
```

#### 4.3 Schema 推送失败
**错误信息**:
```bash
Error: P3009: migrate found failed migration
```
**解决方案**:
```bash
# 重置数据库（谨慎使用，会删除所有数据）
npx prisma db push --force-reset

# 或者手动删除迁移记录
npx prisma migrate reset
```

#### 4.4 类型错误
**错误信息**:
```typescript
Property 'merchant' does not exist on type 'PrismaClient'
```
**解决方案**:
```bash
# 重新生成类型定义
npx prisma generate

# 重启 TypeScript 服务器（VS Code）
Ctrl/Cmd + Shift + P -> "TypeScript: Restart TS Server"
```

#### 4.5 BigInt 序列化问题
**错误信息**:
```bash
TypeError: Do not know how to serialize a BigInt
```
**解决方案**:
在项目中添加 BigInt 序列化支持：
```typescript
// 在 index.ts 或其他入口文件中添加
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};
```

#### 4.6 连接池耗尽
**错误信息**:
```bash
Error: P2024: Timed out fetching a new connection from the connection pool
```
**解决方案**:
1. 检查连接是否正确关闭：
```typescript
// 确保在应用关闭时断开连接
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

2. 配置连接池参数：
```bash
DATABASE_URL="mysql://user:password@host:port/db?connection_limit=10&pool_timeout=20"
```

#### 4.7 Schema 文件语法错误
**错误信息**:
```bash
Error: Schema parsing error
```
**解决方案**:
1. 检查 `schema.prisma` 语法：
```bash
# 验证 schema 文件
npx prisma validate
```

2. 常见语法问题：
- 缺少 `@@map` 注解
- 字段类型不匹配
- 关系定义错误
- 缺少必要的索引

#### 4.8 迁移冲突
**错误信息**:
```bash
Error: Migration conflict detected
```
**解决方案**:
```bash
# 查看迁移状态
npx prisma migrate status

# 解决冲突
npx prisma migrate resolve --applied "migration_name"

# 或者重置迁移
npx prisma migrate reset
```

### 5. Prisma 性能优化

#### 5.1 查询优化
```typescript
// 使用 select 减少数据传输
const merchants = await prisma.merchant.findMany({
  select: {
    id: true,
    name: true,
    status: true
  }
});

// 使用 include 预加载关联数据
const merchantWithApps = await prisma.merchant.findUnique({
  where: { id: 'merchant-id' },
  include: {
    apps: {
      where: { status: 1 }
    }
  }
});
```

#### 5.2 批量操作
```typescript
// 使用 createMany 批量插入
await prisma.itemTemplate.createMany({
  data: templates,
  skipDuplicates: true
});

// 使用事务处理复杂操作
await prisma.$transaction([
  prisma.merchant.update({ /* ... */ }),
  prisma.app.create({ /* ... */ })
]);
```

#### 5.3 索引优化
确保在 `schema.prisma` 中添加必要的索引：
```prisma
model ItemTemplate {
  // 复合索引
  @@index([merchant_id, app_id])
  @@index([status, created_at])
}
```

### 6. Prisma 调试技巧

#### 6.1 启用查询日志
```typescript
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

#### 6.2 使用 Prisma Studio
```bash
# 启动可视化数据库管理工具
npx prisma studio
```

#### 6.3 查看生成的 SQL
```typescript
// 在开发环境中查看生成的 SQL
const result = await prisma.merchant.findMany();
// 查看控制台输出的 SQL 语句
```

## 维护建议

### 定期维护
1. 定期备份数据库
2. 监控日志文件大小
3. 清理过期的测试数据
4. 更新依赖包版本

### 版本发布
1. 更新 `version.json` 文件
2. 运行完整测试套件
3. 构建Docker镜像
4. 部署到生产环境

## 联系信息

### 技术支持
- 项目文档: 查看各模块的README文件
- API文档: `API_DOCS_*.md` 文件
- 问题反馈: 通过项目Issue跟踪

### 重要文件
- `API_DOCS_C_PLAYER_ITEM.md` - C端API文档
- `API_DOCS_EXPORT.md` - 导出功能文档
- `BCRYPT_FIX.md` - 密码加密修复说明
- `DOCKER_OPENSSL_FIX.md` - Docker SSL问题解决方案
- `PM2_README.md` - PM2使用说明

---

**注意**: 交接时请确保所有环境变量已正确配置，数据库已初始化，并且所有测试通过。