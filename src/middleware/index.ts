// 导出所有中间件
export { authMiddleware, optionalAuthMiddleware } from './auth.middleware';
export { 
  requirePermission, 
  requireRole, 
  requireMerchantAccess, 
  requirePermissionAndMerchantAccess,
  hasPermission 
} from './permission.middleware';