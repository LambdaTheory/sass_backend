import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermissionAndMerchantAccess } from "../middleware/permission.middleware";
import { PlayerItemController } from "../controllers/player-item.controller";
import { AuthRequest } from "../types";

const router = Router();

/**
 * 获取用户背包道具列表
 * GET /player-items
 * 权限要求：player_item_read
 * 查询参数：
 * - merchant_id: 商户ID（必填）
 * - app_id: 应用ID（必填）
 * - player_id: 玩家ID（必填）
 * - start_time: 开始时间戳（可选）
 * - end_time: 结束时间戳（可选）
 * - page: 页码（默认1）
 * - pageSize: 每页数量（默认20，最大100）
 * 
 * 返回字段：
 * - id: 道具记录ID
 * - merchant_id: 商户ID
 * - app_id: 应用ID
 * - player_id: 玩家ID
 * - item_id: 道具模板ID
 * - item_name: 道具名称
 * - amount: 道具数量
 * - expire_time: 过期时间戳（null表示永不过期）
 * - obtain_time: 获得时间戳
 * - status: 道具状态（USABLE/UNUSABLE）
 * - latest_idempotency_key: 最新操作的幂等性键（用于消费接口）
 */
router.get(
  "/list",
  authMiddleware,
  requirePermissionAndMerchantAccess(
    { resource: "player_item", action: "read" },
    (req: AuthRequest) => req.query.merchant_id as string
  ),
  PlayerItemController.getPlayerItems
);

/**
 * 发放道具给玩家
 * POST /player-items/grant
 * 权限要求：item_grant
 * 请求头：
 * - X-Idempotency-Key: 幂等性键（必填）
 * 请求体：
 * - merchant_id: 商户ID（必填）
 * - app_id: 应用ID（必填）
 * - player_id: 玩家ID（必填）
 * - item_id: 道具ID（必填）
 * - amount: 发放数量（必填，正整数）

 * - remark: 备注（可选）
 */
router.post(
  "/grant",
  authMiddleware,
  requirePermissionAndMerchantAccess(
    { resource: "item", action: "grant" },
    (req: AuthRequest) => req.body.merchant_id as string
  ),
  PlayerItemController.grantPlayerItem
);

/**
 * 获取道具流水记录
 * GET /player-items/records
 * 权限要求：player_item_read
 * 查询参数：
 * - merchant_id: 商户ID（必填）
 * - app_id: 应用ID（必填）
 * - player_id: 玩家ID（可选）
 * - item_id: 道具ID（可选）
 * - record_type: 操作类型（可选，GRANT=派发，CONSUME=核销，EXPIRE=过期）
 * - start_time: 开始时间戳（可选）
 * - end_time: 结束时间戳（可选）
 * - page: 页码（默认1）
 * - pageSize: 每页数量（默认20，最大100）
 */
router.get(
  "/records",
  authMiddleware,
  requirePermissionAndMerchantAccess(
    { resource: "player_item", action: "read" },
    (req: AuthRequest) => req.query.merchant_id as string
  ),
  PlayerItemController.getItemRecords
);

/**
 * 获取单个玩家道具详情
 * GET /player-items/:id
 * 权限要求：player_item_read
 * 路径参数：
 * - id: 道具ID
 * 查询参数：
 * - merchant_id: 商户ID（必填）
 * - app_id: 应用ID（必填）
 * - player_id: 玩家ID（必填）
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermissionAndMerchantAccess(
    { resource: "player_item", action: "read" },
    (req: AuthRequest) => req.query.merchant_id as string
  ),
  PlayerItemController.getPlayerItemById
);

export default router;
