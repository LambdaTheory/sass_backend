import jwt from "jsonwebtoken";
import { JWTPayload, UserInfo } from "../types";
import { prisma } from "../utils/database";

/**
 * Token验证结果接口
 */
export interface TokenValidationResult {
  success: boolean;
  error?: {
    code: number;
    message: string;
  };
  decoded?: JWTPayload;
  user?: any;
  merchant?: any;
}

/**
 * 用户信息获取结果接口
 */
export interface UserInfoResult {
  success: boolean;
  error?: {
    code: number;
    message: string;
  };
  userInfo?: UserInfo;
}

/**
 * 从请求头中提取并验证JWT token
 * @param authHeader Authorization请求头
 * @returns Token验证结果
 */
export const validateToken = async (
  authHeader: string | undefined
): Promise<TokenValidationResult> => {
  // 检查Authorization header格式
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: {
        code: 401,
        message: "未提供有效的认证token",
      },
    };
  }

  const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

  // 检查JWT_SECRET环境变量
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("JWT_SECRET 环境变量未设置");
    return {
      success: false,
      error: {
        code: 500,
        message: "服务器配置错误",
      },
    };
  }

  try {
    // 验证JWT token
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // 从数据库获取用户基本信息
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    let merchant: any = null;
    const role = user?.user_type;
    if (role !== "SUPER_ADMIN") {
      merchant = await prisma.merchant.findUnique({
        where: { id: decoded.merchantId },
      });
      if (!merchant || merchant.status !== 1) {
        return {
          success: false,
          error: {
            code: 401,
            message: " 商户不存在或已被禁用",
          },
        };
      }
    }
    // 检查用户是否存在且状态有效
    if (!user || user.status !== 1) {
      return {
        success: false,
        error: {
          code: 401,
          message: "用户不存在或已被禁用",
        },
      };
    }

    return {
      success: true,
      decoded,
      user,
      merchant,
    };
  } catch (jwtError) {
    return {
      success: false,
      error: {
        code: 401,
        message: "token无效或已过期",
      },
    };
  }
};

/**
 * 获取完整的用户信息（包括权限）
 * @param user 基础用户信息
 * @returns 完整用户信息结果
 */
export const getUserInfo = async (user: any): Promise<UserInfoResult> => {
  try {
    // 构建基础用户信息
    let userInfo: UserInfo = {
      id: user.id,
      username: user.username,
      user_type: user.user_type,
      status: user.status,
      permissions: [],
    };

    // 根据用户类型补充信息和权限
    if (user.user_type === "SUPER_ADMIN" && user.super_admin_id) {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: user.super_admin_id },
      });
      if (superAdmin) {
        userInfo.role = "SUPER_ADMIN";
        userInfo.super_admin_id = superAdmin.id;
        // 获取超级管理员权限
        const userPermissions = await prisma.userPermission.findMany({
          where: { user_id: user.id },
          include: { permission: true },
        });
        userInfo.permissions = userPermissions.map((up) => up.permission.name);
      }
    } else if (user.user_type === "MERCHANT_OWNER" && user.merchant_id) {
      const merchant = await prisma.merchant.findUnique({
        where: { id: user.merchant_id },
      });
      if (merchant) {
        userInfo.role = "MERCHANT_OWNER";
        userInfo.merchant_id = merchant.id;
        // 获取商户所有者权限
        const userPermissions = await prisma.userPermission.findMany({
          where: { user_id: user.id },
          include: { permission: true },
        });
        userInfo.permissions = userPermissions.map((up) => up.permission.name);
      }
    }

    return {
      success: true,
      userInfo,
    };
  } catch (error) {
    console.error("获取用户信息错误:", error);
    return {
      success: false,
      error: {
        code: 500,
        message: "获取用户信息过程中发生错误",
      },
    };
  }
};

/**
 * 完整的token验证和用户信息获取
 * @param authHeader Authorization请求头
 * @returns 用户信息结果
 */
export const validateTokenAndGetUserInfo = async (
  authHeader: string | undefined
): Promise<UserInfoResult> => {
  // 验证token
  const tokenResult = await validateToken(authHeader);
  if (!tokenResult.success) {
    return {
      success: false,
      error: tokenResult.error,
    };
  }

  // 获取完整用户信息
  return await getUserInfo(tokenResult.user);
};
