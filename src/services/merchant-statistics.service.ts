import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';

// 道具统计数据类型定义
export interface ItemStatistics {
  item_id: string;
  item_name: string;
  total_granted: number;    // 总派发数量
  total_consumed: number;   // 总消耗数量
  current_balance: number;  // 当前剩余数量
}

// 应用统计数据类型定义
export interface AppStatistics {
  items: ItemStatistics[];
  active_players: number;     // 活跃用户数
  total_items_granted: number; // 总派发道具数
  total_items_consumed: number; // 总消耗道具数
  total_items_balance: number; // 总剩余道具数
}

export class MerchantStatisticsService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  /**
   * 获取应用道具统计数据
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @param startTime 开始时间戳（可选）
   * @param endTime 结束时间戳（可选）
   * @returns 应用统计数据
   */
  async getAppItemStatistics(
    merchantId: string,
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<AppStatistics> {
    try {
      // 1. 获取道具派发统计（从流水表）
      const grantStats = await this.getGrantStatistics(merchantId, appId, startTime, endTime);
      
      // 2. 获取道具消耗统计（从流水表）
      const consumeStats = await this.getConsumeStatistics(merchantId, appId, startTime, endTime);
      
      // 3. 获取当前剩余数量（从玩家道具表）
      const currentBalance = await this.getCurrentBalance(merchantId, appId);
      
      // 4. 获取活跃用户数
      const activePlayersCount = await this.getActivePlayersCount(merchantId, appId, startTime, endTime);
      
      // 5. 合并统计数据
      const mergedStats = await this.mergeStatistics(grantStats, consumeStats, currentBalance, merchantId, appId);
      
      // 6. 计算总计数据
      const totalGranted = mergedStats.reduce((sum, item) => sum + item.total_granted, 0);
      const totalConsumed = mergedStats.reduce((sum, item) => sum + item.total_consumed, 0);
      const totalBalance = mergedStats.reduce((sum, item) => sum + item.current_balance, 0);
      
      return {
        items: mergedStats,
        active_players: activePlayersCount,
        total_items_granted: totalGranted,
        total_items_consumed: totalConsumed,
        total_items_balance: totalBalance
      };
    } catch (error) {
      console.error('获取应用道具统计失败:', error);
      throw new Error('获取统计数据失败');
    }
  }

  /**
   * 获取道具派发统计
   */
  private async getGrantStatistics(
    merchantId: string,
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<Array<{ item_id: string; total_granted: number }>> {
    const tables = await this.shardingService.getItemRecordTables(appId, startTime, endTime);
    
    if (tables.length === 0) {
      return [];
    }

    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);

    if (existingTables.length === 0) {
      return [];
    }
    
    const queries = existingTables.map(table => {
      let whereClause = `merchant_id = '${merchantId}' AND app_id = '${appId}' AND record_type = 'GRANT'`;
      
      if (startTime) {
        whereClause += ` AND created_at >= ${startTime}`;
      }
      if (endTime) {
        whereClause += ` AND created_at <= ${endTime}`;
      }
      
      return `SELECT item_id, SUM(amount) as total_granted FROM \`${table}\` WHERE ${whereClause} GROUP BY item_id`;
    });
    
    const unionQuery = `
      SELECT item_id, SUM(total_granted) as total_granted
      FROM (${queries.join(' UNION ALL ')}) as subquery
      GROUP BY item_id
    `;
    
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ item_id: string; total_granted: bigint }>>(unionQuery);
      return result.map(row => ({
        item_id: row.item_id,
        total_granted: Number(row.total_granted)
      }));
    } catch (error) {
      console.warn('查询道具派发统计失败:', error);
      return [];
    }
  }

  /**
   * 获取道具消耗统计
   */
  private async getConsumeStatistics(
    merchantId: string,
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<Array<{ item_id: string; total_consumed: number }>> {
    const tables = await this.shardingService.getItemRecordTables(appId, startTime, endTime);
    
    if (tables.length === 0) {
      return [];
    }

    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);

    if (existingTables.length === 0) {
      return [];
    }
    
    const queries = existingTables.map(table => {
      let whereClause = `merchant_id = '${merchantId}' AND app_id = '${appId}' AND record_type = 'CONSUME'`;
      
      if (startTime) {
        whereClause += ` AND created_at >= ${startTime}`;
      }
      if (endTime) {
        whereClause += ` AND created_at <= ${endTime}`;
      }
      
      return `SELECT item_id, SUM(ABS(amount)) as total_consumed FROM \`${table}\` WHERE ${whereClause} GROUP BY item_id`;
    });
    
    const unionQuery = `
      SELECT item_id, SUM(total_consumed) as total_consumed
      FROM (${queries.join(' UNION ALL ')}) as subquery
      GROUP BY item_id
    `;
    
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ item_id: string; total_consumed: bigint }>>(unionQuery);
      return result.map(row => ({
        item_id: row.item_id,
        total_consumed: Number(row.total_consumed)
      }));
    } catch (error) {
      console.warn('查询道具消耗统计失败:', error);
      return [];
    }
  }

  /**
   * 获取当前剩余数量
   */
  private async getCurrentBalance(
    merchantId: string,
    appId: string
  ): Promise<Array<{ item_id: string; current_balance: number }>> {
    const tables = await this.shardingService.getAllPlayerItemTables(appId);
    
    if (tables.length === 0) {
      return [];
    }
 
    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);
    
    if (existingTables.length === 0) {
      return [];
    }
    
    const queries = existingTables.map(table => 
      `SELECT item_id, SUM(amount) as current_balance FROM \`${table}\` WHERE merchant_id = '${merchantId}' AND app_id = '${appId}' GROUP BY item_id`
    );
    
    const unionQuery = `
      SELECT item_id, SUM(current_balance) as current_balance
      FROM (${queries.join(' UNION ALL ')}) as subquery
      GROUP BY item_id
    `;
    
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ item_id: string; current_balance: bigint }>>(unionQuery);
      return result.map(row => ({
        item_id: row.item_id,
        current_balance: Number(row.current_balance)
      }));
    } catch (error) {
      console.warn('查询当前剩余数量失败:', error);
      return [];
    }
  }

  /**
   * 获取活跃用户数
   */
  private async getActivePlayersCount(
    merchantId: string,
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<number> {
    const tables = await this.shardingService.getItemRecordTables(appId, startTime, endTime);
    
    if (tables.length === 0) {
      return 0;
    }

    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);

    if (existingTables.length === 0) {
      return 0;
    }
    
    const queries = existingTables.map(table => {
      let whereClause = `merchant_id = '${merchantId}' AND app_id = '${appId}'`;
      
      if (startTime) {
        whereClause += ` AND created_at >= ${startTime}`;
      }
      if (endTime) {
        whereClause += ` AND created_at <= ${endTime}`;
      }
      
      return `SELECT DISTINCT player_id FROM \`${table}\` WHERE ${whereClause}`;
    });
    
    const unionQuery = `SELECT COUNT(DISTINCT player_id) as active_count FROM (${queries.join(' UNION ')}) as subquery`;
    
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ active_count: bigint }>>(unionQuery);
      return Number(result[0]?.active_count || 0);
    } catch (error) {
      console.warn('查询活跃用户数失败:', error);
      return 0;
    }
  }

  /**
   * 合并统计数据
   */
  private async mergeStatistics(
    grantStats: Array<{ item_id: string; total_granted: number }>,
    consumeStats: Array<{ item_id: string; total_consumed: number }>,
    balanceStats: Array<{ item_id: string; current_balance: number }>,
    merchantId: string,
    appId: string
  ): Promise<ItemStatistics[]> {
    // 首先获取应用下所有的道具模板
    const itemTemplates = await this.prisma.itemTemplate.findMany({
      where: {
        merchant_id: merchantId,
        app_id: appId,
        is_active: 'ACTIVE', // 只获取启用状态的道具模板
        status: 'NORMAL' // 只获取正常状态的道具模板
      },
      select: {
        id: true,
        item_name: true
      }
    });
    
    if (itemTemplates.length === 0) {
      return [];
    }
    
    // 创建统计数据映射
    const grantMap = new Map(grantStats.map(stat => [stat.item_id, stat.total_granted]));
    const consumeMap = new Map(consumeStats.map(stat => [stat.item_id, stat.total_consumed]));
    const balanceMap = new Map(balanceStats.map(stat => [stat.item_id, stat.current_balance]));
    
    // 为每个道具模板生成统计数据
    const result: ItemStatistics[] = itemTemplates.map(template => ({
      item_id: template.id,
      item_name: template.item_name,
      total_granted: grantMap.get(template.id) || 0,
      total_consumed: consumeMap.get(template.id) || 0,
      current_balance: balanceMap.get(template.id) || 0
    }));
    
    // 按道具ID排序
    return result.sort((a, b) => a.item_id.localeCompare(b.item_id));
  }

  /**
   * 获取单个道具的详细统计
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @param itemId 道具ID
   * @param startTime 开始时间戳（可选）
   * @param endTime 结束时间戳（可选）
   * @returns 道具统计数据
   */
  async getItemStatistics(
    merchantId: string,
    appId: string,
    itemId: string,
    startTime?: number,
    endTime?: number
  ): Promise<ItemStatistics | null> {
    const appStats = await this.getAppItemStatistics(merchantId, appId, startTime, endTime);
    return appStats.items.find(item => item.item_id === itemId) || null;
  }
}