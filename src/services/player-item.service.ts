import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';

// 玩家道具类型定义
export interface PlayerItem {
  id: number;
  merchant_id: string;
  app_id: string;
  player_id: string;
  item_id: string;
  amount: number;
  expire_time?: number;
  obtain_time: number;
  status: 'normal' | 'expired';
}

export class PlayerItemService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  // ==================== 创建玩家道具 ====================

  async createPlayerItem(data: Omit<PlayerItem, 'id'>): Promise<PlayerItem> {
    const tableName = this.shardingService.getPlayerItemTable(data.merchant_id, data.obtain_time);
    
    const createSQL = `
      INSERT INTO \`${tableName}\` (
        merchant_id, app_id, player_id, item_id, amount, 
        expire_time, obtain_time, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const now = Math.floor(Date.now() / 1000);
    
    await this.prisma.$executeRawUnsafe(createSQL, 
      data.merchant_id,
      data.app_id,
      data.player_id,
      data.item_id,
      data.amount,
      data.expire_time,
      data.obtain_time,
      data.status,
      now,
      now
    );
    
    // 获取插入的记录
    const result = await this.prisma.$queryRawUnsafe<PlayerItem[]>(
      `SELECT * FROM \`${tableName}\` WHERE id = LAST_INSERT_ID()`
    );
    
    return result[0];
  }

  // ==================== 查询玩家道具 ====================

  async getPlayerItems(
    merchantId: string,
    appId: string,
    playerId: string,
    startTime?: number,
    endTime?: number
  ): Promise<PlayerItem[]> {
    const tables = await this.shardingService.getPlayerItemTables(merchantId, startTime, endTime);
    
    if (tables.length === 0) {
      return [];
    }
    
    const queries = tables.map(table => {
      const whereConditions = [
        `merchant_id = '${merchantId}'`,
        `app_id = '${appId}'`,
        `player_id = '${playerId}'`
      ];
      
      if (startTime) {
        whereConditions.push(`obtain_time >= ${startTime}`);
      }
      
      if (endTime) {
        whereConditions.push(`obtain_time <= ${endTime}`);
      }
      
      return `SELECT * FROM \`${table}\` WHERE ${whereConditions.join(' AND ')}`;
    });
    
    const unionQuery = queries.join(' UNION ALL ');
    const results = await this.prisma.$queryRawUnsafe<PlayerItem[]>(unionQuery);
    
    // 实时计算过期状态
    const now = Math.floor(Date.now() / 1000);
    return results.map(item => ({
      ...item,
      status: item.expire_time && now > item.expire_time ? 'expired' : 'normal'
    }));
  }

  // ==================== 更新玩家道具 ====================

  async updatePlayerItem(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string,
    updates: Partial<Pick<PlayerItem, 'amount' | 'expire_time'>>
  ): Promise<boolean> {
    const tableName = this.shardingService.getPlayerItemTable(merchantId);
    
    const setClauses = [];
    const values = [];
    
    if (updates.amount !== undefined) {
      setClauses.push('amount = ?');
      values.push(updates.amount);
    }
    
    if (updates.expire_time !== undefined) {
      setClauses.push('expire_time = ?');
      values.push(updates.expire_time);
    }
    
    if (setClauses.length === 0) {
      return false;
    }
    
    setClauses.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    
    const updateSQL = `
      UPDATE \`${tableName}\` 
      SET ${setClauses.join(', ')} 
      WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?
    `;
    
    values.push(merchantId, appId, playerId, itemId);
    
    const result = await this.prisma.$executeRawUnsafe(updateSQL, ...values);
    
    return (result as any).affectedRows > 0;
  }

  // ==================== 删除玩家道具 ====================

  async deletePlayerItem(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string
  ): Promise<boolean> {
    const tableName = this.shardingService.getPlayerItemTable(merchantId);
    
    const deleteSQL = `
      DELETE FROM \`${tableName}\` 
      WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?
    `;
    
    const result = await this.prisma.$executeRawUnsafe(deleteSQL, merchantId, appId, playerId, itemId);
    
    return (result as any).affectedRows > 0;
  }
}