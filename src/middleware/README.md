# 中间件使用说明

本项目包含了完整的登录验证和权限校验中间件系统，确保API的安全性和权限控制。

## 中间件概览

### 1. 登录验证中间件 (auth.middleware.ts)

#### `authMiddleware`
- **功能**: 验证JWT token并将用户信息添加到 `req.user` 中
- **保护机制**: 用户信息通过 `Object.freeze()` 保护，不可被外部修改
- **使用场景**: 需要用户登录的所有路由

```typescript
import { authMiddleware } from '../middleware';

router.get('/profile', authMiddleware, (req: AuthRequest, res) => {
  // req.user 包含完整的用户信息和权限列表
  res.json({ user: req.user });
});
```

#### `optionalAuthMiddleware`
- **功能**: 可选的登录验证，如果提供token则验证，否则继续执行
- **使用场景**: 某些可以匿名访问但登录后有额外功能的路由

### 2. 权限校验中间件 (permission.middleware.ts)

#### `requirePermission`
- **功能**: 检查用户是否具有特定的资源操作权限
- **权限格式**: `{resource}_{action}` (如: `item_create`, `merchant_edit`)
- **超级管理员**: 自动拥有所有权限

```typescript
// 单个权限检查
router.post('/items', 
  authMiddleware,
  requirePermission({ resource: 'item', action: 'create' }),
  handler
);

// 多个权限检查（满足其中一个即可）
router.put('/items/:id',
  authMiddleware,
  requirePermission([
    { resource: 'item', action: 'update' },
    { resource: 'item', action: 'modify' }
  ]),
  handler
);

// 需要所有权限都满足
router.delete('/items/:id',
  authMiddleware,
  requirePermission([
    { resource: 'item', action: 'delete', requireAll: true },
    { resource: 'item', action: 'ban', requireAll: true }
  ]),
  handler
);
```

#### `requireRole`
- **功能**: 检查用户是否具有指定角色
- **支持角色**: `SUPER_ADMIN`, `MERCHANT_OWNER`, `ADMIN`, `MEMBER`, `VIEWER`

```typescript
router.get('/admin/users',
  authMiddleware,
  requireRole(['SUPER_ADMIN', 'MERCHANT_OWNER']),
  handler
);
```

#### `requireMerchantAccess`
- **功能**: 确保用户只能访问自己商户的资源
- **超级管理员**: 可以访问所有商户资源

```typescript
router.get('/merchants/:merchantId/apps',
  authMiddleware,
  requireMerchantAccess((req) => req.params.merchantId),
  handler
);
```

#### `requirePermissionAndMerchantAccess`
- **功能**: 同时检查权限和商户访问权限
- **使用场景**: 商户内部的资源操作

```typescript
router.post('/merchants/:merchantId/items',
  authMiddleware,
  requirePermissionAndMerchantAccess(
    { resource: 'item', action: 'create' },
    (req) => req.params.merchantId
  ),
  handler
);
```

## 用户信息结构

登录成功后，`req.user` 包含以下信息：

```typescript
interface UserInfo {
  id: string;                    // 用户ID
  username: string;              // 用户名
  user_type: UserType;           // 用户类型
  role?: Role;                   // 用户角色
  merchant_id?: string;          // 商户ID（商户用户才有）
  super_admin_id?: string;       // 超管ID（超管才有）
  merchant_user_id?: string;     // 商户用户ID（商户用户才有）
  status: number;                // 用户状态
  permissions?: readonly string[]; // 权限列表（只读）
}
```

## 权限系统

### 权限命名规则
权限名称格式：`{resource}_{action}`

**资源类型 (resource)**:
- `merchant`: 商户管理
- `application`: 应用管理
- `item`: 道具管理

**操作类型 (action)**:
- `create`: 创建
- `update`/`modify`: 更新/修改
- `delete`: 删除
- `ban`/`unban`: 禁用/解禁
- `read`: 查看

### 角色权限映射

**SUPER_ADMIN (超级管理员)**:
- 拥有所有权限
- 可以访问所有商户资源

**MERCHANT_OWNER (商户所有者)**:
- `application_create`, `application_ban`, `application_unban`
- `item_create`, `item_modify`, `item_ban`, `item_unban`
- 只能访问自己商户的资源

## 安全特性

1. **用户信息保护**: 通过 `Object.freeze()` 确保 `req.user` 不可被修改
2. **JWT验证**: 严格的token验证和过期检查
3. **权限分离**: 细粒度的权限控制
4. **商户隔离**: 确保商户间数据隔离
5. **角色层次**: 支持多层次的角色权限体系

## 使用示例

```typescript
import { Router } from 'express';
import { 
  authMiddleware, 
  requirePermission, 
  requireMerchantAccess 
} from '../middleware';

const router = Router();

// 基础认证
router.get('/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 权限检查
router.post('/items', 
  authMiddleware,
  requirePermission({ resource: 'item', action: 'create' }),
  (req, res) => {
    // 创建道具逻辑
  }
);

// 商户访问控制
router.get('/merchants/:merchantId/data',
  authMiddleware,
  requireMerchantAccess((req) => req.params.merchantId),
  (req, res) => {
    // 获取商户数据逻辑
  }
);
```

## 环境变量配置

确保在 `.env` 文件中配置以下变量：

```env
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=24h
```

## 错误处理

中间件会返回标准的HTTP状态码和错误信息：

- `401`: 未登录或token无效
- `403`: 权限不足
- `400`: 请求参数错误
- `500`: 服务器内部错误

错误响应格式：
```json
{
  "error": "错误描述",
  "required": ["需要的权限列表"],
  "missing": ["缺少的权限列表"],
  "message": "详细错误信息"
}
```