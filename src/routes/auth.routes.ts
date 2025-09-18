import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { LoginRequest, JWTPayload } from "../types";
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
import { authMiddleware } from "../middleware";
import { validateToken } from "../services/auth.service";

// 扩展Request类型以包含user属性
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const router = Router();

/**
 * 用户登录
 * POST /auth/login
 */
router.post(
  "/login",
  async (req: Request<{}, {}, LoginRequest>, res: Response) => {
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

      // 用户名格式验证（支持传统用户名和邮箱格式）
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      const usernameRegex = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;

      if (
        !emailRegex.test(cleanUsername) &&
        !usernameRegex.test(cleanUsername)
      ) {
        return sendBadRequest(res, "用户名格式不正确，请使用有效的用户名或邮箱地址");
      }

      // 密码长度验证
      if (password.length < 6 || password.length > 128) {
        return sendBadRequest(res, "密码长度必须在6-128个字符之间");
      }

      // 查找用户
      const user = await prisma.user.findUnique({
        where: { username: cleanUsername },
      });

      if (!user || user.status !== 1) {
        return sendUnauthorized(res, "商户已被禁用");
      }

      // 验证密码（现在密码统一存储在User表中）
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return sendUnauthorized(res, "用户名或密码错误");
      }

      // 根据用户类型获取角色和商户信息
      let userRole: string;
      let merchantId: string | undefined;

      if (user.user_type === "SUPER_ADMIN") {
        // 验证超管记录是否存在且有效
        if (!user.super_admin_id) {
          return sendUnauthorized(res, "用户名或密码错误");
        }
        const superAdmin = await prisma.superAdmin.findUnique({
          where: { id: user.super_admin_id },
        });
        if (!superAdmin) {
          return sendUnauthorized(res, "用户名或密码错误");
        }
        userRole = "SUPER_ADMIN";
      } else if (user.user_type === "MERCHANT_OWNER") {
        // 商户所有者登录
        if (user.merchant_id) {
          const merchant = await prisma.merchant.findUnique({
            where: { id: user.merchant_id },
          });
          if (!merchant || merchant.status !== 1) {
            return sendUnauthorized(res, "商户已被禁用");
          }
          userRole = "MERCHANT_OWNER";
          merchantId = merchant.id;
        } else {
          return sendUnauthorized(res, "用户名或密码错误");
        }
      } else {
        return sendUnauthorized(res, "用户名或密码错误");
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
        userType: user.user_type,
        role: userRole as any,
        merchantId,
      };

      const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });

      sendSuccess(res, {
        token,
        user: {
          id: user.id,
          username: user.username,
          merchantId,
        },
      }, "登录成功");
    } catch (error) {
      console.error("登录错误:", error);
      sendInternalError(res, "登录过程中发生错误");
    }
  }
);

/**
 * 验证token有效性
 * GET /auth/verify
 */
router.get("/verify", async (req: Request, res: Response) => {
  try {
    // 使用认证服务验证token
    const result = await validateToken(req.headers.authorization);
    
    if (!result.success) {
      return sendUnauthorized(res, result.error!.message);
    }

    // 返回验证成功的响应
    sendSuccess(res, {
      valid: true,
      user: {
        id: result.decoded!.userId,
        username: result.decoded!.username,
        userType: result.decoded!.userType,
        role: result.decoded!.role,
        merchantId: result.decoded!.merchantId,
        merchantName: result.merchant?.name,
      },
    }, "token验证成功");
  } catch (error) {
    console.error("token验证错误:", error);
    sendInternalError(res, "验证过程中发生错误");
  }
});

/**
 * 验证权限或者角色
 */
router.post(
  "/verify-permission",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { role, permissions, requireAll } = req.body;
      const isRoleValid = role ? user.role === role : true;
      const isIncluedPermission = permissions?.length
        ? permissions.every((p: string) => user.permissions?.includes(p))
        : true;
      let isVaild = false;
      if (requireAll) {
        isVaild = isRoleValid && isIncluedPermission;
      } else {
        isVaild = isRoleValid || isIncluedPermission;
      }
      if (isVaild) {
        sendSuccess(res, null, "权限验证成功");
      } else {
        sendUnauthorized(res, "权限验证失败");
      }
    } catch (error) {
      console.error("验证权限错误:", error);
      sendInternalError(res, "验证过程中发生错误");
    }
  }
);

/**
 * 用户登出（可选实现，主要用于清理客户端token）
 * POST /auth/logout
 */
router.post("/logout", (req: Request, res: Response) => {
  // 由于JWT是无状态的，服务端登出主要是告知客户端清理token
  // 如果需要实现token黑名单，可以在这里添加相关逻辑
  sendSuccess(res, null, "登出成功");
});

export default router;
