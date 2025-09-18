import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { validateTokenAndGetUserInfo } from '../services/auth.service';
import { sendUnauthorized, sendInternalError } from '../utils/response';

/**
 * 登录验证中间件
 * 验证JWT token并将用户信息添加到req.user中
 * 用户信息一旦添加到req中就不可被外部修改（通过Object.freeze保护）
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 使用认证服务验证token并获取用户信息
    const result = await validateTokenAndGetUserInfo(req.headers.authorization);
    
    if (!result.success) {
      return sendUnauthorized(res, result.error!.message);
    }

    // 使用Object.freeze保护用户信息不被外部修改
    const frozenUserInfo = Object.freeze({
      ...result.userInfo!,
      permissions: Object.freeze(result.userInfo!.permissions || [])
    });

    // 将用户信息添加到请求对象中
    req.user = frozenUserInfo;
    
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    return sendInternalError(res, '认证过程中发生错误');
  }
};

/**
 * 可选的登录验证中间件
 * 如果提供了token则验证，否则继续执行（不强制要求登录）
 */
export const optionalAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  // 如果没有提供token，直接继续
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // 如果提供了token，则进行验证
  await authMiddleware(req, res, next);
};