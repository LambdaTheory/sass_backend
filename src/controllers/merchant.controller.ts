import { Request, Response } from "express";
import { prisma } from "../utils/database";
import {
  success,
  internalError,
  badRequest,
  notFound,
  sendSuccess,
  sendInternalError,
  sendBadRequest,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
} from "../utils/response";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { AuthRequest } from "../types";
import { AuthUtils } from "../utils/permission";
import { MerchantKeyService } from "../services/merchant-key.service";

enum MerchantStatus {
  ENABLE = 1,
  DISABLE = 0,
}

/**
 * 商户控制器
 * 负责处理商户相关的HTTP请求
 */
export class MerchantController {
  /**
   * 获取商户列表
   */
  static async getMerchantList(req: AuthRequest, res: Response) {
    const user = req.user;
    const { current = 1, pageSize = 10, id, name, status } = req.query;

    try {
      // 权限检查：只有超级管理员可以获取商户列表
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      if (!AuthUtils.isSuperAdmin(user)) {
        return sendForbidden(res, "权限不足，只有超级管理员可以获取商户列表");
      }

      // 计算分页参数
      const currentPage = Number(current);
      const size = Number(pageSize);
      const offset = (currentPage - 1) * size;

      // 构建查询条件
      const whereCondition: any = {};
      if (id) {
        whereCondition.id = id;
      }
      if (name) {
        whereCondition.name = {
          contains: name,
        };
      }
      if (status !== undefined) {
        whereCondition.status = Number(status);
      }

      // 获取总数
      const total = await prisma.merchant.count({
        where: whereCondition,
      });

      // 获取商户列表
      const merchants = await prisma.merchant.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          status: true,
          created_at: true,
          updated_at: true,
          users: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        take: size,
        skip: offset,
        orderBy: {
          created_at: 'desc',
        },
      });

      // 处理BigInt转换
      const processedMerchants = merchants.map(merchant => ({
        ...merchant,
        created_at: merchant.created_at ? Number(merchant.created_at) : null,
        updated_at: merchant.updated_at ? Number(merchant.updated_at) : null,
      }));

      const responseData = {
        list: processedMerchants,
        pagination: {
          current: currentPage,
          pageSize: size,
          total,
          totalPages: Math.ceil(total / size),
        },
      };

