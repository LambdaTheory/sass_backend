import { Response } from "express";
import { prisma } from "../utils/database";
import {
  sendSuccess,
  sendInternalError,
  sendBadRequest,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
} from "../utils/response";
import { randomUUID } from "crypto";
import { AuthRequest } from "../types";
import { Prisma } from "@prisma/client";
import { AuthUtils } from '../utils/permission';

enum AppStatus {
  ENABLE = 1,
  DISABLE = 0,
}

import { AppService } from "../services/app.service";

const appService = new AppService(prisma);

/**
 * 应用控制器
 * 负责处理应用相关的HTTP请求
 */
export class AppController {
  /**
   * 获取应用统计信息
   */
  static async getAppStat(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const user = req.user;

    try {
      const app = await prisma.app.findUnique({
        where: { id },
      });

      if (!app) {
        return sendNotFound(res, "应用不存在");
      }

      if (!user) {
         return sendUnauthorized(res, "用户未认证");
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, app.merchant_id);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, "无权限查看该应用的统计信息");
       }

      const stats = await appService.getAppStat(id);
      return sendSuccess(res, stats, "查询成功");
    } catch (error) {
      console.error("获取应用统计信息失败:", error);
      return sendInternalError(res, "获取应用统计信息失败");
    }
  }

  /**
   * 创建应用
   */
  static async createApp(req: AuthRequest, res: Response) {
    const {
      name,
      merchant_id,
      status,
    }: { name: string; merchant_id: string; status?: AppStatus } = req.body;
    const user = req.user;

    try {
      // 基础参数验证
      if (!merchant_id) {
        return sendBadRequest(res, "商户ID不能为空");
      }

      // 应用名称校验
      if (!name) {
        return sendBadRequest(res, "应用名称不能为空");
      }

      if (name.trim() === "") {
        return sendBadRequest(res, "应用名称不能为空");
      }

      // 应用名称长度校验（最多30个字符）
      if (name.length > 30) {
        return sendBadRequest(res, "应用名称不能超过30个字符");
      }

      // 应用名称字符校验（只允许数字、字母）
      const nameRegex = /^[a-zA-Z0-9]+$/;
      if (!nameRegex.test(name)) {
        return sendBadRequest(res, "应用名称只能包含数字和字母");
      }

      if (!user) {
         return sendUnauthorized(res, "用户未认证");
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, merchant_id);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, "无权限为其他商户创建应用");
       }

      // 检查商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchant_id },
      });

      if (!merchant) {
        return sendNotFound(res, "商户不存在");
      }

      // 检查应用名称是否已存在（同一商户下）
      const existingApp = await prisma.app.findFirst({
        where: {
          name: name.trim(),
          merchant_id,
        },
      });

      if (existingApp) {
        return sendBadRequest(res, "应用名称已存在，请使用其他名称");
      }

      // 创建应用
      const currentTime = BigInt(Date.now());
      const trimmedName = name.trim();
      const app = await prisma.app.create({
        data: {
          id: randomUUID(),
          name: trimmedName,
          merchant_id,
          status: status ?? AppStatus.ENABLE,
          created_at: currentTime,
          updated_at: currentTime,
        },
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const responseData = {
        id: app.id,
        name: app.name,
        merchant_id: app.merchant_id,
        merchant_name: app.merchant.name,
        status: app.status,
        created_at: Number(app.created_at),
        updated_at: Number(app.updated_at),
      };

      return sendSuccess(res, responseData, "应用创建成功");
    } catch (error) {
      console.error("创建应用失败:", error);
      return sendInternalError(res, "创建应用失败");
    }
  }

  /**
   * 更新应用
   */
  static async updateApp(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { name, status }: { name?: string; status?: AppStatus } = req.body;
    const user = req.user;

    try {
      // 检查应用是否存在
      const app = await prisma.app.findUnique({
        where: { id },
      });

      if (!app) {
        return sendNotFound(res, "应用不存在");
      }

      if (!user) {
         return sendUnauthorized(res, "用户未认证");
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, app.merchant_id);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, "无权限更新该应用");
       }

      // 更新应用
      const updatedApp = await appService.updateApp(id, { name, status });

      return sendSuccess(res, updatedApp, "应用更新成功");
    } catch (error) {
      console.error("更新应用失败:", error);
      if (error instanceof Error) {
        return sendBadRequest(res, error.message);
      }
      return sendInternalError(res, "更新应用失败");
    }
  }

  /**
   * 删除应用
   */
  static async deleteApp(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const user = req.user;

    try {
      // 检查应用是否存在
      const app = await prisma.app.findUnique({
        where: { id },
      });

      if (!app) {
        return sendNotFound(res, "应用不存在");
      }

      if (!user) {
         return sendUnauthorized(res, "用户未认证");
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, app.merchant_id);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, "无权限删除该应用");
       }

      // 删除应用
      const result = await appService.deleteApp(id);

      return sendSuccess(res, result, "应用删除成功");
    } catch (error) {
      console.error("删除应用失败:", error);
      if (error instanceof Error) {
        return sendBadRequest(res, error.message);
      }
      return sendInternalError(res, "删除应用失败");
    }
  }

  /**
   * 查询应用列表
   */
  static async getAppList(req: AuthRequest, res: Response) {
    const { 
      merchant_id, 
      search, 
      status, 
      current = 1, 
      pageSize = 10,
      // 兼容旧的分页参数
      limit, 
      offset 
    } = req.query;
    const user = req.user;

    try {
      // 用户认证检查
      if (!user) {
         return sendUnauthorized(res, "用户未认证");
       }

       // 构建查询条件和参数
       let whereClause = 'WHERE 1=1';
       const queryParams: any[] = [];

       // 权限检查和查询条件设置
       if (AuthUtils.isSuperAdmin(user)) {
         if (merchant_id) {
           whereClause += ` AND a.merchant_id = ?`;
           queryParams.push(merchant_id as string);
         }
       } else if (AuthUtils.isMerchantUser(user)) {
         whereClause += ` AND a.merchant_id = ?`;
         queryParams.push(user.merchant_id);
       }

       // 搜索条件
       if (search) {
         whereClause += ` AND a.name COLLATE utf8mb4_bin LIKE ?`;
         queryParams.push(`%${search}%`);
       }

       // 状态筛选
       if (status !== undefined) {
         whereClause += ` AND a.status = ?`;
         queryParams.push(Number(status));
       }

       // 分页参数处理
       const currentPage = Number(current);
       const pageSizeNum = Number(pageSize);
       const limitNum = limit ? Number(limit) : pageSizeNum;
       const offsetNum = offset ? Number(offset) : (currentPage - 1) * pageSizeNum;

       // 获取总数
       const countQuery = `
         SELECT COUNT(*) as total
         FROM App a
         ${whereClause}
       `;
       const countResult = await prisma.$queryRaw<[{total: bigint}]>(
         Prisma.sql([countQuery], ...queryParams)
       );
       const total = Number(countResult[0].total);

       // 获取应用列表
       const appsQuery = `
         SELECT 
           a.*,
           JSON_OBJECT('id', m.id, 'name', m.name) as merchant
         FROM App a
         LEFT JOIN Merchant m ON a.merchant_id = m.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?
       `;
       
       const apps = await prisma.$queryRaw<any[]>(
         Prisma.sql([appsQuery], ...queryParams, limitNum, offsetNum)
       );

       // 处理JSON字段
       const processedApps = apps.map(app => {
         let merchant = null;
         
         try {
           merchant = typeof app.merchant === 'string' ? JSON.parse(app.merchant) : app.merchant;
         } catch (error) {
           console.error('解析商户数据失败:', error);
         }
         
         return {
           ...app,
           merchant,
           created_at: app.created_at ? Number(app.created_at) : null,
           updated_at: app.updated_at ? Number(app.updated_at) : null,
         };
       });

      const totalPages = Math.ceil(total / pageSizeNum);

      const responseData = {
        apps: processedApps.map((app) => ({
          id: app.id,
          name: app.name,
          merchant_id: app.merchant_id,
          merchant_name: app.merchant?.name,
          status: app.status,
          created_at: app.created_at,
          updated_at: app.updated_at,
        })),
        pagination: {
          total,
          current: currentPage,
          pageSize: pageSizeNum,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
          // 兼容旧的分页格式
          limit: limitNum,
          offset: offsetNum,
          has_more: offsetNum + limitNum < total,
        },
      };

      return sendSuccess(res, responseData, "查询成功");
    } catch (error) {
      console.error("查询应用列表失败:", error);
      return sendInternalError(res, "查询应用列表失败");
    }
  }


}
