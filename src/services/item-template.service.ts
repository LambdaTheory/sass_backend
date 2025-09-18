import { PrismaClient, ItemTemplate, ItemStatus, ItemLifecycle } from '@prisma/client';

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

    // 构建查询条件
    const where: any = {
      merchant_id: merchantId,
      app_id: appId
    };

    // 添加其他筛选条件
    if (item_type) {
      where.item_type = {
        contains: item_type
      };
    }

    if (item_name) {
      where.item_name = {
        contains: item_name
      };
    }

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    if (status !== undefined) {
      where.status = status;
    }

    if (id) {
      where.id = id;
    }

    try {
      // 计算分页参数
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // 并行查询总数和数据
      const [templates, total] = await Promise.all([
        this.prisma.itemTemplate.findMany({
          where,
          skip,
          take,
          orderBy: {
            created_at: 'desc'
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
        }),
        this.prisma.itemTemplate.count({ where })
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return {
        templates,
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
}