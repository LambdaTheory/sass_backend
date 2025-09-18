import { Request, Response } from "express";
import { prisma } from "../utils/database";
import {
  success,
  badRequest,
  internalError,
  notFound,
  sendSuccess,
  sendBadRequest,
  sendInternalError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden
} from "../utils/response";
import bcrypt from "bcrypt";
import { AuthRequest } from "../types";
import { AuthUtils, PermissionChecker } from "../utils/permission";

/**
 * 用户控制器
 * 负责处理用户相关的HTTP请求
 */
export class UserController {
  /**
   * 修改用户密码
   */
  static async updatePassword(req: AuthRequest, res: Response) {
    const currentUser = req.user;
    const { userId, newPassword } = req.body;
    
    try {
      // 用户认证检查
      if (!currentUser) {
        return sendUnauthorized(res, "用户未认证");
      }

      // 权限检查：只有超级管理员或用户本人可以修改密码
      if (!AuthUtils.isSuperAdmin(currentUser) && currentUser.id !== userId) {
        return sendForbidden(res, "权限不足，只能修改自己的密码");
      }

      // 校验参数
      if (!userId || !newPassword) {
        return sendBadRequest(res, "用户ID和新密码不能为空");
      }

      // 校验用户是否存在
      const targetUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!targetUser) {
        return sendNotFound(res, "用户不存在");
      }

      // 校验用户是否被禁用
      if (targetUser.status !== 1) {
        return sendBadRequest(res, "用户已被禁用，无法修改密码");
      }

      // 密码加密
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // 更新密码
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          password: hashedPassword,
          updated_at: BigInt(Date.now()),
        },
      });

      sendSuccess(res, null, "密码修改成功");
    } catch (error) {
      console.error("修改密码失败:", error);
      sendInternalError(res, "修改密码失败");
    }
  }

  /**
   * 更新用户状态
   */
  static async updateStatus(req: AuthRequest, res: Response) {
    const currentUser = req.user;
    const { userId, status } = req.body;
    
    try {
      // 用户认证检查
      if (!currentUser) {
        return sendUnauthorized(res, "用户未认证");
      }

      // 权限检查：只有超级管理员可以更新用户状态
      if (!AuthUtils.isSuperAdmin(currentUser)) {
        return sendForbidden(res, "权限不足，只有超级管理员可以更新用户状态");
      }

      // 校验参数
      if (!userId || status === undefined) {
        return sendBadRequest(res, "用户ID和状态不能为空");
      }

      // 校验状态值
      if (![0, 1].includes(status)) {
        return sendBadRequest(res, "状态值无效，只能是0或1");
      }

      // 校验用户是否存在
      const targetUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!targetUser) {
        return sendNotFound(res, "用户不存在");
      }

      // 更新用户状态
      const updatedUser = await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          status,
          updated_at: BigInt(Date.now()),
        },
        select: {
          id: true,
          username: true,
          status: true,
          user_type: true,
          merchant_id: true,
        },
      });

      sendSuccess(res, updatedUser, "用户状态更新成功");
    } catch (error) {
      console.error("更新用户状态失败:", error);
      sendInternalError(res, "更新用户状态失败");
    }
  }
}