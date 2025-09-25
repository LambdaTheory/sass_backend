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
  record_type: 'GRANT' | 'CONSUME' | 'EXPIRE';
  remark?: string;
  balance_after: number;
  idempotency_key?: string;
  user_remark: string;
  created_at: number;
}

export class ItemRecordService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  // ==================== 创建道具流水 ====================

  async createItemRecord(data: Omit<ItemRecord, 'id'>): Promise<ItemRecord> {
    const tableName = this.shardingService.getItemRecordTable(data.app_id, data.created_at);
    
    const createSQL = `
      INSERT INTO \`${tableName}\` (
        merchant_id, app_id, player_id, item_id, amount, record_type, remark, balance_after, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.prisma.$executeRawUnsafe(createSQL, 
      data.merchant_id,
      data.app_id,
      data.player_id,
      data.item_id,
      data.amount,
      data.record_type,
      data.remark,
      data.balance_after,
      data.created_at
    );
    
    // 获取插入的记录
    const result = await this.prisma.$queryRawUnsafe<ItemRecord[]>(
      `SELECT * FROM \`${tableName}\` WHERE id = LAST_INSERT_ID()`
    );
    
    const record = result[0];
    
    // 解析幂等性键和用户备注
     let idempotency_key: string | undefined;
     let user_remark: string = '';
     
     if (record.remark && record.remark.startsWith('idempotency:')) {
       const parts = record.remark.split(' | ');
       const idempotencyPart = parts[0];
       idempotency_key = idempotencyPart.replace('idempotency:', '');
       
       // 提取用户备注部分
       if (parts.length > 1) {
         user_remark = parts.slice(1).join(' | ');
       }
     }
     
     return {
       ...record,
       idempotency_key,
       user_remark
     };
  }

  // ==================== 查询道具流水 ====================

  async getItemRecords(
    merchantId: string,
    appId: string,
    options: {
      playerId?: string;
      itemId?: string;
      recordType?: 'GRANT' | 'CONSUME' | 'EXPIRE';
      startTime?: number;
      endTime?: number;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ records: ItemRecord[]; total: number }> {
    const { playerId, itemId, recordType, startTime, endTime, page = 1, pageSize = 20 } = options;
    const tables = await this.shardingService.getItemRecordTables(appId, startTime, endTime);
    
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
    
    if (recordType) {
      whereConditions.push(`record_type = '${recordType}'`);
    }
    
    if (startTime) {
      whereConditions.push(`created_at >= ${startTime}`);
    }
    
    if (endTime) {
      whereConditions.push(`created_at <= ${endTime}`);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);
    
    if (existingTables.length === 0) {
       return {
         records: [],
         total: 0
       };
     }
    
    let total = 0;
    let rawRecords: any[] = [];
    
    try {
      // 查询总数
      const countQueries = existingTables.map(table => 
        `SELECT COUNT(*) as count FROM \`${table}\` WHERE ${whereClause}`
      );
      
      const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        countQueries.join(' UNION ALL ')
      );
      
      total = countResult.reduce((sum, item) => sum + Number(item.count), 0);
      
      // 查询记录
      const offset = (page - 1) * pageSize;
      const recordQueries = existingTables.map(table => 
        `SELECT id, merchant_id, app_id, player_id, item_id, amount, record_type, remark, balance_after, created_at FROM \`${table}\` WHERE ${whereClause}`
      );
      
      const recordsQuery = `
        ${recordQueries.join(' UNION ALL ')}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      
      rawRecords = await this.prisma.$queryRawUnsafe<any[]>(recordsQuery);
    } catch (error) {
       console.warn('查询道具流水失败:', error);
       return {
         records: [],
         total: 0
       };
     }
    
    // 手动映射字段，确保类型正确
     const mappedRecords: ItemRecord[] = rawRecords.map(row => ({
       id: Number(row.id),
       merchant_id: row.merchant_id,
       app_id: row.app_id,
       player_id: row.player_id,
       item_id: row.item_id,
       amount: Number(row.amount),
       record_type: row.record_type,
       remark: row.remark,
       balance_after: Number(row.balance_after),
       created_at: Number(row.created_at),
       user_remark: '' // 初始值，后续会在解析中更新
     }));
    
    // 解析幂等性键和用户备注
     const records = mappedRecords.map(record => {
       let idempotency_key: string | undefined;
       let user_remark: string = '';
       
       if (record.remark && record.remark.startsWith('idempotency:')) {
         const parts = record.remark.split(' | ');
         const idempotencyPart = parts[0];
         idempotency_key = idempotencyPart.replace('idempotency:', '');
         
         // 提取用户备注部分
         if (parts.length > 1) {
           user_remark = parts.slice(1).join(' | ');
         }
       }
       
       return {
         ...record,
         idempotency_key,
         user_remark
       };
     });
    
    return { records, total };
  }
}