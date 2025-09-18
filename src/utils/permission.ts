import { AuthRequest } from '../types';
import { prisma } from './database';

/**
 * 权限校验工具类
 * 提供统一的权限验证方法
 */
export class PermissionUtils {
  /**
   * 检查用户是否有指定权限
   * @param user 用户信息
   * @param resource 资源类型
   * @param action 操作类型
   * @returns 是否有权限
   */
  static hasPermission(
    user: { role?: string; permissions?: readonly string[] },
    resource: string,
    action: string
  ): boolean {
    // 超级管理员拥有所有权限
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    const requiredPermission = `${resource}_${action}`;
    return user.permissions?.includes(requiredPermission) || false;
  }

  /**
   * 检查用户是否可以访问指定商户的资源
   * @param user 用户信息
   * @param merchantId 商户ID
   * @returns 是否有权限
   */
  static canAccessMerchant(
    user: { role?: string; merchant_id?: string },
    merchantId: string
  ): boolean {
    // 超级管理员可以访问所有商户资源
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // 商户用户只能访问自己商户的资源
    return user.merchant_id === merchantId;
  }

  /**
   * 验证商户和应用是否存在且有效
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @returns 验证结果
   */
  static async validateMerchantAndApp(
    merchantId: string,
    appId: string
  ): Promise<{
    valid: boolean;
    message?: string;
    app?: any;
  }> {
    try {
      const app = await prisma.app.findFirst({
        where: {
          id: appId,
          merchant_id: merchantId,
          status: 1
        },
        include: {
          merchant: true
        }
      });

      if (!app) {
        return {
          valid: false,
          message: '应用不存在或已禁用'
        };
      }

      if (app.merchant.status !== 1) {
        return {
          valid: false,
          message: '商户已被禁用'
        };
      }

      return {
        valid: true,
        app
      };
    } catch (error) {
      console.error('验证商户和应用失败:', error);
      return {
        valid: false,
        message: '验证失败'
      };
    }
  }

  /**
   * 验证玩家ID格式
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @param playerId 玩家ID
   * @returns 验证结果
   */
  static async validatePlayer(
    merchantId: string,
    appId: string,
    playerId: string
  ): Promise<{
    valid: boolean;
    message?: string;
    player?: any;
  }> {
    try {
      // 只验证参数格式，不查询数据库
      // 玩家数据由商户自己的系统管理，我们只需要确保参数有效
      if (!playerId || typeof playerId !== 'string' || playerId.trim().length === 0) {
        return {
          valid: false,
          message: '玩家ID格式无效'
        };
      }

      if (playerId.length > 100) {
        return {
          valid: false,
          message: '玩家ID长度不能超过100个字符'
        };
      }

      return {
        valid: true,
        player: { player_id_in_app: playerId }
      };
    } catch (error) {
      console.error('验证玩家失败:', error);
      return {
        valid: false,
        message: '验证失败'
      };
    }
  }

  /**
   * 综合权限检查：用户权限 + 商户权限 + 资源验证
   * @param user 用户信息
   * @param resource 资源类型
   * @param action 操作类型
   * @param merchantId 商户ID
   * @param appId 应用ID（可选）
   * @param playerId 玩家ID（可选）
   * @returns 检查结果
   */
  static async checkPermissions(
    user: { role?: string; permissions?: readonly string[]; merchant_id?: string },
    resource: string,
    action: string,
    merchantId: string,
    appId?: string,
    playerId?: string
  ): Promise<{
    allowed: boolean;
    message?: string;
    data?: {
      app?: any;
      player?: any;
    };
  }> {
    // 1. 检查基础权限
    if (!this.hasPermission(user, resource, action)) {
      return {
        allowed: false,
        message: `需要 ${resource} 的 ${action} 权限`
      };
    }

    // 2. 检查商户访问权限
    if (!this.canAccessMerchant(user, merchantId)) {
      return {
        allowed: false,
        message: '无权限操作其他商户的数据'
      };
    }

    const result: any = { data: {} };

    // 3. 验证应用（如果提供）
    if (appId) {
      const appValidation = await this.validateMerchantAndApp(merchantId, appId);
      if (!appValidation.valid) {
        return {
          allowed: false,
          message: appValidation.message
        };
      }
      result.data.app = appValidation.app;
    }

    // 4. 验证玩家（如果提供）
    if (playerId && appId) {
      const playerValidation = await this.validatePlayer(merchantId, appId, playerId);
      if (!playerValidation.valid) {
        return {
          allowed: false,
          message: playerValidation.message
        };
      }
      result.data.player = playerValidation.player;
    }

    return {
      allowed: true,
      ...result
    };
  }
}

/**
 * 用户认证和基础权限校验方法
 */
