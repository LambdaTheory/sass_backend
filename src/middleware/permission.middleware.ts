import { Response, NextFunction } from 'express';
import { AuthRequest, PermissionCheckOptions } from '../types';
import { unauthorized, forbidden, badRequest, sendUnauthorized, sendForbidden, sendBadRequest } from '../utils/response';

/**
 * 权限校验中间件工厂函数
 * 根据指定的资源和操作检查用户权限
 * @param options 权限检查选项
 * @returns Express中间件函数
 */
export const requirePermission = (options: PermissionCheckOptions | PermissionCheckOptions[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // 检查用户是否已登录
    if (!req.user) {
      sendUnauthorized(res, '用户未登录');
      return;
    }

    const user = req.user;
    
    // 检查用户是否被禁用
    if (user.status !== 1) {
      sendUnauthorized(res, '用户已被禁用');
      return;
    }
    
    const userPermissions = user.permissions || [];

    // 如果是超级管理员，直接通过
    if (user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    // 处理单个权限检查
    if (!Array.isArray(options)) {
      const requiredPermission = `${options.resource}_${options.action}`;
      if (!userPermissions.includes(requiredPermission)) {
        sendForbidden(res, '权限不足', {
          required: requiredPermission,
          message: `需要 ${options.resource} 的 ${options.action} 权限`
        });
        return;
      }
      next();
      return;
    }

    // 处理多个权限检查
    const requiredPermissions = options.map(opt => `${opt.resource}_${opt.action}`);
    const requireAll = options.some(opt => opt.requireAll) || false;

    if (requireAll) {
      // 需要所有权限都满足
      const missingPermissions = requiredPermissions.filter(perm => !userPermissions.includes(perm));
      if (missingPermissions.length > 0) {
        sendForbidden(res, '权限不足', {
          required: requiredPermissions,
          missing: missingPermissions,
          message: '需要所有指定权限'
        });
        return;
      }
    } else {
      // 只需要满足其中一个权限
      const hasAnyPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
      if (!hasAnyPermission) {
        sendForbidden(res, '权限不足', {
          required: requiredPermissions,
          message: '需要至少一个指定权限'
        });
        return;
      }
    }

    next();
  };
};

/**
 * 角色检查中间件工厂函数
 * 检查用户是否具有指定角色
 * @param allowedRoles 允许的角色列表
 * @returns Express中间件函数
 */
export const requireRole = (allowedRoles: string | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, '用户未登录');
      return;
    }

    // 检查用户是否被禁用
    if (req.user.status !== 1) {
      sendUnauthorized(res, '用户已被禁用');
      return;
    }

    const userRole = req.user.role;
    if (!userRole) {
      sendForbidden(res, '用户角色未定义');
      return;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    if (!roles.includes(userRole)) {
      sendForbidden(res, '角色权限不足', {
        required: roles,
        current: userRole,
        message: `需要以下角色之一: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
};

/**
 * 商户权限检查中间件
 * 确保用户只能访问自己商户的资源
 * @param getMerchantId 从请求中获取商户ID的函数
 * @returns Express中间件函数
 */
export const requireMerchantAccess = (
  getMerchantId: (req: AuthRequest) => string | undefined
) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, '用户未登录');
      return;
    }

    // 检查用户是否被禁用
    if (req.user.status !== 1) {
      sendUnauthorized(res, '用户已被禁用');
      return;
    }

    // 超级管理员可以访问所有商户资源
    if (req.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const requestMerchantId = getMerchantId(req);
    const userMerchantId = req.user.merchant_id;

    if (!userMerchantId) {
      sendForbidden(res, '用户未关联任何商户');
      return;
    }

    if (!requestMerchantId) {
      sendBadRequest(res, '请求中缺少商户ID');
      return;
    }

    if (requestMerchantId !== userMerchantId) {
      sendForbidden(res, '无权访问其他商户的资源', {
        message: '只能访问自己商户的资源'
      });
      return;
    }

    next();
  };
};

/**
 * 组合中间件：同时检查权限和商户访问权限
 * @param permissionOptions 权限检查选项
 * @param getMerchantId 从请求中获取商户ID的函数
 * @returns Express中间件函数
 */
export const requirePermissionAndMerchantAccess = (
  permissionOptions: PermissionCheckOptions | PermissionCheckOptions[],
  getMerchantId: (req: AuthRequest) => string | undefined
) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // 先检查权限
    const permissionMiddleware = requirePermission(permissionOptions);
    permissionMiddleware(req, res, (permissionError) => {
      if (permissionError) {
        return;
      }
      
      // 权限检查通过后，检查商户访问权限
      const merchantMiddleware = requireMerchantAccess(getMerchantId);
      merchantMiddleware(req, res, next);
    });
  };
};

/**
 * 检查用户是否有特定权限的辅助函数
 * @param user 用户信息
 * @param resource 资源类型
 * @param action 操作类型
 * @returns 是否有权限
 */
export const hasPermission = (
  user: { role?: string; permissions?: readonly string[] },
  resource: string,
  action: string
): boolean => {
  // 超级管理员拥有所有权限
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  const requiredPermission = `${resource}_${action}`;
  return user.permissions?.includes(requiredPermission) || false;
};