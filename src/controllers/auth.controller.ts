import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { LoginRequest, JWTPayload, AuthRequest } from "../types";
import { prisma } from "../utils/database";
import {
  success,
  badRequest,
  unauthorized,
  internalError,
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendInternalError,
} from "../utils/response";
import { validateToken } from "../services/auth.service";
import { AuthUtils, PermissionChecker } from "../utils/permission";

/**
 * 认证控制器
 * 负责处理用户认证相关的HTTP请求
 */
export class AuthController {
  /**
   * 用户登录
   */
  static async login(req: Request<{}, {}, LoginRequest>, res: Response) {
    try {
      const { username, password } = req.body;

      // 输入验证
      if (!username || !password) {
        return sendBadRequest(res, "用户名和密码不能为空");
      }

      // 清理和验证用户名
      const cleanUsername = username.toString().trim();
      if (cleanUsername.length < 3 || cleanUsername.length > 100) {
        return sendBadRequest(res, "用户名长度必须在3-100个字符之间");
      }

      // 查找用户
      const user = await prisma.user.findUnique({
        where: { username: cleanUsername },
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          superAdmin: true,
        },
      });

      if (!user) {
        return sendUnauthorized(res, "用户名或密码错误");
      }

      // 验证密码
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return sendUnauthorized(res, "用户名或密码错误");
      }

      // 检查用户状态
      if (user.status !== 1) {
        return sendUnauthorized(res, "用户账户已被禁用");
      }

      // 确定用户类型
      let userType: string;
      let merchantId: string | null = null;

      if (user.superAdmin) {
        userType = "SUPER_ADMIN";
      } else if (user.merchant) {
        userType = "MERCHANT_OWNER";
        merchantId = user.merchant.id;

        // 检查商户状态
        if (user.merchant.status !== 1) {
          return sendUnauthorized(res, "所属商户已被禁用");
        }
      } else {
        return sendUnauthorized(res, "用户类型无效");
      }

      // 生成JWT token
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("JWT_SECRET 环境变量未设置");
        return sendInternalError(res, "服务器配置错误");
      }

      const payload: JWTPayload = {
        userId: user.id,
        username: user.username,
        userType: userType as any,
        merchantId: merchantId || undefined,
      };

      const token = jwt.sign(payload, jwtSecret, {
        expiresIn: "24h",
      });

      // 返回成功响应
      const responseData = {
        token,
        user: {
          id: user.id,
          username: user.username,
          user_type: userType,
          merchant_id: merchantId,
          merchant_name: user.merchant?.name || null,
        },
      };

      sendSuccess(res, responseData, "登录成功");
    } catch (error) {
      console.error("登录失败:", error);
      sendInternalError(res, "登录过程中发生错误");
    }
  }

  /**
   * 验证token
   */
  static async verify(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return sendUnauthorized(res, "缺少有效的认证令牌");
      }

      const token = authHeader.substring(7);
      const result = await validateToken(token);

      if (!result.success || !result.user) {
        return sendUnauthorized(res, result.error?.message || "令牌无效");
      }

      const responseData = {
        user: {
          id: result.user.id,
          username: result.user.username,
          user_type: result.user.user_type,
          merchant_id: result.user.merchant_id,
          merchant_name: result.user.merchant_name,
        },
      };

      sendSuccess(res, responseData, "令牌验证成功");
    } catch (error) {
      console.error("验证令牌失败:", error);
      sendInternalError(res, "验证过程中发生错误");
    }
  }

  /**
   * 验证权限
   */
  static async verifyPermission(req: AuthRequest, res: Response) {
    try {
      const { resource, action, merchant_id, app_id } = req.body;
      const user = req.user;

      if (!resource || !action) {
        return sendBadRequest(res, "资源和操作不能为空");
      }

      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      // 使用统一的权限校验方法
        const permissionCheck = await PermissionChecker.checkFullPermissions(user, {
          resource,
          action,
          requiredMerchantId: merchant_id,
          appId: app_id
        });

      const responseData = { 
        hasPermission: permissionCheck.allowed,
        message: permissionCheck.message
      };
      
      sendSuccess(res, responseData, "权限验证完成");
    } catch (error) {
      console.error("权限验证失败:", error);
      sendInternalError(res, "权限验证过程中发生错误");
    }
  }

  /**
   * 用户登出
   */
  static async logout(req: Request, res: Response) {
    // 由于使用JWT，登出主要在客户端处理（删除token）
    // 这里只返回成功响应
    sendSuccess(res, null, "登出成功");
  }
}