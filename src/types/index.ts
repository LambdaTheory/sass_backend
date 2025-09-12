import { Request } from 'express';
import { UserType } from '@prisma/client';

// 用户信息接口
export interface UserInfo {
  id: string;
  username: string;
  user_type: UserType;
  role?: string;
  merchant_id?: string;
  super_admin_id?: string;
  status: number;
  permissions?: readonly string[];
}

// 扩展的Request接口，包含用户信息
export interface AuthRequest extends Request {
  user?: UserInfo;
}

// 登录请求接口
export interface LoginRequest {
  username: string;
  password: string;
}

// 权限检查选项
export interface PermissionCheckOptions {
  resource: string;
  action: string;
  requireAll?: boolean; // 是否需要所有权限都满足
}

// JWT载荷接口
export interface JWTPayload {
  userId: string;
  username: string;
  userType: UserType;
  role?: string;
  merchantId?: string;
  iat?: number;
  exp?: number;
}