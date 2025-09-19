import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { ItemTemplateController } from '../controllers/item-template.controller';

const router: Router = Router();

/**
 * 获取道具模板列表
 * GET /item-templates
 * 权限要求：item_template_read
 * 查询参数：
 * - merchant_id: 商户ID（必填）
 * - app_id: 应用ID（必填）
 * - page: 页码（默认1）
 * - current: 页码（page的别名，默认1）
 * - pageSize: 每页数量（默认20，最大200）
 * - item_type: 道具类型（可选，模糊匹配）
 * - item_name: 道具名称（可选，模糊匹配）
 * - is_active: 是否激活（可选，ACTIVE/INACTIVE）
 * - status: 状态（可选，NORMAL/EXPIRED/PENDING_DELETE/DELETED）
 * - id: 道具模板ID（可选，精确匹配）
 */
router.get(
  '/list',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'read' }),
  ItemTemplateController.getItemTemplates
);

/**
 * 获取单个道具模板详情
 * GET /item-templates/:id
 * 权限要求：item_template_read
 * 路径参数：
 * - id: 道具模板ID
 * 查询参数：
 * - merchant_id: 商户ID（超级管理员必须提供）
 */
router.get(
  '/:id',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'read' }),
  ItemTemplateController.getItemTemplateById
);

/**
 * 获取道具模板统计信息
 * GET /item-templates/stats
 * 权限要求：item_template_read
 * 查询参数：
 * - merchant_id: 商户ID（超级管理员必须提供）
 * - app_id: 应用ID（可选，筛选指定应用下的统计）
 */
router.get(
  '/stats',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'read' }),
  ItemTemplateController.getItemTemplateStats
);

/**
 * @swagger
 * /item-templates:
 *   post:
 *     summary: 创建道具模板
 *     tags: [ItemTemplate]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchant_id
 *               - app_id
 *               - item_name
 *               - item_type
 *             properties:
 *               merchant_id:
 *                 type: string
 *                 description: 商户ID
 *               app_id:
 *                 type: string
 *                 description: 应用ID
 *               item_name:
 *                 type: string
 *                 description: 道具名称
 *               item_type:
 *                 type: string
 *                 description: 道具类型
 *               item_icon:
 *                 type: string
 *                 description: 道具图标URL（可选）
 *               eff_arg:
 *                 type: string
 *                 description: 效果参数JSON字符串（可选，默认{}）
 *               is_active:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *                 description: 是否激活（可选，默认ACTIVE）
 *               status:
 *                 type: string
 *                 enum: [NORMAL, EXPIRED, PENDING_DELETE, DELETED]
 *                 description: 生命周期状态（可选，默认NORMAL）
 *               expire_duration:
                 type: integer
                 description: 过期时长（小时，可选）
 *               expire_date:
 *                 type: integer
 *                 description: 过期时间戳（可选）
 *               limit_max:
 *                 type: integer
 *                 description: 最大限制数量（可选）
 *               daily_limit_max:
 *                 type: integer
 *                 description: 每日最大限制数量（可选）
 *               total_limit:
 *                 type: integer
 *                 description: 总限制数量（可选）
 *               custom:
 *                 type: string
 *                 description: 自定义数据JSON字符串（可选）
 */
router.post(
  '/create',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'create' }),
  ItemTemplateController.createItemTemplate
);

/**
 * 更新道具模板
 * PUT /item-templates/:id
 * 权限要求：item_template_update
 * 路径参数：
 * - id: 道具模板ID
 * 查询参数：
 * - merchant_id: 商户ID（超级管理员必须提供）
 * 请求体参数（所有参数都是可选的）：
 * - item_name: 道具名称
 * - item_type: 道具类型
 * - item_icon: 道具图标URL
 * - eff_arg: 效果参数JSON字符串
 * - is_active: 是否激活（ACTIVE/INACTIVE）
 * - status: 生命周期状态（NORMAL/EXPIRED/PENDING_DELETE/DELETED）
 * - expire_duration: 过期时长（小时）
 * - expire_date: 过期时间戳
 * - limit_max: 最大限制数量
 * - daily_limit_max: 每日最大限制数量
 * - total_limit: 总限制数量
 * - custom: 自定义数据JSON字符串
 */
router.put(
  '/:id',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'update' }),
  ItemTemplateController.updateItemTemplate
);

/**
 * 删除道具模板（软删除）
 * DELETE /item-templates/:id
 * 权限要求：item_template_delete
 * 路径参数：
 * - id: 道具模板ID
 * 查询参数：
 * - merchant_id: 商户ID（超级管理员必须提供）
 */
router.delete(
  '/:id',
  authMiddleware,
  requirePermission({ resource: 'item_template', action: 'delete' }),
  ItemTemplateController.deleteItemTemplate
);

export default router;