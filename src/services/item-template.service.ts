import { PrismaClient, ItemTemplate, ItemStatus, ItemLifecycle, Prisma } from '@prisma/client';

// 道具模板查询选项
export interface ItemTemplateQueryOptions {
  page?: number;
  pageSize?: number;
  item_type?: string;
  item_name?: string;
  is_active?: ItemStatus;
  status?: ItemLifecycle;
  id?: string;
}

// 道具模板查询结果
export interface ItemTemplateQueryResult {
  templates: ItemTemplate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 道具模板服务类
 * 负责道具模板相关的业务逻辑处理
 */
export class ItemTemplateService {
  constructor(private prisma: PrismaClient) {}

  /**
   * 获取道具模板列表
   * @param merchantId 商户ID
   * @param appId 应用ID（必填）
   * @param options 查询选项
   * @returns 道具模板查询结果
   */
  async getItemTemplates(
    merchantId: string,
    appId: string,
    options: ItemTemplateQueryOptions = {}
  ): Promise<ItemTemplateQueryResult> {
    const {
      page = 1,
      pageSize = 20,
      item_type,
      item_name,
      is_active,
      status,
      id
    } = options;

    // 构建查询条件和参数
    let whereClause = 'WHERE it.merchant_id = ? AND it.app_id = ?';
    const queryParams: any[] = [merchantId, appId];

    // 添加其他筛选条件
    if (item_type) {
      whereClause += ` AND it.item_type COLLATE utf8mb4_bin LIKE ?`;
      queryParams.push(`%${item_type}%`);
    }

    if (item_name) {
      whereClause += ` AND it.item_name COLLATE utf8mb4_bin LIKE ?`;
      queryParams.push(`%${item_name}%`);
    }

    if (is_active !== undefined) {
      whereClause += ` AND it.is_active = ?`;
      queryParams.push(is_active);
    }

    if (status !== undefined) {
      whereClause += ` AND it.status = ?`;
      queryParams.push(status);
    }

    if (id) {
      whereClause += ` AND it.id = ?`;
      queryParams.push(id);
    }

    try {
      // 计算分页参数
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM ItemTemplate it
        ${whereClause}
      `;
      const countResult = await this.prisma.$queryRaw<[{total: bigint}]>(
        Prisma.sql([countQuery], ...queryParams)
      );
      const total = Number(countResult[0].total);

      // 获取数据
      const templatesQuery = `
        SELECT 
          it.*,
          JSON_OBJECT('id', a.id, 'name', a.name) as app,
          JSON_OBJECT('id', m.id, 'name', m.name) as merchant
        FROM ItemTemplate it
        LEFT JOIN App a ON it.app_id = a.id
        LEFT JOIN Merchant m ON it.merchant_id = m.id
        ${whereClause}
        ORDER BY it.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const templates = await this.prisma.$queryRaw<any[]>(
        Prisma.sql([templatesQuery], ...queryParams, take, skip)
      );

      // 处理JSON字段
      const processedTemplates = templates.map(template => {
        let app = null;
        let merchant = null;
        
        try {
          app = typeof template.app === 'string' ? JSON.parse(template.app) : template.app;
          merchant = typeof template.merchant === 'string' ? JSON.parse(template.merchant) : template.merchant;
        } catch (error) {
          console.error('解析关联数据失败:', error);
        }
        
        return {
          ...template,
          app,
          merchant,
          created_at: template.created_at ? Number(template.created_at) : null,
          updated_at: template.updated_at ? Number(template.updated_at) : null,
        };
      });

      const totalPages = Math.ceil(total / pageSize);

      return {
        templates: processedTemplates,
        total,
        page,
        pageSize,
        totalPages
      };
    } catch (error) {
      console.error('获取道具模板列表失败:', error);
      throw new Error('获取道具模板列表失败');
    }
  }

