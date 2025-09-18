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

// 商户信息接口
export interface MerchantInfo {
  id: string;
  name: string;
  status: number;
  public_key?: string;
  key_status: number;
}

// 商户认证请求接口
export interface MerchantAuthRequest extends Request {
  merchant?: {
    id: string;
  };
}

// 密钥对接口
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

// 签名验证结果接口
export interface SignatureVerificationResult {
  success: boolean;
  merchantId?: string;
  error?: string;
}

// 签名payload接口
export interface SignaturePayload {
  merchant_id: string;
  timestamp: number;
  method: string;
  path: string;
  body_hash: string;
}

// 商户密钥管理接口
export interface MerchantKeyManagement {
  generateKeyPair(): KeyPair;
  generateMerchantKeys(merchantId: string): Promise<KeyPair>;
  getMerchantPublicKey(merchantId: string): Promise<string | null>;
  verifySignature(
    signature: string,
    timestamp: number,
    method: string,
    path: string,
    body: any
  ): Promise<SignatureVerificationResult>;
  disableMerchantKey(merchantId: string): Promise<void>;
  rotateMerchantKeys(merchantId: string): Promise<KeyPair>;
}