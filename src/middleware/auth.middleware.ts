import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, UserInfo, JWTPayload } from '../types';
import { unauthorized, internalError } from '../utils/response';

const prisma = new PrismaClient();

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
    // 从请求头获取token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const errorResponse = unauthorized('未提供有效的认证token');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    
    // 验证JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET 环境变量未设置');
      const errorResponse = internalError('服务器配置错误');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    } catch (jwtError) {
      const errorResponse = unauthorized('token无效或已过期');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 从数据库获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || user.status !== 1) {
      const errorResponse = unauthorized('用户不存在或已被禁用');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 根据用户类型获取详细信息和权限
    let userInfo: UserInfo = {
      id: user.id,
      username: user.username,
      user_type: user.user_type,
      status: user.status,
      permissions: []
    };

    // 根据用户类型补充信息
    if (user.user_type === 'SUPER_ADMIN' && user.super_admin_id) {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: user.super_admin_id }
      });
      if (superAdmin) {
        userInfo.role = 'SUPER_ADMIN';
        userInfo.super_admin_id = superAdmin.id;
        // 获取超级管理员权限
        const userPermissions = await prisma.userPermission.findMany({
          where: { user_id: user.id },
          include: { permission: true }
        });
        userInfo.permissions = userPermissions.map(up => up.permission.name);
      }
    } else if (user.user_type === 'MERCHANT_OWNER' && user.merchant_id) {
      const merchant = await prisma.merchant.findUnique({
        where: { id: user.merchant_id }
      });
      if (merchant) {
        userInfo.role = 'MERCHANT_OWNER';
        userInfo.merchant_id = merchant.id;
        // 获取商户所有者权限
        const userPermissions = await prisma.userPermission.findMany({
          where: { user_id: user.id },
          include: { permission: true }
        });
        userInfo.permissions = userPermissions.map(up => up.permission.name);
      }
    }

    // 使用Object.freeze保护用户信息不被外部修改
    const frozenUserInfo = Object.freeze({
      ...userInfo,
      permissions: Object.freeze(userInfo.permissions || [])
    });

    // 将用户信息添加到请求对象中
    req.user = frozenUserInfo;
    
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    const errorResponse = internalError('认证过程中发生错误');
    res.status(errorResponse.code).json(errorResponse);
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