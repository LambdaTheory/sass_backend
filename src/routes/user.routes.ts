import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware";
import { UserController } from "../controllers/user.controller";

const router: Router = Router();

/**
 * 修改用户密码
 * PUT /update-password
 */
router.put(
  "/update-password",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  UserController.updatePassword
);

/**
 * 更新用户状态
 * PUT /update-status
 */
router.put(
  "/update-status",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  UserController.updateStatus
);

export default router;