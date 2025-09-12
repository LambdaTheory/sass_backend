import { Router, Request, Response } from "express";
import { prisma } from "../utils//database";
import { authMiddleware, requireRole } from "../middleware";
import { success, badRequest, internalError, notFound } from "../utils/response";

const router = Router();

/**
 * 修改用户密码
 * POST /update-password
 */

router.put(
  "/update-password",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { userId, newPassword } = req.body;
    try {
      // 校验参数
      if (!userId || !newPassword) {
        const errorResponse = badRequest("用户ID和新密码不能为空");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 校验用户是否存在
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });
      if (!user) {
        const errorResponse = notFound("用户不存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 校验用户是否被禁用
      if (user.status !== 1) {
        const errorResponse = badRequest("用户已被禁用，无法修改密码");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 更新密码
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          password: newPassword,
        },
      });
      res.json(success({}, "修改用户密码成功"));
    } catch (error) {
      console.error("修改用户密码失败:", error);
      const errorResponse = internalError("修改用户密码失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

/**
 * 修改用户状态(禁用/启用)
 */

router.put(
  "/update-status",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { userId, status } = req.body;
    try {
      // 校验参数
      if (!userId || !status) {
        const errorResponse = badRequest("用户ID和状态不能为空");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 校验用户是否存在
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });
      if (!user) {
        const errorResponse = notFound("用户不存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 更新状态
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          status,
        },
      });
      res.json(success({}, "修改用户状态成功"));
    } catch (error) {
      console.error("修改用户状态失败:", error);
      const errorResponse = internalError("修改用户状态失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

export default router;