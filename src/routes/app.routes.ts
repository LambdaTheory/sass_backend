import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware";
import { AppController } from "../controllers/app.controller";

const router: Router = Router();

/**
 * 创建应用
 * POST /create
 */
router.post(
  "/create",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  AppController.createApp
);

/**
 * 查询商户下的应用列表
 * GET /list
 */
router.get(
  "/list",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  AppController.getAppList
);

/**
 * 获取应用统计信息
 * GET /:id/stat
 */
router.get(
  "/:id/stat",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  AppController.getAppStat
);

/**
 * 更新应用
 * PUT /update/:id
 */
router.put(
  "/update/:id",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  AppController.updateApp
);

export default router;
