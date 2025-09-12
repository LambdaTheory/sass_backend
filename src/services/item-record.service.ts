import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';

// 道具流水类型定义
export interface ItemRecord {
  id: number;
  merchant_id: string;
  app_id: string;
  player_id: string;
  item_id: string;
  amount: number;
  remark?: string;
  created_at: number;
}

export class ItemRecordService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  // ==================== 创建道具流水 ====================

  async createItemRecord(data: Omit<ItemRecord, 'id'>): Promise<ItemRecord> {
    const tableName = this.shardingService.getItemRecordTable(data.merchant_id, data.created_at);
    
    const createSQL = `
      INSERT INTO \`${tableName}\` (
        merchant_id, app_id, player_id, item_id, amount, remark, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.prisma.$executeRawUnsafe(createSQL, 
      data.merchant_id,
      data.app_id,
      data.player_id,
      data.item_id,
      data.amount,
      data.remark,
      data.created_at
    );
    
    // 获取插入的记录
    const result = await this.prisma.$queryRawUnsafe<ItemRecord[]>(
      `SELECT * FROM \`${tableName}\` WHERE id = LAST_INSERT_ID()`
    );
    
    return result[0];
  }

  // ==================== 查询道具流水 ====================

  async getItemRecords(
    merchantId: string,
    appId: string,
    options: {
      playerId?: string;
      itemId?: string;
      startTime?: number;
      endTime?: number;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ records: ItemRecord[]; total: number }> {
    const { playerId, itemId, startTime, endTime, page = 1, pageSize = 20 } = options;
    const tables = await this.shardingService.getItemRecordTables(merchantId, startTime, endTime);
    
    if (tables.length === 0) {
      return { records: [], total: 0 };
    }
    
    // 构建查询条件
    const whereConditions = [
      `merchant_id = '${merchantId}'`,
      `app_id = '${appId}'`
    ];
    
    if (playerId) {
      whereConditions.push(`player_id = '${playerId}'`);
    }
    
    if (itemId) {
      whereConditions.push(`item_id = '${itemId}'`);
    }
    
    if (startTime) {
      whereConditions.push(`created_at >= ${startTime}`);
    }
    
    if (endTime) {
      whereConditions.push(`created_at <= ${endTime}`);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // 查询总数
    const countQueries = tables.map(table => 
      `SELECT COUNT(*) as count FROM \`${table}\` WHERE ${whereClause}`
    );
    
    const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      countQueries.join(' UNION ALL ')
    );
    
    const total = countResult.reduce((sum, item) => sum + Number(item.count), 0);
    
    // 查询记录
    const offset = (page - 1) * pageSize;
    const recordQueries = tables.map(table => 
      `SELECT * FROM \`${table}\` WHERE ${whereClause}`
    );
    
    const recordsQuery = `
      ${recordQueries.join(' UNION ALL ')}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    
    const records = await this.prisma.$queryRawUnsafe<ItemRecord[]>(recordsQuery);
    
    return { records, total };
  }
}