import { Response } from "express";
import { prisma } from "../utils/database";
import {
  sendSuccess,
  sendInternalError,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendUnauthorized,
} from "../utils/response";
import { AuthRequest } from "../types";
import { PlayerItemService } from "../services/player-item.service";
import { ItemRecordService } from "../services/item-record.service";
import { ShardingService } from "../services/sharding.service";
import {
  PermissionUtils,
  PermissionChecker,
  AuthUtils,
  ParamValidator,
  ResourceValidator,
  ITEM_PERMISSIONS,
} from "../utils/permission";

const shardingService = new ShardingService(prisma);
const playerItemService = new PlayerItemService(prisma, shardingService);
const itemRecordService = new ItemRecordService(prisma, shardingService);

/**
 * 玩家道具控制器
 * 负责处理玩家背包道具相关的HTTP请求
 */
export class PlayerItemController {
  /**
   * 获取用户背包道具列表
   * GET /player-items/list
   * 查询参数：
   * - merchant_id: 商户ID（必填）
   * - app_id: 应用ID（必填）
   * - player_id: 玩家ID（必填）
   * - item_id: 道具ID（可选，用于筛选特定道具）
   * - start_time: 开始时间戳（可选）
   * - end_time: 结束时间戳（可选）
   * - page: 页码（默认1）
   * - pageSize: 每页数量（默认20，最大200）
   */
  static async getPlayerItems(req: AuthRequest, res: Response) {
    const user = req.user;
    const merchant = (req as any).merchant; // 商户认证信息

    try {
      // 从请求体或查询参数中获取必要参数（支持POST和GET请求）
      const {
        merchant_id,
        app_id,
        player_id,
        item_id,
        start_time,
        end_time,
        page = "1",
        pageSize = "20",
      } = req.method === 'POST' ? req.body : req.query;

      let pagination: any;

      // 如果是商户认证请求，跳过用户权限检查
      if (merchant) {
        // 验证必填参数
        if (!app_id || !player_id) {
          return sendBadRequest(res, "app_id 和 player_id 是必填参数");
        }

        // 验证商户是否有权限访问该应用
        if (merchant_id && merchant_id !== merchant.id) {
          return sendBadRequest(res, "无权限访问指定商户的数据");
        }

        // 简单的分页参数验证
        const pageNum = parseInt(page as string, 10);
        const pageSizeNum = parseInt(pageSize as string, 10);
        
        if (isNaN(pageNum) || pageNum < 1) {
          return sendBadRequest(res, "page 参数必须为正整数");
        }
        
        if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 200) {
          return sendBadRequest(res, "pageSize 参数必须为1-200之间的整数");
        }

        pagination = {
          page: pageNum,
          pageSize: pageSizeNum,
          skip: (pageNum - 1) * pageSizeNum,
          take: pageSizeNum
        };
      } else {
        // 普通用户请求，使用统一权限校验方法
        const permissionCheck = await PermissionChecker.checkFullPermissions(
          user,
          {
            requiredMerchantId: merchant_id as string,
            appId: app_id as string,
            playerId: player_id as string,
            resource: ITEM_PERMISSIONS.VIEW.resource,
            action: ITEM_PERMISSIONS.VIEW.action,
            requiredParams: {
              params: { merchant_id, app_id, player_id },
              fields: ["merchant_id", "app_id", "player_id"],
            },
            pagination: { page: page as string, pageSize: pageSize as string },
          }
        );

        if (!permissionCheck.allowed) {
          return sendBadRequest(res, permissionCheck.message!);
        }

        pagination = permissionCheck.data!.pagination;
      }

      // 时间参数验证
      let startTime: number | undefined;
      let endTime: number | undefined;

      if (start_time) {
        startTime = parseInt(start_time as string, 10);
        if (isNaN(startTime)) {
          return sendBadRequest(res, "start_time 参数必须为有效的时间戳");
        }
      }

      if (end_time) {
        endTime = parseInt(end_time as string, 10);
        if (isNaN(endTime)) {
          return sendBadRequest(res, "end_time 参数必须为有效的时间戳");
        }
      }

      if (startTime && endTime && startTime > endTime) {
        return sendBadRequest(res, "start_time 不能大于 end_time");
      }

      // 查询玩家道具
      const finalMerchantId = merchant ? merchant.id : (merchant_id as string);
      const items = await playerItemService.getPlayerItems(
        finalMerchantId,
        app_id as string,
        player_id as string,
        startTime,
        endTime,
        item_id as string
      );

      // 手动分页处理
      const total = items.length;
      const offset = (pagination!.page - 1) * pagination!.pageSize;
      const paginatedItems = items.slice(offset, offset + pagination!.pageSize);

      const totalPages = Math.ceil(total / pagination!.pageSize);

      return sendSuccess(
        res,
        {
          items: paginatedItems,
          pagination: {
            page: pagination!.page,
            pageSize: pagination!.pageSize,
            total,
            totalPages,
            hasNext: pagination!.page < totalPages,
            hasPrev: pagination!.page > 1,
          },
        },
        "获取玩家背包道具列表成功"
      );
    } catch (error) {
      console.error("获取玩家背包道具列表失败:", error);
      return sendInternalError(res, "获取玩家背包道具列表失败");
    }
  }

  /**
   * 获取单个玩家道具详情
   * GET /player-items/:id
   * 路径参数：
   * - id: 道具ID
   * 查询参数：
   * - merchant_id: 商户ID（必填）
   * - app_id: 应用ID（必填）
   * - player_id: 玩家ID（必填）
   */
  static async getPlayerItemById(req: AuthRequest, res: Response) {
    const user = req.user;

    try {
      const { id } = req.params;
      const { merchant_id, app_id, player_id } = req.query;

      // 使用统一权限校验方法
      const permissionCheck = await PermissionChecker.checkFullPermissions(
        user,
        {
          requiredMerchantId: merchant_id as string,
          appId: app_id as string,
          playerId: player_id as string,
          resource: ITEM_PERMISSIONS.VIEW.resource,
          action: ITEM_PERMISSIONS.VIEW.action,
          requiredParams: {
            params: { merchant_id, app_id, player_id },
            fields: ["merchant_id", "app_id", "player_id"],
          },
        }
      );

      if (!permissionCheck.allowed) {
        return sendBadRequest(res, permissionCheck.message!);
      }

      // 查询所有玩家道具，然后筛选指定ID的道具
      const items = await playerItemService.getPlayerItems(
        merchant_id as string,
        app_id as string,
        player_id as string,
        undefined,
        undefined,
        undefined
      );

      const item = items.find((item) => item.id.toString() === id);

      if (!item) {
        return sendNotFound(res, "道具不存在");
      }

      return sendSuccess(res, { item }, "获取玩家道具详情成功");
    } catch (error) {
      console.error("获取玩家道具详情失败:", error);
      return sendInternalError(res, "获取玩家道具详情失败");
    }
  }

  /**
   * 发放道具给玩家
   * POST /player-items/grant
   * 请求体：
   * - merchant_id: 商户ID（管理员必填，商户角色可选）
   * - app_id: 应用ID（必填）
   * - player_id: 玩家ID（必填）
   * - item_id: 道具ID（必填）
   * - amount: 发放数量（必填，正整数）
   * - remark: 备注（可选）
   * 请求头：
   * - X-Idempotency-Key: 幂等性键（必填）
   */
  static async grantPlayerItem(req: AuthRequest, res: Response) {
    const user = req.user;
    const merchant = (req as any).merchant; // 商户认证信息

    try {
      // 获取幂等性键
      const idempotencyKey = req.headers["x-idempotency-key"] as string;
      if (!idempotencyKey) {
        return sendBadRequest(res, "缺少 X-Idempotency-Key");
      }

      // 从请求体中获取参数
      let { merchant_id, app_id, player_id, item_id, amount, remark } =
        req.body;
      console.log(req.body, "body");

      // 认证检查：支持用户认证或商户认证
      if (!user && !merchant) {
        return sendUnauthorized(res, "用户信息缺失");
      }

      // 如果是商户认证，跳过用户权限检查
      if (merchant) {
        // 验证必填参数
        if (!app_id || !player_id || !item_id) {
          return sendBadRequest(res, "app_id、player_id 和 item_id 是必填参数");
        }
        
        // 使用商户ID
        merchant_id = merchant.id;
      } else {
        // 普通用户请求，使用原有的权限检查逻辑
        // 根据用户角色处理merchant_id
        const merchantAccess = AuthUtils.getMerchantAccessPermission(
          user!,
          merchant_id
        );
        if (!merchantAccess.allowed) {
          return sendForbidden(res, merchantAccess.message || "权限不足");
        }

        // 使用权限检查返回的merchant_id（对于商户用户会自动使用其关联的merchant_id）
        merchant_id = merchantAccess.merchantId;

        // 权限检查
        if (
          !PermissionUtils.hasPermission(
            user!,
            ITEM_PERMISSIONS.GRANT.resource,
            ITEM_PERMISSIONS.GRANT.action
          )
        ) {
          return sendForbidden(res, "需要道具发放权限");
        }
      }

      // 基础参数验证
      const requiredFields = ["app_id", "player_id", "item_id", "amount"];
      const paramCheck = ParamValidator.validateRequired(
        { app_id, player_id, item_id, amount },
        requiredFields
      );
      if (!paramCheck.valid) {
        return sendBadRequest(res, paramCheck.message!);
      }

      // 验证应用是否属于当前商户
      const appValidation = await ResourceValidator.validateApp(
        app_id,
        merchant_id!
      );
      if (!appValidation.valid) {
        return sendBadRequest(res, appValidation.message!);
      }

      // 额外参数验证
      if (
        !amount ||
        typeof amount !== "number" ||
        amount <= 0 ||
        !Number.isInteger(amount)
      ) {
        return sendBadRequest(res, "amount 参数必填且必须为正整数");
      }

      if (remark !== undefined && typeof remark !== "string") {
        return sendBadRequest(res, "remark 参数必须为字符串");
      }

      // 调用服务层发放道具
      const result = await playerItemService.grantPlayerItem(
        {
          merchant_id,
          app_id,
          player_id,
          item_id,
          amount,
          remark,
        },
        idempotencyKey
      );

      if (!result.success) {
        return sendBadRequest(res, result.message);
      }

      return sendSuccess(
        res,
        {
          playerItem: result.playerItem,
          itemRecord: result.itemRecord,
        },
        result.message
      );
    } catch (error) {
      console.error("发放道具失败:", error);
      return sendInternalError(res, "发放道具失败");
    }
  }

  /**
   * 获取道具流水记录
   * GET /player-items/records
   * 查询参数：
   * - merchant_id: 商户ID（必填）
   * - app_id: 应用ID（必填）
   * - player_id: 玩家ID（可选）
   * - item_id: 道具ID（可选，不传则返回所有道具流水）
   * - record_type: 操作类型（可选，GRANT=派发，CONSUME=核销）
   * - start_time: 开始时间戳（可选）
   * - end_time: 结束时间戳（可选）
   * - page: 页码（默认1）
   * - pageSize: 每页数量（默认20，最大100）
   */
  static async getItemRecords(req: AuthRequest, res: Response) {
    const user = req.user;

    try {
      // 从查询参数中获取必要参数
      const {
        merchant_id,
        app_id,
        player_id,
        item_id,
        record_type,
        start_time,
        end_time,
        page = "1",
        pageSize = "20",
      } = req.query;

      // 使用统一权限校验方法
      const permissionCheck = await PermissionChecker.checkFullPermissions(
        user,
        {
          requiredMerchantId: merchant_id as string,
          appId: app_id as string,
          resource: ITEM_PERMISSIONS.VIEW.resource,
          action: ITEM_PERMISSIONS.VIEW.action,
          requiredParams: {
            params: { merchant_id, app_id },
            fields: ["merchant_id", "app_id"],
          },
          pagination: { page: page as string, pageSize: pageSize as string },
        }
      );

      if (!permissionCheck.allowed) {
        return sendBadRequest(res, permissionCheck.message!);
      }

      const { pagination } = permissionCheck.data!;

      // 时间参数验证
      let startTime: number | undefined;
      let endTime: number | undefined;

      if (start_time) {
        startTime = parseInt(start_time as string, 10);
        if (isNaN(startTime)) {
          return sendBadRequest(res, "start_time 参数必须为有效的时间戳");
        }
      }

      if (end_time) {
        endTime = parseInt(end_time as string, 10);
        if (isNaN(endTime)) {
          return sendBadRequest(res, "end_time 参数必须为有效的时间戳");
        }
      }

      if (startTime && endTime && startTime > endTime) {
        return sendBadRequest(res, "start_time 不能大于 end_time");
      }

      // 查询流水记录
      const result = await itemRecordService.getItemRecords(
        merchant_id as string,
        app_id as string,
        {
          playerId: player_id as string,
          itemId: item_id as string,
          recordType: record_type as 'GRANT' | 'CONSUME' | 'EXPIRE' | undefined,
          startTime,
          endTime,
          page: pagination!.page,
          pageSize: pagination!.pageSize,
        }
      );

      const totalPages = Math.ceil(result.total / pagination!.pageSize);

      return sendSuccess(
        res,
        {
          records: result.records,
          pagination: {
            page: pagination!.page,
            pageSize: pagination!.pageSize,
            total: result.total,
            totalPages,
            hasNext: pagination!.page < totalPages,
            hasPrev: pagination!.page > 1,
          },
        },
        "获取道具流水记录成功"
      );
    } catch (error) {
      console.error("获取道具流水记录失败:", error);
      return sendInternalError(res, "获取道具流水记录失败");
    }
  }

  /**
   * 消费玩家道具
   * POST /merchant/player-items/:id/consume
   * 路径参数：
   * - id: 道具ID
   * 请求体：
   * - merchant_id: 商户ID（商户认证时可选）
   * - app_id: 应用ID（必填）
   * - player_id: 玩家ID（必填）
   * - player_item_id: 道具记录ID（可选，用于指定消费特定的道具记录）
   * - amount: 消费数量（必填，正整数）
   * - remark: 备注（可选）
   * 请求头：
   * - X-Idempotency-Key: 幂等性键（必填）
   */
  static async consumePlayerItem(req: AuthRequest, res: Response) {
    const user = req.user;
    const merchant = (req as any).merchant; // 商户认证信息

    try {
      // 获取幂等性键
      const idempotencyKey = req.headers["x-idempotency-key"] as string;
      if (!idempotencyKey) {
        return sendBadRequest(res, "缺少 X-Idempotency-Key");
      }

      const { id: item_id } = req.params;
      let { merchant_id, app_id, player_id, amount, remark, player_item_id } = req.body;

      // 如果是商户认证请求，跳过用户权限检查
      if (merchant) {
        // 验证必填参数
        if (!app_id || !player_id || !amount) {
          return sendBadRequest(res, "app_id、player_id 和 amount 是必填参数");
        }

        // 验证商户是否有权限访问该应用
        if (merchant_id && merchant_id !== merchant.id) {
          return sendBadRequest(res, "无权限访问指定商户的数据");
        }

        // 使用商户ID
        merchant_id = merchant.id;
      } else {
        // 普通用户请求，进行权限检查
        if (!user) {
          return sendUnauthorized(res, "用户信息缺失");
        }

        // 根据用户角色处理merchant_id
        const merchantAccess = AuthUtils.getMerchantAccessPermission(
          user,
          merchant_id
        );
        if (!merchantAccess.allowed) {
          return sendForbidden(res, merchantAccess.message || "权限不足");
        }

        // 使用权限检查返回的merchant_id
        merchant_id = merchantAccess.merchantId;

        // 基础参数验证
        const requiredFields = ["app_id", "player_id", "amount"];
        const paramCheck = ParamValidator.validateRequired(
          { app_id, player_id, amount },
          requiredFields
        );
        if (!paramCheck.valid) {
          return sendBadRequest(res, paramCheck.message!);
        }

        // 权限检查
        if (
          !PermissionUtils.hasPermission(
            user,
            ITEM_PERMISSIONS.CONSUME.resource,
            ITEM_PERMISSIONS.CONSUME.action
          )
        ) {
          return sendForbidden(res, "需要道具消费权限");
        }

        // 验证应用是否属于当前商户
        const appValidation = await ResourceValidator.validateApp(
          app_id,
          merchant_id!
        );
        if (!appValidation.valid) {
          return sendBadRequest(res, appValidation.message!);
        }
      }

      // 额外参数验证
      if (
        !amount ||
        typeof amount !== "number" ||
        amount <= 0 ||
        !Number.isInteger(amount)
      ) {
        return sendBadRequest(res, "amount 参数必填且必须为正整数");
      }

      if (remark !== undefined && typeof remark !== "string") {
        return sendBadRequest(res, "remark 参数必须为字符串");
      }

      if (player_item_id !== undefined && (typeof player_item_id !== "number" || !Number.isInteger(player_item_id) || player_item_id <= 0)) {
        return sendBadRequest(res, "player_item_id 参数必须为正整数");
      }

      // 调用服务层消费道具
      const result = await playerItemService.consumePlayerItem(
        {
          merchant_id,
          app_id,
          player_id,
          item_id,
          player_item_id,
          amount,
          remark,
        },
        idempotencyKey
      );

      if (!result.success) {
        return sendBadRequest(res, result.message);
      }

      return sendSuccess(
        res,
        {
          playerItem: result.playerItem,
          itemRecord: result.itemRecord,
        },
        result.message
      );
    } catch (error) {
      console.error("消费道具失败:", error);
      return sendInternalError(res, "消费道具失败");
    }
  }
}
