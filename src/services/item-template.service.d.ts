import { PrismaClient, ItemTemplate, ItemStatus, ItemLifecycle } from '@prisma/client';
export interface ItemTemplateQueryOptions {
    page?: number;
    pageSize?: number;
    item_type?: string;
    item_name?: string;
    is_active?: ItemStatus;
    status?: ItemLifecycle;
    id?: string;
}
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
export declare class ItemTemplateService {
    private prisma;
    constructor(prisma: PrismaClient);
    /**
     * 获取道具模板列表
     * @param merchantId 商户ID
     * @param appId 应用ID（必填）
     * @param options 查询选项
     * @returns 道具模板查询结果
     */
    getItemTemplates(merchantId: string, appId: string, options?: ItemTemplateQueryOptions): Promise<ItemTemplateQueryResult>;
    /**
     * 根据ID获取单个道具模板
     * @param templateId 模板ID
     * @param merchantId 商户ID
     * @returns 道具模板信息
     */
    getItemTemplateById(templateId: string, merchantId: string): Promise<ItemTemplate | null>;
    /**
     * 检查道具模板是否存在且属于指定商户
     * @param templateId 模板ID
     * @param merchantId 商户ID
     * @returns 是否存在
     */
    checkTemplateExists(templateId: string, merchantId: string): Promise<boolean>;
    /**
     * 更新道具模板
     * @param templateId 模板ID
     * @param merchantId 商户ID
     * @param updateData 更新数据
     * @returns 更新后的道具模板
     */
    updateItemTemplate(templateId: string, merchantId: string, updateData: Partial<{
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
    }>): Promise<ItemTemplate | null>;
    /**
     * 获取商户下指定应用的道具模板统计信息
     * @param merchantId 商户ID
     * @param appId 应用ID
     * @returns 统计信息
     */
    getTemplateStats(merchantId: string, appId?: string): Promise<{
        total: number;
        active: number;
        inactive: number;
        expired: number;
    }>;
    /**
     * 软删除道具模板（设置为待删除状态）
     * @param templateId 模板ID
     * @param merchantId 商户ID
     * @returns 删除结果
     */
    deleteItemTemplate(templateId: string, merchantId: string): Promise<ItemTemplate | null>;
    /**
     * 获取待删除的道具模板列表（用于定时任务）
     * @param daysBefore 多少天前的数据
     * @returns 待删除的模板列表
     */
    getPendingDeleteTemplates(daysBefore?: number): Promise<ItemTemplate[]>;
    /**
     * 永久删除道具模板（用于定时任务）
     * @param templateId 模板ID
     * @returns 删除结果
     */
    permanentDeleteTemplate(templateId: string): Promise<boolean>;
    /**
     * 批量处理待删除的道具模板（用于定时任务）
     * @param daysBefore 多少天前的数据
     * @returns 处理结果
     */
    cleanupPendingDeleteTemplates(daysBefore?: number): Promise<{
        processed: number;
        success: number;
        failed: number;
        errors: string[];
    }>;
}
//# sourceMappingURL=item-template.service.d.ts.map