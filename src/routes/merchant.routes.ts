import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware";
import { MerchantController } from "../controllers/merchant.controller";

const router: Router = Router();

/**
 * 商户列表
 * GET /list
 */
router.get(
  "/list",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  MerchantController.getMerchantList
);

/**
 * 创建商户
 * POST /create
 */
router.post(
  "/create",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  MerchantController.createMerchant
);

/**
 * 更新商户状态
 * PUT /status
 */
router.put(
  "/status",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  MerchantController.updateMerchantStatus
);

/**
 * 编辑商户信息
 * PUT /:merchantId
 */
router.put(
  "/:merchantId",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  MerchantController.updateMerchant
);

/**
 * 删除商户
 * DELETE /:merchantId
 */
// router.delete(
//   "/:merchantId",
//   authMiddleware,
//   requireRole(["SUPER_ADMIN"]),
//   MerchantController.deleteMerchant
// );

/**
 * 生成商户密钥对
 * POST /:merchantId/keys/generate
 */
router.post(
  "/:merchantId/keys/generate",
  authMiddleware,
  MerchantController.generateMerchantKeys
);

/**
 * 获取商户公钥（供C端使用，无需认证）
 * GET /:merchantId/public-key
 */
router.get(
  "/:merchantId/public-key",
  MerchantController.getMerchantPublicKey
);

/**
 * 获取商户密钥信息（管理端使用）
 * GET /:merchantId/keys/info
 */
router.get(
  "/:merchantId/keys/info",
  authMiddleware,
  MerchantController.getMerchantKeyInfo
);

export default router;
