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
```bash
# 安装依赖
npm install

# 数据库初始化
npx prisma db push
npx prisma generate

# 初始化权限和管理员
npm run init:permissions
npm run init:admin

# 启动开发服务器
npm run dev
```

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