export class AuthUtils {
  /**
   * 检查用户是否已认证
   * @param user 用户信息
   * @returns 认证检查结果
   */
  static checkAuthentication(user: any): {
    authenticated: boolean;
    message?: string;
  } {
    if (!user) {
      return {
        authenticated: false,
        message: '用户信息缺失'
      };
    }

    return { authenticated: true };
  }

  /**
   * 检查用户是否为超级管理员
   * @param user 用户信息
   * @returns 是否为超级管理员
   */
  static isSuperAdmin(user: { role?: string; user_type?: string }): boolean {
    return user.role === 'SUPER_ADMIN' || user.user_type === 'SUPER_ADMIN';
  }

  /**
   * 检查用户是否为商户用户
   * @param user 用户信息
   * @returns 是否为商户用户
   */
  static isMerchantUser(user: { user_type?: string }): boolean {
    return user.user_type === 'MERCHANT_OWNER' || user.user_type === 'MERCHANT';
  }

  /**
   * 获取用户可访问的商户ID
   * @param user 用户信息
   * @param requestedMerchantId 请求的商户ID（可选）
   * @returns 权限检查结果
   */
  static getMerchantAccessPermission(
    user: { role?: string; user_type?: string; merchant_id?: string },
    requestedMerchantId?: string
  ): {
    allowed: boolean;
    merchantId?: string;
    message?: string;
  } {
    // 超级管理员可以访问任何商户
    if (this.isSuperAdmin(user)) {
      if (requestedMerchantId) {
        return {
          allowed: true,
          merchantId: requestedMerchantId
        };
      } else {
        return {
          allowed: false,
          message: '超级管理员必须指定merchant_id参数'
        };
      }
    }

    // 商户用户只能访问自己的商户
    if (this.isMerchantUser(user)) {
      if (!user.merchant_id) {
        return {
          allowed: false,
          message: '用户未关联任何商户'
        };
      }

      if (requestedMerchantId && user.merchant_id !== requestedMerchantId) {
        return {
          allowed: false,
          message: '无权限访问其他商户的数据'
        };
      }

      return {
        allowed: true,
        merchantId: user.merchant_id
      };
    }

    return {
      allowed: false,
      message: '用户类型无效'
    };
  }
}

/**
 * 资源验证工具类
 */
export class ResourceValidator {
  /**
   * 验证应用是否存在且属于指定商户
   * @param appId 应用ID
   * @param merchantId 商户ID
   * @returns 验证结果
   */
  static async validateApp(
    appId: string,
    merchantId: string
  ): Promise<{
    valid: boolean;
    message?: string;
    app?: any;
  }> {
    try {
      const app = await prisma.app.findFirst({
        where: {
          id: appId,
          merchant_id: merchantId,
          status: 1
        },
        include: {
          merchant: true
        }
      });

      if (!app) {
        return {
          valid: false,
          message: '应用不存在或已禁用'
        };
      }

      if (app.merchant.status !== 1) {
        return {
          valid: false,
          message: '商户已被禁用'
        };
      }

      return {
        valid: true,
        app
      };
    } catch (error) {
      console.error('验证应用失败:', error);
      return {
        valid: false,
        message: '验证失败'
      };
    }
  }

  /**
   * 验证商户是否存在且有效
   * @param merchantId 商户ID
   * @returns 验证结果
   */
  static async validateMerchant(
    merchantId: string
  ): Promise<{
    valid: boolean;
    message?: string;
    merchant?: any;
  }> {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId }
      });

      if (!merchant) {
        return {
          valid: false,
          message: '商户不存在'
        };
      }

      if (merchant.status !== 1) {
        return {
          valid: false,
          message: '商户已被禁用'
        };
      }

      return {
        valid: true,
        merchant
      };
    } catch (error) {
      console.error('验证商户失败:', error);
      return {
        valid: false,
        message: '验证失败'
      };
    }
  }
}

/**
 * 参数验证工具类
 */
export class ParamValidator {
  /**
   * 验证必填参数
   * @param params 参数对象
   * @param requiredFields 必填字段列表
   * @returns 验证结果
   */
  static validateRequired(
    params: Record<string, any>,
    requiredFields: string[]
  ): {
    valid: boolean;
    message?: string;
  } {
    for (const field of requiredFields) {
      if (!params[field]) {
        return {
          valid: false,
          message: `${field} 参数必填且必须为字符串`
        };
      }
    }
    return { valid: true };
  }