      sendSuccess(res, responseData, "获取商户列表成功");
    } catch (error) {
      console.error("获取商户列表失败:", error);
      sendInternalError(res, "获取商户列表失败");
    }
  }

  /**
   * 创建商户
   */
  static async createMerchant(req: AuthRequest, res: Response) {
    const user = req.user;
    let { name, username, password, status } = req.body;

    try {
      // 权限检查：只有超级管理员可以创建商户
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      if (!AuthUtils.isSuperAdmin(user)) {
        return sendForbidden(res, "权限不足，只有超级管理员可以创建商户");
      }
      
      // 参数预处理：去除首尾空格
      name = name?.trim();
      username = username?.trim();
      password = password?.trim();
      
      // 参数验证
      // 商户名称验证
      if (!name) {
        return sendBadRequest(res, "商户名称不能为空");
      }
      if (name.length > 30) {
        return sendBadRequest(res, "商户名称不能超过30个字符");
      }
      // 检查是否包含中文、符号等非法字符（只允许字母、数字、下划线、中划线）
      const namePattern = /^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/;
      if (!namePattern.test(name)) {
        return sendBadRequest(res, "商户名称只能包含字母、数字、下划线、中划线和中文字符");
      }

      // 登录账号验证
      if (!username) {
        return sendBadRequest(res, "登录账号不能为空");
      }
      if (username.length > 30) {
        return sendBadRequest(res, "登录账号不能超过30个字符");
      }
      // 检查是否包含中文、符号等非法字符（只允许字母、数字、下划线）
      const usernamePattern = /^[a-zA-Z0-9_]+$/;
      if (!usernamePattern.test(username)) {
        return sendBadRequest(res, "登录账号只能包含字母、数字和下划线");
      }

      // 登录密码验证
      if (!password) {
        return sendBadRequest(res, "登录密码不能为空");
      }
      if (password.length > 30) {
        return sendBadRequest(res, "登录密码不能超过30个字符");
      }
      // 检查是否包含中文、符号等非法字符（只允许字母、数字、特殊符号）
      const passwordPattern = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;
      if (!passwordPattern.test(password)) {
        return sendBadRequest(res, "登录密码只能包含字母、数字和常用特殊符号");
      }

      // 状态验证
      if (status !== undefined && ![MerchantStatus.ENABLE, MerchantStatus.DISABLE].includes(Number(status))) {
        return sendBadRequest(res, "状态值无效，只能为0（禁用）或1（启用）");
      }

      // 检查商户名称是否已存在
      const existingMerchant = await prisma.merchant.findFirst({
        where: { name },
      });

      if (existingMerchant) {
        return sendBadRequest(res, "商户名称已存在");
      }

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return sendBadRequest(res, "用户名已存在");
      }

      // 密码加密
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // 创建商户和用户（事务处理）
      const result = await prisma.$transaction(async (tx) => {
        // 创建商户
        const merchant = await tx.merchant.create({
          data: {
            id: randomUUID(),
            name,
            status: status !== undefined ? Number(status) : MerchantStatus.ENABLE,
            created_at: BigInt(Date.now()),
            updated_at: BigInt(Date.now()),
          },
        });

        // 创建商户管理员用户
        const user = await tx.user.create({
          data: {
            id: randomUUID(),
            username,
            password: hashedPassword,
            user_type: "MERCHANT_OWNER",
            merchant_id: merchant.id,
            status: 1,
            created_at: BigInt(Date.now()),
            updated_at: BigInt(Date.now()),
          },
        });

        return { merchant, user };
      });

      const responseData = {
        merchant: {
          id: result.merchant.id,
          name: result.merchant.name,
          status: result.merchant.status,
        },
        user: {
          id: result.user.id,
          username: result.user.username,
        },
      };

      sendSuccess(res, responseData, "创建商户成功");
    } catch (error) {
      console.error("创建商户失败:", error);
      sendInternalError(res, "创建商户失败");
    }
  }

  /**
   * 更新商户状态
   */
  static async updateMerchantStatus(req: AuthRequest, res: Response) {
    const user = req.user;
    const { merchant_id, status } = req.body;

    try {
      // 权限检查：只有超级管理员可以更新商户状态
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      if (!AuthUtils.isSuperAdmin(user)) {
        return sendForbidden(res, "权限不足，只有超级管理员可以更新商户状态");
      }
      // 参数验证
      if (!merchant_id || status === undefined) {
        return sendBadRequest(res, "商户ID和状态不能为空");
      }

      if (![MerchantStatus.ENABLE, MerchantStatus.DISABLE].includes(status)) {
        return sendBadRequest(res, "状态值无效");
      }

      // 检查商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchant_id },
      });

      if (!merchant) {
        return sendNotFound(res, "商户不存在");
      }

      // 更新商户状态
      const updatedMerchant = await prisma.merchant.update({
        where: { id: merchant_id },
        data: {
          status,
          updated_at: BigInt(Date.now()),
        },
      });

      const responseData = {
        id: updatedMerchant.id,
        name: updatedMerchant.name,
        status: updatedMerchant.status,
      };

      sendSuccess(res, responseData, "更新商户状态成功");
    } catch (error) {
      console.error("更新商户状态失败:", error);
      sendInternalError(res, "更新商户状态失败");
    }
  }

  /**
   * 删除商户
   */
  static async deleteMerchant(req: AuthRequest, res: Response) {
    const user = req.user;
    const { merchantId } = req.params;

    try {
      // 权限检查：只有超级管理员可以删除商户
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      if (!AuthUtils.isSuperAdmin(user)) {
        return sendForbidden(res, "权限不足，只有超级管理员可以删除商户");
      }
      // 参数验证
      if (!merchantId) {
        return sendBadRequest(res, "商户ID不能为空");
      }

      // 检查商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: {
          users: true,
          apps: true,
        },
      });

      if (!merchant) {
        return sendNotFound(res, "商户不存在");
      }

      // 检查是否有关联的应用
      if (merchant.apps.length > 0) {
        return sendBadRequest(res, "该商户下还有应用，无法删除");
      }

      // 删除商户（级联删除用户）
      await prisma.merchant.delete({
        where: { id: merchantId },
      });

      sendSuccess(res, null, "删除商户成功");
    } catch (error) {
      console.error("删除商户失败:", error);
      sendInternalError(res, "删除商户失败");
    }
  }

  /**
   * 生成商户密钥对
   */
  static async generateMerchantKeys(req: AuthRequest, res: Response) {
    const user = req.user;
    const { merchantId } = req.params;

    try {
      // 权限检查：只有超级管理员或商户所有者可以生成密钥
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      // 检查商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
      });

      if (!merchant) {
        return sendNotFound(res, "商户不存在");
      }

      // 权限验证：超级管理员或商户所有者
      if (!AuthUtils.isSuperAdmin(user) && user.merchant_id !== merchantId) {
        return sendForbidden(res, "权限不足，只能管理自己的商户密钥");
      }

      // 生成HMAC密钥
      const merchantKeyService = new MerchantKeyService();
      const hmacKey = await merchantKeyService.generateMerchantKeys(merchantId);

      const responseData = {
        merchantId,
        hmacKey: hmacKey.key,
        message: "HMAC密钥生成成功，请妥善保管密钥",
      };

      sendSuccess(res, responseData, "生成商户密钥对成功");
    } catch (error) {
      console.error("生成商户密钥对失败:", error);
      sendInternalError(res, "生成商户密钥对失败");
    }
  }

  /**
   * 获取商户公钥（供C端使用）
   */
  static async getMerchantPublicKey(req: Request, res: Response) {
    const { merchantId } = req.params;

    try {
      // 参数验证
      if (!merchantId) {
        return sendBadRequest(res, "商户ID不能为空");
      }

      // 获取商户HMAC密钥
      const merchantKeyService = new MerchantKeyService();
      const hmacKey = await merchantKeyService.getMerchantHmacKey(merchantId);

      if (!hmacKey) {
        return sendNotFound(res, "商户HMAC密钥不存在，请先生成密钥");
      }

      const responseData = {
        merchantId,
        hmacKey,
        message: "获取HMAC密钥成功，请使用此密钥进行签名",
      };

      sendSuccess(res, responseData, "获取商户HMAC密钥成功");
    } catch (error) {
      console.error("获取商户公钥失败:", error);
      sendInternalError(res, "获取商户公钥失败");
    }
  }

  /**
   * 获取商户密钥信息（管理端使用）
   */
  static async getMerchantKeyInfo(req: AuthRequest, res: Response) {
    const user = req.user;
    const { merchantId } = req.params;

    try {
      // 权限检查
      if (!user) {
        return sendUnauthorized(res, "用户未认证");
      }

      // 检查商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: {
          id: true,
          name: true,
          hmac_key: true,
          key_created_at: true,
        },
      });

      if (!merchant) {
        return sendNotFound(res, "商户不存在");
      }

      // 权限验证：超级管理员或商户所有者
      if (!AuthUtils.isSuperAdmin(user) && user.merchant_id !== merchantId) {
        return sendForbidden(res, "权限不足，只能查看自己的商户密钥信息");
      }

      const responseData = {
        merchantId: merchant.id,
        merchantName: merchant.name,
        hasHmacKey: !!merchant.hmac_key,
        keyGeneratedAt: merchant.key_created_at,
        hmacKey: merchant.hmac_key, // 返回HMAC密钥供查看
      };

      sendSuccess(res, responseData, "获取商户密钥信息成功");
    } catch (error) {
      console.error("获取商户密钥信息失败:", error);
      sendInternalError(res, "获取商户密钥信息失败");
    }
  }
}
