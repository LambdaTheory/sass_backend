import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware";
import { MerchantStatisticsController } from "../controllers/merchant-statistics.controller";

const router: Router = Router();

/**
 * 商户统计数据管理路由
 * 需要管理员认证
 */

/**
 * 获取应用道具统计
 * GET /app/:appId/items
 */
router.get(
  "/app/:appId/items",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  MerchantStatisticsController.getItemStatistics
);

/**
 * 获取单个道具详细统计
 * GET /app/:appId/item/:itemId
 */
router.get(
  "/app/:appId/item/:itemId",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  MerchantStatisticsController.getItemDetailStatistics
);

/**
 * 获取应用概览统计
 * GET /app/:appId/overview
 */
router.get(
  "/app/:appId/overview",
  authMiddleware,
  requireRole(["SUPER_ADMIN", "MERCHANT_OWNER"]),
  MerchantStatisticsController.getOverviewStatistics
);

export default router;