  /**
   * 验证分页参数
   * @param page 页码
   * @param pageSize 每页数量
   * @param maxPageSize 最大每页数量（默认100）
   * @returns 验证结果
   */
  static validatePagination(
    page?: string | number,
    pageSize?: string | number,
    maxPageSize: number = 100
  ): {
    valid: boolean;
    message?: string;
    pagination?: { page: number; pageSize: number };
  } {
    const pageNum = typeof page === 'string' ? parseInt(page) : (page || 1);
    const pageSizeNum = typeof pageSize === 'string' ? parseInt(pageSize) : (pageSize || 20);

    if (isNaN(pageNum) || pageNum < 1) {
      return {
        valid: false,
        message: 'page 参数必须为正整数'
      };
    }

    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > maxPageSize) {
      return {
        valid: false,
        message: `pageSize 参数必须为1-${maxPageSize}之间的整数`
      };
    }

    return {
      valid: true,
      pagination: { page: pageNum, pageSize: pageSizeNum }
    };
  }
}

/**
 * 综合权限校验工具类
 * 整合认证、权限、资源验证等功能
 */
export class PermissionChecker {
  /**
   * 执行完整的权限检查流程
   * @param user 用户信息
   * @param options 检查选项
   * @returns 检查结果
   */
  static async checkFullPermissions(
    user: any,
    options: {
      requiredMerchantId?: string;
      appId?: string;
      playerId?: string;
      resource?: string;
      action?: string;
      requiredParams?: { params: Record<string, any>; fields: string[] };
      pagination?: { page?: string | number; pageSize?: string | number };
    }
  ): Promise<{
    allowed: boolean;
    message?: string;
    data?: {
      merchantId?: string;
      app?: any;
      player?: any;
      pagination?: { page: number; pageSize: number };
    };
  }> {
    const result: any = { data: {} };

    // 1. 用户认证检查
    const authCheck = AuthUtils.checkAuthentication(user);
    if (!authCheck.authenticated) {
      return {
        allowed: false,
        message: authCheck.message
      };
    }

    // 2. 权限检查（如果指定）
    if (options.resource && options.action) {
      if (!PermissionUtils.hasPermission(user, options.resource, options.action)) {
        return {
          allowed: false,
          message: `需要 ${options.resource} 的 ${options.action} 权限`
        };
      }
    }

    // 3. 商户访问权限检查
    const merchantAccess = AuthUtils.getMerchantAccessPermission(user, options.requiredMerchantId);
    if (!merchantAccess.allowed) {
      return {
        allowed: false,
        message: merchantAccess.message
      };
    }
    result.data.merchantId = merchantAccess.merchantId;

    // 4. 必填参数验证（如果指定）
    if (options.requiredParams) {
      const paramCheck = ParamValidator.validateRequired(
        options.requiredParams.params,
        options.requiredParams.fields
      );
      if (!paramCheck.valid) {
        return {
          allowed: false,
          message: paramCheck.message
        };
      }
    }

    // 5. 分页参数验证（如果指定）
    if (options.pagination) {
      const paginationCheck = ParamValidator.validatePagination(
        options.pagination.page,
        options.pagination.pageSize
      );
      if (!paginationCheck.valid) {
        return {
          allowed: false,
          message: paginationCheck.message
        };
      }
      result.data.pagination = paginationCheck.pagination;
    }

    // 6. 应用验证（如果指定）
    if (options.appId && result.data.merchantId) {
      const appValidation = await ResourceValidator.validateApp(options.appId, result.data.merchantId);
      if (!appValidation.valid) {
        return {
          allowed: false,
          message: appValidation.message
        };
      }
      result.data.app = appValidation.app;
    }

    // 7. 玩家验证（如果指定）
    if (options.playerId && options.appId && result.data.merchantId) {
      const playerValidation = await PermissionUtils.validatePlayer(
        result.data.merchantId,
        options.appId,
        options.playerId
      );
      if (!playerValidation.valid) {
        return {
          allowed: false,
          message: playerValidation.message
        };
      }
      result.data.player = playerValidation.player;
    }

    return {
      allowed: true,
      ...result
    };
  }
}

/**
 * 道具相关权限常量
 */
export const ITEM_PERMISSIONS = {
  GRANT: { resource: 'item', action: 'grant' },
  VIEW: { resource: 'item', action: 'view' },
  UPDATE: { resource: 'item', action: 'update' },
  DELETE: { resource: 'item', action: 'delete' },
  CONSUME: { resource: 'item', action: 'consume' }
} as const;

/**
 * 应用相关权限常量
 */
export const APP_PERMISSIONS = {
  CREATE: { resource: 'app', action: 'create' },
  READ: { resource: 'app', action: 'read' },
  UPDATE: { resource: 'app', action: 'update' },
  DELETE: { resource: 'app', action: 'delete' }
} as const;

/**
 * 商户相关权限常量
 */
export const MERCHANT_PERMISSIONS = {
  CREATE: { resource: 'merchant', action: 'create' },
  READ: { resource: 'merchant', action: 'read' },
  UPDATE: { resource: 'merchant', action: 'update' },
  DELETE: { resource: 'merchant', action: 'delete' }
} as const;