  /**
   * 根据ID获取单个道具模板
   * @param templateId 模板ID
   * @param merchantId 商户ID
   * @returns 道具模板信息
   */
  async getItemTemplateById(
    templateId: string,
    merchantId: string
  ): Promise<ItemTemplate | null> {
    try {
      const template = await this.prisma.itemTemplate.findFirst({
        where: {
          id: templateId,
          merchant_id: merchantId
        },
        include: {
          app: {
            select: {
              id: true,
              name: true
            }
          },
          merchant: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return template;
    } catch (error) {
      console.error('获取道具模板详情失败:', error);
      throw new Error('获取道具模板详情失败');
    }
  }

  /**
   * 检查道具模板是否存在且属于指定商户
   * @param templateId 模板ID
   * @param merchantId 商户ID
   * @returns 是否存在
   */
  async checkTemplateExists(
    templateId: string,
    merchantId: string
  ): Promise<boolean> {
    try {
      const count = await this.prisma.itemTemplate.count({
        where: {
          id: templateId,
          merchant_id: merchantId
        }
      });

      return count > 0;
    } catch (error) {
      console.error('检查道具模板是否存在失败:', error);
      throw new Error('检查道具模板是否存在失败');
    }
  }

  /**
   * 更新道具模板
   * @param templateId 模板ID
   * @param merchantId 商户ID
   * @param updateData 更新数据
   * @returns 更新后的道具模板
   */
  async updateItemTemplate(
    templateId: string,
    merchantId: string,
    updateData: Partial<{
      item_name: string;
      item_type: string;
      item_icon: string | null;
      eff_arg: string;
      is_active: ItemStatus;
      status: ItemLifecycle;
      expire_duration: number | null;
      expire_date: bigint | null;
      limit_max: number | null;
      daily_limit_max: number | null;
      total_limit: number | null;
      custom: string | null;
    }>
  ): Promise<ItemTemplate | null> {
    try {
      // 首先检查模板是否存在且属于指定商户
      const existingTemplate = await this.prisma.itemTemplate.findFirst({
        where: {
          id: templateId,
          merchant_id: merchantId
        }
      });

      if (!existingTemplate) {
        return null;
      }

      // 更新模板
      const updatedTemplate = await this.prisma.itemTemplate.update({
        where: {
          id: templateId
        },
        data: {
          ...updateData,
          updated_at: BigInt(Date.now())
        },
        include: {
          app: {
            select: {
              id: true,
              name: true
            }
          },
          merchant: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // TODO: 更新后需要影响所有已发出的道具数据
      // 特别是有效期变更时，需要同步更新所有相关道具的状态
      // 例如：如果将道具模板的有效期改为过去的时间，
      // 则需要将所有基于此模板发出的道具都标记为过期
      // 这部分逻辑待后续完善道具发放功能后实现

      return updatedTemplate;
    } catch (error) {
      console.error('更新道具模板失败:', error);
      throw new Error('更新道具模板失败');
    }
  }

  /**
   * 获取商户下指定应用的道具模板统计信息
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @returns 统计信息
   */
  async getTemplateStats(
    merchantId: string,
    appId?: string
  ): Promise<{
    total: number;
    active: number;
    inactive: number;
    expired: number;
  }> {
    try {
      const where: any = {
        merchant_id: merchantId
      };

      if (appId) {
        where.app_id = appId;
      }

      const [total, active, inactive, expired] = await Promise.all([
        this.prisma.itemTemplate.count({ where }),
        this.prisma.itemTemplate.count({
          where: { ...where, is_active: ItemStatus.ACTIVE }
        }),
        this.prisma.itemTemplate.count({
          where: { ...where, is_active: ItemStatus.INACTIVE }
        }),
        this.prisma.itemTemplate.count({
          where: { ...where, status: ItemLifecycle.EXPIRED }
        })
      ]);

      return {
        total,
        active,
        inactive,
        expired
      };
    } catch (error) {
      console.error('获取道具模板统计信息失败:', error);
      throw new Error('获取道具模板统计信息失败');
    }
  }

  /**
   * 软删除道具模板（设置为待删除状态）
   * @param templateId 模板ID
   * @param merchantId 商户ID
   * @returns 删除结果
   */
  async deleteItemTemplate(
    templateId: string,
    merchantId: string
  ): Promise<ItemTemplate | null> {
    try {
      // 首先检查模板是否存在且属于指定商户
      const existingTemplate = await this.prisma.itemTemplate.findFirst({
        where: {
          id: templateId,
          merchant_id: merchantId
        }
      });

      if (!existingTemplate) {
        return null;
      }

      // 检查模板是否已经是删除状态
      if (existingTemplate.status === ItemLifecycle.DELETED || 
          existingTemplate.status === ItemLifecycle.PENDING_DELETE) {
        return existingTemplate;
      }

      // 更新模板状态为待删除，并记录确认删除时间
      const updatedTemplate = await this.prisma.itemTemplate.update({
        where: {
          id: templateId
        },
        data: {
          status: ItemLifecycle.PENDING_DELETE,
          confirmed_delete_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now())
        },
        include: {
          app: {
            select: {
              id: true,
              name: true
            }
          },
          merchant: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return updatedTemplate;
    } catch (error) {
      console.error('删除道具模板失败:', error);
      throw new Error('删除道具模板失败');
    }
  }

  /**
   * 获取待删除的道具模板列表（用于定时任务）
   * @param daysBefore 多少天前的数据
   * @returns 待删除的模板列表
   */
  async getPendingDeleteTemplates(daysBefore: number = 7): Promise<ItemTemplate[]> {
    try {
      const cutoffTime = BigInt(Date.now() - daysBefore * 24 * 60 * 60 * 1000);
      
      const templates = await this.prisma.itemTemplate.findMany({
        where: {
          status: ItemLifecycle.PENDING_DELETE,
          confirmed_delete_at: {
            lte: cutoffTime
          }
        },
        include: {
          app: {
            select: {
              id: true,
              name: true
            }
          },
          merchant: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return templates;
    } catch (error) {
      console.error('获取待删除道具模板列表失败:', error);
      throw new Error('获取待删除道具模板列表失败');
    }
  }

  /**
   * 永久删除道具模板（用于定时任务）
   * @param templateId 模板ID
   * @returns 删除结果
   */
  async permanentDeleteTemplate(templateId: string): Promise<boolean> {
    try {
      // 更新状态为已删除，而不是物理删除
      const result = await this.prisma.itemTemplate.update({
        where: {
          id: templateId
        },
        data: {
          status: ItemLifecycle.DELETED,
          updated_at: BigInt(Date.now())
        }
      });

      return !!result;
    } catch (error) {
      console.error('永久删除道具模板失败:', error);
      throw new Error('永久删除道具模板失败');
    }
  }

  /**
   * 批量处理待删除的道具模板（用于定时任务）
   * @param daysBefore 多少天前的数据
   * @returns 处理结果
   */
  async cleanupPendingDeleteTemplates(daysBefore: number = 7): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }> {
    try {
      const pendingTemplates = await this.getPendingDeleteTemplates(daysBefore);
      const result = {
        processed: pendingTemplates.length,
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      for (const template of pendingTemplates) {
        try {
          await this.permanentDeleteTemplate(template.id);
          result.success++;
          console.log(`成功删除道具模板: ${template.id} (${template.item_name})`);
        } catch (error) {
          result.failed++;
          const errorMsg = `删除道具模板失败: ${template.id} - ${error}`;
          result.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      return result;
    } catch (error) {
      console.error('批量清理待删除道具模板失败:', error);
      throw new Error('批量清理待删除道具模板失败');
    }
  }
}