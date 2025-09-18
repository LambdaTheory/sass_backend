import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MerchantStatisticsService } from '../services/merchant-statistics.service';
import { ShardingService } from '../services/sharding.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';

const prisma = new PrismaClient();
const shardingService = new ShardingService(prisma);
const merchantStatisticsService = new MerchantStatisticsService(prisma, shardingService);

export class MerchantStatisticsController {
  /**
   * 获取应用道具统计
   * GET /app/:appId/items
   * 路径参数:
   * - appId: 应用ID (必需)
   * Query参数:
   * - start_time: 开始时间戳 (可选)
   * - end_time: 结束时间戳 (可选)
   * - merchant_id: 商户ID (管理员查询时必需)
   * 
   * 返回数据包含:
   * - items: 详细道具列表，每个道具包含：道具ID、道具名称、已发放量、消耗量、剩余库存、使用率
   */
  static async getItemStatistics(req: AuthRequest, res: Response) {
    try {
      const { appId } = req.params;
      const { start_time, end_time } = req.query;
      const app_id = appId;
      
      // 验证用户权限并获取商户ID
      let merchantId: string;
      
      if (req.user?.user_type === 'SUPER_ADMIN') {
        // 超级管理员可以查询任意商户，需要从参数中获取merchant_id
        const queryMerchantId = req.query.merchant_id as string;
        if (!queryMerchantId) {
          return sendError(res, '管理员查询需要提供 merchant_id 参数', 400);
        }
        merchantId = queryMerchantId;
      } else if (req.user?.merchant_id) {
        // 商户用户只能查询自己的数据
        merchantId = req.user.merchant_id;
      } else {
        return sendError(res, '无权限访问', 403);
      }

      // 参数验证
      if (!app_id || typeof app_id !== 'string') {
        return sendError(res, 'app_id 参数是必需的', 400);
      }

      // 验证应用是否属于该商户
      const app = await prisma.app.findFirst({
        where: {
          id: app_id,
          merchant_id: merchantId,
          status: 1
        }
      });

      if (!app) {
        return sendError(res, '应用不存在或无权限访问', 404);
      }

      // 时间参数验证和转换
      let startTime: number | undefined;
      let endTime: number | undefined;

      if (start_time) {
        startTime = parseInt(start_time as string);
        if (isNaN(startTime)) {
          return sendError(res, 'start_time 必须是有效的时间戳', 400);
        }
      }

      if (end_time) {
        endTime = parseInt(end_time as string);
        if (isNaN(endTime)) {
          return sendError(res, 'end_time 必须是有效的时间戳', 400);
        }
      }

      // 时间范围验证
      if (startTime && endTime && startTime > endTime) {
        return sendError(res, '开始时间不能大于结束时间', 400);
      }

      // 获取统计数据
      const statistics = await merchantStatisticsService.getAppItemStatistics(
        merchantId,
        app_id,
        startTime,
        endTime
      );

      // 为每个道具添加使用率计算
      const itemsWithUsageRate = statistics.items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        total_granted: item.total_granted,
        total_consumed: item.total_consumed,
        current_balance: item.current_balance,
        usage_rate: item.total_granted > 0 ? 
          Number(((item.total_consumed / item.total_granted) * 100).toFixed(2)) : 0
      }));

      return sendSuccess(res, {
        app_id,
        app_name: app.name,
        time_range: {
          start_time: startTime,
          end_time: endTime
        },
        items: itemsWithUsageRate
      }, '获取统计数据成功');

    } catch (error) {
      console.error('获取道具统计失败:', error);
      return sendError(res, '获取统计数据失败', 500);
    }
  }

  /**
   * 获取单个道具的详细统计
   * GET /app/:appId/item/:itemId
   * 路径参数:
   * - appId: 应用ID (必需)
   * - itemId: 道具ID (必需)
   * Query参数:
   * - start_time: 开始时间戳 (可选)
   * - end_time: 结束时间戳 (可选)
   * - merchant_id: 商户ID (管理员查询时必需)
   */
  static async getItemDetailStatistics(req: AuthRequest, res: Response) {
    try {
      const { appId, itemId } = req.params;
      const { start_time, end_time } = req.query;
      const app_id = appId;
      const item_id = itemId;
      
      // 验证用户权限并获取商户ID
      let merchantId: string;
      
      if (req.user?.user_type === 'SUPER_ADMIN') {
        // 超级管理员可以查询任意商户，需要从参数中获取merchant_id
        const queryMerchantId = req.query.merchant_id as string;
        if (!queryMerchantId) {
          return sendError(res, '管理员查询需要提供 merchant_id 参数', 400);
        }
        merchantId = queryMerchantId;
      } else if (req.user?.merchant_id) {
        // 商户用户只能查询自己的数据
        merchantId = req.user.merchant_id;
      } else {
        return sendError(res, '无权限访问', 403);
      }

      // 参数验证
      if (!app_id || typeof app_id !== 'string') {
        return sendError(res, 'app_id 参数是必需的', 400);
      }

      if (!item_id) {
        return sendError(res, 'item_id 参数是必需的', 400);
      }

      // 验证应用是否属于该商户
      const app = await prisma.app.findFirst({
        where: {
          id: app_id,
          merchant_id: merchantId,
          status: 1
        }
      });

      if (!app) {
        return sendError(res, '应用不存在或无权限访问', 404);
      }

      // 验证道具模板是否存在
      const itemTemplate = await prisma.itemTemplate.findFirst({
        where: {
          id: item_id,
          merchant_id: merchantId,
          app_id: app_id
        }
      });

      if (!itemTemplate) {
        return sendError(res, '道具模板不存在', 404);
      }

      // 时间参数验证和转换
      let startTime: number | undefined;
      let endTime: number | undefined;

      if (start_time) {
        startTime = parseInt(start_time as string);
        if (isNaN(startTime)) {
          return sendError(res, 'start_time 必须是有效的时间戳', 400);
        }
      }

      if (end_time) {
        endTime = parseInt(end_time as string);
        if (isNaN(endTime)) {
          return sendError(res, 'end_time 必须是有效的时间戳', 400);
        }
      }

      // 时间范围验证
      if (startTime && endTime && startTime > endTime) {
        return sendError(res, '开始时间不能大于结束时间', 400);
      }

      // 获取统计数据
      const statistics = await merchantStatisticsService.getItemStatistics(
        merchantId,
        app_id,
        item_id,
        startTime,
        endTime
      );

      if (!statistics) {
        return sendSuccess(res, {
          item_id,
          item_name: itemTemplate.item_name,
          app_id,
          app_name: app.name,
          time_range: {
            start_time: startTime,
            end_time: endTime
          },
          statistics: {
            item_id,
            item_name: itemTemplate.item_name,
            total_granted: 0,
            total_consumed: 0,
            current_balance: 0
          }
        }, '获取道具统计成功');
      }

      return sendSuccess(res, {
        item_id,
        item_name: itemTemplate.item_name,
        app_id,
        app_name: app.name,
        time_range: {
          start_time: startTime,
          end_time: endTime
        },
        statistics
      }, '获取道具统计成功');

    } catch (error) {
      console.error('获取道具详细统计失败:', error);
      return sendError(res, '获取道具统计失败', 500);
    }
  }

  /**
   * 获取应用概览统计
   * GET /app/:appId/overview
   * 路径参数:
   * - appId: 应用ID (必需)
   * Query参数:
   * - start_time: 开始时间戳 (可选)
   * - end_time: 结束时间戳 (可选)
   * - merchant_id: 商户ID (管理员查询时必需)
   */
  static async getOverviewStatistics(req: AuthRequest, res: Response) {
    try {
      const { appId } = req.params;
      const { start_time, end_time } = req.query;
      const app_id = appId;
      
      // 验证用户权限并获取商户ID
      let merchantId: string;
      
      if (req.user?.user_type === 'SUPER_ADMIN') {
        // 超级管理员可以查询任意商户，需要从参数中获取merchant_id
        const queryMerchantId = req.query.merchant_id as string;
        if (!queryMerchantId) {
          return sendError(res, '管理员查询需要提供 merchant_id 参数', 400);
        }
        merchantId = queryMerchantId;
      } else if (req.user?.merchant_id) {
        // 商户用户只能查询自己的数据
        merchantId = req.user.merchant_id;
      } else {
        return sendError(res, '无权限访问', 403);
      }

      // 参数验证
      if (!app_id || typeof app_id !== 'string') {
        return sendError(res, 'app_id 参数是必需的', 400);
      }

      // 验证应用是否属于该商户
      const app = await prisma.app.findFirst({
        where: {
          id: app_id,
          merchant_id: merchantId,
          status: 1
        }
      });

      if (!app) {
        return sendError(res, '应用不存在或无权限访问', 404);
      }

      // 时间参数验证和转换
      let startTime: number | undefined;
      let endTime: number | undefined;

      if (start_time) {
        startTime = parseInt(start_time as string);
        if (isNaN(startTime)) {
          return sendError(res, 'start_time 必须是有效的时间戳', 400);
        }
      }

      if (end_time) {
        endTime = parseInt(end_time as string);
        if (isNaN(endTime)) {
          return sendError(res, 'end_time 必须是有效的时间戳', 400);
        }
      }

      // 时间范围验证
      if (startTime && endTime && startTime > endTime) {
        return sendError(res, '开始时间不能大于结束时间', 400);
      }

      // 获取统计数据
      const statistics = await merchantStatisticsService.getAppItemStatistics(
        merchantId,
        app_id,
        startTime,
        endTime
      );

      // 获取道具模板数量
      const itemTemplateCount = await prisma.itemTemplate.count({
        where: {
          merchant_id: merchantId,
          app_id: app_id
        }
      });

      // 返回概览数据（不包含具体道具列表）
      const overview = {
        app_id,
        app_name: app.name,
        time_range: {
          start_time: startTime,
          end_time: endTime
        },
        summary: {
          total_items_count: statistics.items.length,
          total_items_granted: statistics.total_items_granted,
          total_items_consumed: statistics.total_items_consumed,
          total_items_balance: statistics.total_items_balance,
          active_players: statistics.active_players,
          item_template_count: itemTemplateCount
        }
      };

      return sendSuccess(res, overview, '获取概览统计成功');

    } catch (error) {
      console.error('获取概览统计失败:', error);
      return sendError(res, '获取概览统计失败', 500);
    }
  }
}