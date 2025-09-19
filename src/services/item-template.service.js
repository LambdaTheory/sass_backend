"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemTemplateService = void 0;
const client_1 = require("@prisma/client");
/**
 * 道具模板服务类
 * 负责道具模板相关的业务逻辑处理
 */
class ItemTemplateService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * 获取道具模板列表
     * @param merchantId 商户ID
     * @param appId 应用ID（必填）
     * @param options 查询选项
     * @returns 道具模板查询结果
     */
    async getItemTemplates(merchantId, appId, options = {}) {
        const { page = 1, pageSize = 20, item_type, item_name, is_active, status, id } = options;
        // 构建查询条件
        const where = {
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
        }
        catch (error) {
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
    async getItemTemplateById(templateId, merchantId) {
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
        }
        catch (error) {
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
    async checkTemplateExists(templateId, merchantId) {
        try {
            const count = await this.prisma.itemTemplate.count({
                where: {
                    id: templateId,
                    merchant_id: merchantId
                }
            });
            return count > 0;
        }
        catch (error) {
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
    async updateItemTemplate(templateId, merchantId, updateData) {
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
        }
        catch (error) {
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
    async getTemplateStats(merchantId, appId) {
        try {
            const where = {
                merchant_id: merchantId
            };
            if (appId) {
                where.app_id = appId;
            }
            const [total, active, inactive, expired] = await Promise.all([
                this.prisma.itemTemplate.count({ where }),
                this.prisma.itemTemplate.count({
                    where: { ...where, is_active: client_1.ItemStatus.ACTIVE }
                }),
                this.prisma.itemTemplate.count({
                    where: { ...where, is_active: client_1.ItemStatus.INACTIVE }
                }),
                this.prisma.itemTemplate.count({
                    where: { ...where, status: client_1.ItemLifecycle.EXPIRED }
                })
            ]);
            return {
                total,
                active,
                inactive,
                expired
            };
        }
        catch (error) {
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
    async deleteItemTemplate(templateId, merchantId) {
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
            if (existingTemplate.status === client_1.ItemLifecycle.DELETED ||
                existingTemplate.status === client_1.ItemLifecycle.PENDING_DELETE) {
                return existingTemplate;
            }
            // 更新模板状态为待删除，并记录确认删除时间
            const updatedTemplate = await this.prisma.itemTemplate.update({
                where: {
                    id: templateId
                },
                data: {
                    status: client_1.ItemLifecycle.PENDING_DELETE,
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
        }
        catch (error) {
            console.error('删除道具模板失败:', error);
            throw new Error('删除道具模板失败');
        }
    }
    /**
     * 获取待删除的道具模板列表（用于定时任务）
     * @param daysBefore 多少天前的数据
     * @returns 待删除的模板列表
     */
    async getPendingDeleteTemplates(daysBefore = 7) {
        try {
            const cutoffTime = BigInt(Date.now() - daysBefore * 24 * 60 * 60 * 1000);
            const templates = await this.prisma.itemTemplate.findMany({
                where: {
                    status: client_1.ItemLifecycle.PENDING_DELETE,
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
        }
        catch (error) {
            console.error('获取待删除道具模板列表失败:', error);
            throw new Error('获取待删除道具模板列表失败');
        }
    }
    /**
     * 永久删除道具模板（用于定时任务）
     * @param templateId 模板ID
     * @returns 删除结果
     */
    async permanentDeleteTemplate(templateId) {
        try {
            // 更新状态为已删除，而不是物理删除
            const result = await this.prisma.itemTemplate.update({
                where: {
                    id: templateId
                },
                data: {
                    status: client_1.ItemLifecycle.DELETED,
                    updated_at: BigInt(Date.now())
                }
            });
            return !!result;
        }
        catch (error) {
            console.error('永久删除道具模板失败:', error);
            throw new Error('永久删除道具模板失败');
        }
    }
    /**
     * 批量处理待删除的道具模板（用于定时任务）
     * @param daysBefore 多少天前的数据
     * @returns 处理结果
     */
    async cleanupPendingDeleteTemplates(daysBefore = 7) {
        try {
            const pendingTemplates = await this.getPendingDeleteTemplates(daysBefore);
            const result = {
                processed: pendingTemplates.length,
                success: 0,
                failed: 0,
                errors: []
            };
            for (const template of pendingTemplates) {
                try {
                    await this.permanentDeleteTemplate(template.id);
                    result.success++;
                    console.log(`成功删除道具模板: ${template.id} (${template.item_name})`);
                }
                catch (error) {
                    result.failed++;
                    const errorMsg = `删除道具模板失败: ${template.id} - ${error}`;
                    result.errors.push(errorMsg);
                    console.error(errorMsg);
                }
            }
            return result;
        }
        catch (error) {
            console.error('批量清理待删除道具模板失败:', error);
            throw new Error('批量清理待删除道具模板失败');
        }
    }
}
exports.ItemTemplateService = ItemTemplateService;
//# sourceMappingURL=item-template.service.js.map