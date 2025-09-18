import { Response } from 'express';

import { prisma } from '../utils/database';
import {
  sendSuccess,
  sendInternalError,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendUnauthorized
} from '../utils/response';
import { AuthRequest } from '../types';
import { ItemTemplateService, ItemTemplateQueryOptions } from '../services/item-template.service';
import { PermissionUtils, PermissionChecker, AuthUtils, ParamValidator, ResourceValidator } from '../utils/permission';

const itemTemplateService = new ItemTemplateService(prisma);

/**
 * 道具模板控制器
 * 负责处理道具模板相关的HTTP请求
 */
export class ItemTemplateController {
  /**
   * 获取道具模板列表
   * GET /item-templates
   * 查询参数：
   * - merchant_id: 商户ID（超级管理员必填，商户用户可选）
   * - app_id: 应用ID（必填）
   * - page: 页码（默认1）
   * - pageSize: 每页数量（默认20）
   * - item_type: 道具类型（可选）
   * - item_name: 道具名称（可选）
   * - is_active: 是否激活（可选）
   * - status: 状态（可选）
   */
  static async getItemTemplates(req: AuthRequest, res: Response) {
    const user = req.user;
    
    if (!user) {
      return sendBadRequest(res, '用户信息缺失');
    }

    try {
      // 从查询参数中获取筛选条件
      const {
        merchant_id,
        app_id,
        page,
        pageSize,
        item_type,
        item_name,
        is_active,
        status,
        id,
        current
      } = req.query;

      // 参数验证 - app_id是必填的
      if (!app_id) {
        return sendBadRequest(res, 'app_id参数是必填的');
      }

      // 参数验证和转换
      const options: ItemTemplateQueryOptions = {};
      
      // 处理分页参数，支持current作为page的别名
      const pageParam = current || page;
      if (pageParam) {
        const pageNum = parseInt(pageParam as string);
        if (isNaN(pageNum) || pageNum < 1) {
          return sendBadRequest(res, '页码必须是大于0的整数');
        }
        options.page = pageNum;
      }

      if (pageSize) {
        const pageSizeNum = parseInt(pageSize as string);
        if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 200) {
          return sendBadRequest(res, '每页数量必须是1-200之间的整数');
        }
        options.pageSize = pageSizeNum;
      }

      if (item_type) {
        options.item_type = item_type as string;
      }

      if (item_name) {
        options.item_name = item_name as string;
      }

      if (is_active) {
        if (is_active !== 'ACTIVE' && is_active !== 'INACTIVE') {
          return sendBadRequest(res, 'is_active参数值必须是ACTIVE或INACTIVE');
        }
        options.is_active = is_active as any;
      }

      if (status) {
        if (!['NORMAL', 'EXPIRED', 'PENDING_DELETE', 'DELETED'].includes(status as string)) {
          return sendBadRequest(res, 'status参数值无效');
        }
        options.status = status as any;
      }

      if (id) {
        options.id = id as string;
      }

      // 权限检查：使用统一权限校验方法
       if (!user) {
         return sendUnauthorized(res, '用户未认证');
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, merchant_id as string | undefined);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, merchantAccess.message!);
       }
       const merchantId = merchantAccess.merchantId!;

      // 验证应用是否属于当前商户
      const app = await prisma.app.findFirst({
        where: {
          id: app_id as string,
          merchant_id: merchantId
        }
      });

      if (!app) {
        return sendNotFound(res, '应用不存在或无权访问');
      }

      // 调用服务层获取数据
      const result = await itemTemplateService.getItemTemplates(
        merchantId,
        app_id as string,
        options
      );

      // 转换BigInt字段为数字以便JSON序列化和前端正确解析
      const responseData = {
        ...result,
        templates: result.templates.map(template => ({
          ...template,
          created_at: Number(template.created_at),
          updated_at: Number(template.updated_at),
          expire_date: template.expire_date ? Number(template.expire_date) : null
        }))
      };

      return sendSuccess(res, responseData, '获取道具模板列表成功');
    } catch (error) {
      console.error('获取道具模板列表失败:', error);
      return sendInternalError(res, '获取道具模板列表失败');
    }
  }

  /**
   * 获取单个道具模板详情
   * GET /item-templates/:id
   */
  static async getItemTemplateById(req: AuthRequest, res: Response) {
    const user = req.user;
    const { id } = req.params;

    if (!user) {
      return sendBadRequest(res, '用户信息缺失');
    }

    if (!id) {
      return sendBadRequest(res, '道具模板ID不能为空');
    }

    try {
      // 权限检查：使用统一权限校验方法
       if (!user) {
         return sendUnauthorized(res, '用户未认证');
       }
       
       const queryMerchantId = req.query.merchant_id as string | undefined;
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, queryMerchantId);
       if (!merchantAccess.allowed) {
         return sendBadRequest(res, merchantAccess.message!);
       }
       const merchantId = merchantAccess.merchantId!;

      // 调用服务层获取数据
      const template = await itemTemplateService.getItemTemplateById(id, merchantId);

      if (!template) {
        return sendNotFound(res, '道具模板不存在或无权访问');
      }

      // 转换BigInt字段为数字以便JSON序列化和前端正确解析
      const responseData = {
        ...template,
        created_at: Number(template.created_at),
        updated_at: Number(template.updated_at),
        expire_date: template.expire_date ? Number(template.expire_date) : null
      };

      return sendSuccess(res, responseData, '获取道具模板详情成功');
    } catch (error) {
      console.error('获取道具模板详情失败:', error);
      return sendInternalError(res, '获取道具模板详情失败');
    }
  }

  /**
   * 获取道具模板统计信息
   * GET /item-templates/stats
   */
  static async getItemTemplateStats(req: AuthRequest, res: Response) {
    const user = req.user;
    
    if (!user) {
      return sendBadRequest(res, '用户信息缺失');
    }

    try {
      const { app_id } = req.query;

      // 权限检查：使用统一权限校验方法
       if (!user) {
         return sendUnauthorized(res, '用户未认证');
       }
       
       const queryMerchantId = req.query.merchant_id as string | undefined;
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, queryMerchantId);
       if (!merchantAccess.allowed) {
         return sendBadRequest(res, merchantAccess.message!);
       }
       const merchantId = merchantAccess.merchantId!;

      // 如果指定了app_id，需要验证该应用是否属于当前商户
      if (app_id) {
        const app = await prisma.app.findFirst({
          where: {
            id: app_id as string,
            merchant_id: merchantId
          }
        });

        if (!app) {
          return sendNotFound(res, '应用不存在或无权访问');
        }
      }

      // 调用服务层获取统计数据
      const stats = await itemTemplateService.getTemplateStats(
        merchantId,
        app_id as string
      );

      return sendSuccess(res, stats, '获取道具模板统计信息成功');
    } catch (error) {
      console.error('获取道具模板统计信息失败:', error);
      return sendInternalError(res, '获取道具模板统计信息失败');
    }
  }

  /**
   * 创建道具模板
   * POST /item-templates
   * 请求体参数：
   * - merchant_id: 商户ID（必填）
   * - app_id: 应用ID（必填）
   * - item_name: 道具名称（必填）
   * - item_type: 道具类型（必填）
   * - item_icon: 道具图标（可选）
   * - eff_arg: 效果参数JSON字符串（可选）
   * - is_active: 是否启用状态，ACTIVE/INACTIVE（可选，默认ACTIVE）
   * - status: 生命周期状态，NORMAL/EXPIRED/PENDING_DELETE/DELETED（可选，默认NORMAL）
   * - expire_duration: 过期时长，单位小时（可选）
   * - expire_date: 过期时间戳（可选）
   * - limit_max: 最大限制数量（可选）
   * - daily_limit_max: 每日最大限制数量（可选）
   * - total_limit: 总限制数量（可选）
   * - custom: 自定义数据JSON字符串（可选）
   */
  static async createItemTemplate(req: AuthRequest, res: Response) {
    const user = req.user;
    
    if (!user) {
      return sendBadRequest(res, '用户信息缺失');
    }

    try {
      // 从请求体中获取参数
      const {
        merchant_id,
        app_id,
        item_name,
        item_type,
        item_icon,
        eff_arg,
        is_active,
        status,
        expire_duration,
        expire_date,
        limit_max,
        daily_limit_max,
        total_limit,
        custom
      } = req.body;

      console.log('createItemTemplate req.body', req.body);
      console.log(merchant_id,'merchant_id');

      // 验证必填参数
      if (!merchant_id) {
        return sendBadRequest(res, 'merchant_id 是必填参数');
      }

      if (!app_id) {
        return sendBadRequest(res, 'app_id 是必填参数');
      }

      if (!item_name) {
        return sendBadRequest(res, 'item_name 是必填参数');
      }

      if (!item_type) {
        return sendBadRequest(res, 'item_type 是必填参数');
      }

      // 权限校验：使用统一权限校验方法
       if (!user) {
         return sendUnauthorized(res, '用户未认证');
       }
       
       const merchantAccess = AuthUtils.getMerchantAccessPermission(user, merchant_id);
       if (!merchantAccess.allowed) {
         return sendForbidden(res, merchantAccess.message!);
       }

      // 验证应用是否存在且属于当前商户
      const app = await prisma.app.findFirst({
        where: {
          id: app_id,
          merchant_id: merchant_id
        }
      });

      if (!app) {
        return sendNotFound(res, '应用不存在或无权访问');
      }

      // 生成道具模板ID (最大30字符)
      const templateId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 验证eff_arg是否为有效JSON字符串
      if (eff_arg && typeof eff_arg !== 'string') {
        return sendBadRequest(res, 'eff_arg必须是JSON字符串');
      }
      
      // 初始化过期状态标志
      let shouldSetExpired = false;
      
      // 验证过期时长
      if (expire_duration !== undefined && expire_duration !== null) {
        if (typeof expire_duration !== 'number' || expire_duration < 0) {
          return sendBadRequest(res, '过期时长必须是大于等于0的数字');
        }
      }
      
      // 验证过期时间戳
      if (expire_date !== undefined && expire_date !== null) {
        const currentTimestamp = Date.now();
        const expireTimestamp = typeof expire_date === 'string' ? parseInt(expire_date) : expire_date;
        
        if (isNaN(expireTimestamp)) {
          return sendBadRequest(res, '过期时间戳格式无效');
        }
        
        // 创建时不允许设置过去的时间
        if (expireTimestamp <= currentTimestamp) {
          return sendBadRequest(res, '过期时间戳必须是未来的时间');
        }
      }
      
      // 创建道具模板
      const itemTemplate = await prisma.itemTemplate.create({
        data: {
          id: templateId,
          merchant_id,
          app_id,
          item_name,
          item_type,
          item_icon: item_icon || null,
          eff_arg: eff_arg || '{}',
          is_active: is_active !== undefined ? is_active : 'ACTIVE',
          status: status || 'NORMAL',
          expire_duration: expire_duration || null,
          expire_date: expire_date ? BigInt(expire_date) : null,
          limit_max: limit_max || null,
          daily_limit_max: daily_limit_max || null,
          total_limit: total_limit || null,
          custom: custom || null,
          created_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now())
        }
      });

      // 转换BigInt字段为数字以便JSON序列化和前端正确解析
      const responseData = {
        ...itemTemplate,
        created_at: Number(itemTemplate.created_at),
        updated_at: Number(itemTemplate.updated_at),
        expire_date: itemTemplate.expire_date ? Number(itemTemplate.expire_date) : null
      };

      return sendSuccess(res, responseData, '道具模板创建成功');
    } catch (error) {
      console.error('创建道具模板失败:', error);
      return sendInternalError(res, '创建道具模板失败');
    }
  }

  /**
   * 更新道具模板
   * PUT /item-templates/:id
   * 请求体参数：
   * - item_name: 道具名称（可选）
   * - item_type: 道具类型（可选）
   * - item_icon: 道具图标（可选）
   * - eff_arg: 效果参数JSON字符串（可选）
   * - is_active: 是否启用状态，ACTIVE/INACTIVE（可选）
   * - status: 生命周期状态，NORMAL/EXPIRED/PENDING_DELETE/DELETED（可选）
   * - expire_duration: 过期时长，单位小时（可选）
   * - expire_date: 过期时间戳（可选）
   * - limit_max: 最大限制数量（可选）
   * - daily_limit_max: 每日最大限制数量（可选）
   * - total_limit: 总限制数量（可选）
   * - custom: 自定义数据JSON字符串（可选）
   */
  static async updateItemTemplate(req: AuthRequest, res: Response) {
    const user = req.user;
    const { id } = req.params;
    
    if (!user) {
      return sendBadRequest(res, '用户信息缺失');
    }

    if (!id) {
      return sendBadRequest(res, '道具模板ID不能为空');
    }

    try {
      // 从请求体中获取更新参数
      const {
        item_name,
        item_type,
        item_icon,
        eff_arg,
        is_active,
        status,
        expire_duration,
        expire_date,
        limit_max,
        daily_limit_max,
        total_limit,
        custom
      } = req.body;

      // 初始化过期状态标志
      let shouldSetExpired = false;

      // 权限检查：使用统一权限校验方法
      // 从请求体中获取merchant_id，如果没有则从查询参数中获取
      const merchantIdFromRequest = req.body.merchant_id || req.query.merchant_id as string | undefined;
      if (!user) {
         return sendUnauthorized(res, '用户未认证');
       }
       
       const permissionResult = AuthUtils.getMerchantAccessPermission(
         user,
         merchantIdFromRequest
      );

      if (!permissionResult.allowed) {
        return sendForbidden(res, permissionResult.message!);
      }

      const merchantId = permissionResult.merchantId!;

      // 验证eff_arg是否为有效JSON字符串
      if (eff_arg !== undefined && eff_arg !== null && typeof eff_arg !== 'string') {
        return sendBadRequest(res, 'eff_arg必须是JSON字符串');
      }
      
      // 验证过期时长
      if (expire_duration !== undefined && expire_duration !== null) {
        if (typeof expire_duration !== 'number' || expire_duration < 0) {
          return sendBadRequest(res, '过期时长必须是大于等于0的数字');
        }
      }
      
      // 验证过期时间戳并处理过期逻辑
      if (expire_date !== undefined && expire_date !== null) {
        const currentTimestamp = Date.now();
        const expireTimestamp = typeof expire_date === 'string' ? parseInt(expire_date) : expire_date;
        
        if (isNaN(expireTimestamp)) {
          return sendBadRequest(res, '过期时间戳格式无效');
        }
        
        // 更新时允许设置过去的时间，自动将状态设为expired
        if (expireTimestamp <= currentTimestamp) {
          shouldSetExpired = true;
        }
      }

      // 构建更新数据对象
      const updateData: any = {};
      
      if (item_name !== undefined) updateData.item_name = item_name;
      if (item_type !== undefined) updateData.item_type = item_type;
      if (item_icon !== undefined) updateData.item_icon = item_icon;
      if (eff_arg !== undefined) updateData.eff_arg = eff_arg;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      // 处理状态：如果设置了过去的过期时间，自动设为expired
      if (shouldSetExpired) {
        updateData.status = 'EXPIRED';
      } else if (status !== undefined) {
        updateData.status = status;
      }
      
      if (expire_duration !== undefined) updateData.expire_duration = expire_duration;
      if (expire_date !== undefined) updateData.expire_date = expire_date ? BigInt(expire_date) : null;
      if (limit_max !== undefined) updateData.limit_max = limit_max;
      if (daily_limit_max !== undefined) updateData.daily_limit_max = daily_limit_max;
      if (total_limit !== undefined) updateData.total_limit = total_limit;
      if (custom !== undefined) updateData.custom = custom;

      // 如果没有任何更新数据，返回错误
      if (Object.keys(updateData).length === 0) {
        return sendBadRequest(res, '至少需要提供一个要更新的字段');
      }

      // 调用服务层更新数据
      const updatedTemplate = await itemTemplateService.updateItemTemplate(
        id,
        merchantId,
        updateData
      );

      if (!updatedTemplate) {
        return sendNotFound(res, '道具模板不存在或无权访问');
      }

      // TODO: 如果模板状态变为EXPIRED，需要将基于此模板已发出的道具也设为过期状态
      // 这需要调用道具服务层的方法来批量更新相关道具的状态
      // if (shouldSetExpired) {
      //   await itemService.expireItemsByTemplateId(id);
      // }

      // 转换BigInt字段为数字以便JSON序列化和前端正确解析
      const responseData = {
        ...updatedTemplate,
        created_at: Number(updatedTemplate.created_at),
        updated_at: Number(updatedTemplate.updated_at),
        expire_date: updatedTemplate.expire_date ? Number(updatedTemplate.expire_date) : null
      };

      return sendSuccess(res, responseData, '道具模板更新成功');
    } catch (error) {
      console.error('更新道具模板失败:', error);
      return sendInternalError(res, '更新道具模板失败');
    }
  }


}