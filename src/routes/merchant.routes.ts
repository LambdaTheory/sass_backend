import { Router, Request, Response } from "express";
import { prisma } from "../utils/database";
import { authMiddleware, requireRole } from "../middleware";
import {
  success,
  internalError,
  badRequest,
  notFound,
} from "../utils/response";
import { randomUUID } from "crypto";
const router = Router();

enum MerchantStatus {
  ENABLE = 1,
  DISABLE = 0,
}

/**
 * 商户列表
 * GET /list
 */

router.get(
  "/list",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { limit = 10, offset = 0 } = req.query;
    try {
      const merchants = await prisma.merchant.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          users: {
            select: {
              id: true,
              username: true,
              password: true,
            },
          },
        },
        take: Number(limit),
        skip: Number(offset),
      });

      res.json(success(merchants, "获取商户列表成功"));
    } catch (error) {
      console.error("获取商户列表失败:", error);
      const errorResponse = internalError("获取商户列表失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

/**
 * 创建商户
 */
router.post(
  "/create",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { name, account, password } = req.body;

    try {
      // 校验商户名称
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        const errorResponse = badRequest("商户名称不能为空");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }

      if (name.trim().length > 50) {
        const errorResponse = badRequest("商户名称长度不能超过50个字符");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }

      // 检查商户名称是否已存在
      const existingMerchant = await prisma.merchant.findFirst({
        where: { name: name.trim() },
      });

      if (existingMerchant) {
        const errorResponse = badRequest("商户名称已存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username: account },
      });

      if (existingUser) {
        const errorResponse = badRequest("用户名已存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }

      // 使用事务确保数据一致性
      const result = await prisma.$transaction(async (tx) => {
        const now = Date.now();
        const merchantId = randomUUID();
        const userId = randomUUID();

        // 1. 创建商户
        const merchant = await tx.merchant.create({
          data: {
            id: merchantId,
            name: name.trim(),
            status: 1,
            created_at: now,
            updated_at: now,
          },
        });

        // 2. 创建用户
        const user = await tx.user.create({
          data: {
            id: userId,
            username: account,
            password,
            user_type: "MERCHANT_OWNER",
            merchant_id: merchantId,
            status: 1,
            created_at: now,
            updated_at: now,
          },
        });

        // 3. 获取MERCHANT_OWNER的默认权限
        const merchantUserPermissions = [
          "application_create",
          "application_ban",
          "application_unban",
          "item_create",
          "item_modify",
          "item_ban",
          "item_unban",
        ];

        // 5. 查询权限ID
        const permissions = await tx.permission.findMany({
          where: {
            name: {
              in: merchantUserPermissions,
            },
          },
        });

        // 6. 为用户分配默认权限
        const userPermissions = permissions.map((permission) => ({
          id: randomUUID(),
          user_id: userId,
          permission_id: permission.id,
          created_at: now,
        }));

        if (userPermissions.length > 0) {
          await tx.userPermission.createMany({
            data: userPermissions,
          });
        }

        return {
          merchant: {
            ...merchant,
            created_at: Number(merchant.created_at),
            updated_at: Number(merchant.updated_at),
          },
        };
      });

      res.json(
        success(
          {
            merchant: result.merchant,
          },
          "创建商户成功"
        )
      );
    } catch (error) {
      console.error("创建商户失败:", error);
      const errorResponse = internalError("创建商户失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

/**
 * 修改商户状态
 */
router.put(
  "/status",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { merchantId, status } = req.body;
    try {
      // 校验参数
      if (!merchantId) {
        const errorResponse = badRequest("商户ID不能为空");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      if (
        status !== MerchantStatus.ENABLE &&
        status !== MerchantStatus.DISABLE
      ) {
        const errorResponse = badRequest("状态值必须为1或0");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 校验商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: {
          id: merchantId,
        },
      });
      if (!merchant) {
        const errorResponse = notFound("商户不存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 更新状态
      await prisma.merchant.update({
        where: {
          id: merchantId,
        },
        data: {
          status: status,
        },
      });

      // 更新关联的商户用户状态
      await prisma.user.updateMany({
        where: {
          merchant_id: merchantId,
        },
        data: {
          status,
        },
      });

      const message =
        status === MerchantStatus.ENABLE ? "启用商户" : "禁用商户";

      res.json(success({}, `${message}成功`));
    } catch (error) {
      console.error("修改商户状态失败:", error);
      const errorResponse = internalError("修改商户状态失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

/**
 * 删除商户
 */
router.delete(
  "/:merchantId",
  authMiddleware,
  requireRole(["SUPER_ADMIN"]),
  async (req: Request, res: Response) => {
    const { merchantId } = req.params;
    try {
      // 校验参数
      if (!merchantId) {
        const errorResponse = badRequest("商户ID不能为空");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 校验商户是否存在
      const merchant = await prisma.merchant.findUnique({
        where: {
          id: merchantId,
        },
      });
      if (!merchant) {
        const errorResponse = notFound("商户不存在");
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      // 删除商户
      await prisma.merchant.delete({
        where: {
          id: merchantId,
        },
      });
      // 先获取要删除的用户ID列表
      const usersToDelete = await prisma.user.findMany({
        where: {
          merchant_id: merchantId,
        },
        select: {
          id: true,
        },
      });
      const userIds = usersToDelete.map(user => user.id);
      
      // 删除关联的商户用户权限
      if (userIds.length > 0) {
        await prisma.userPermission.deleteMany({
          where: {
            user_id: {
              in: userIds,
            },
          },
        });
      }
      
      // 删除关联的商户用户
      await prisma.user.deleteMany({
        where: {
          merchant_id: merchantId,
        },
      });
      res.json(success({}, "删除商户成功"));
    } catch (error) {
      console.error("删除商户失败:", error);
      const errorResponse = internalError("删除商户失败");
      res.status(errorResponse.code).json(errorResponse);
    }
  }
);

export default router;
