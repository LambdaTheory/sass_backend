import { Router } from 'express';
import { PlayerItemController } from '../controllers/player-item.controller';
import { merchantAuthMiddleware, validateMerchantAppAccess, MerchantAuthRequest } from '../middleware/merchant-auth.middleware';

const router: Router = Router();

/**
 * C端商户专用的道具接口路由
 * 使用商户签名认证，无需传统的JWT token
 */

/**
 * 获取玩家道具列表
 * POST /merchant/player-items/query
 * 认证方式：商户签名
 * 
 * 请求体参数：
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
router.post(
  '/query',
  merchantAuthMiddleware,
  validateMerchantAppAccess(),
  PlayerItemController.getPlayerItems
);

/**
 * 发放道具给玩家
 * POST /merchant/player-items/grant
 * 认证方式：商户签名
 */
router.post(
  '/grant',
  merchantAuthMiddleware,
  validateMerchantAppAccess(),
  PlayerItemController.grantPlayerItem
);

/**
 * 获取道具流水记录
 * GET /player-items/records
 * 认证方式：商户签名
 * 注意：此功能需要实现对应的控制器方法
 */
// router.get(
//   '/records',
//   merchantAuthMiddleware,
//   validateMerchantAppAccess(),
//   PlayerItemController.getPlayerItemRecords
// );

/**
 * 获取单个玩家道具详情
 * GET /merchant/player-items/:id
 * 认证方式：商户签名
 */
router.get(
  '/:id',
  merchantAuthMiddleware,
  validateMerchantAppAccess(),
  PlayerItemController.getPlayerItemById
);

/**
 * 消费玩家道具
 * POST /merchant/player-items/:id/consume
 * 认证方式：商户签名
 */
router.post(
  '/:id/consume',
  merchantAuthMiddleware,
  validateMerchantAppAccess(),
  PlayerItemController.consumePlayerItem
);

export { router as cPlayerItemRoutes };