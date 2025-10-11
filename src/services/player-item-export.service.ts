import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';
import * as ExcelJS from 'exceljs';

// 导出查询条件接口
export interface ExportQuery {
  merchant_id: string;
  app_id: string;
  player_id?: string;
  item_id?: string;
  start_time?: number;
  end_time?: number;
  record_type?: 'GRANT' | 'CONSUME' | 'EXPIRE';
}

// 导出数据行接口
export interface ExportDataRow {
  id: number;
  merchant_id: string;
  app_id: string;
  player_id: string;
  item_id: string;
  item_name?: string;
  amount: number;
  record_type: 'GRANT' | 'CONSUME' | 'EXPIRE';
  balance_after: number;
  remark?: string;
  user_remark?: string;
  created_at: number;
  created_at_formatted: string;
}

export class PlayerItemExportService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  /**
   * 导出道具背包流水为Excel
   * @param query 查询条件
   * @returns Excel文件的Buffer
   */
  async exportPlayerItemRecords(query: ExportQuery): Promise<Buffer> {
    // 1. 查询数据
    const records = await this.queryRecordsForExport(query);
    
    // 2. 生成Excel
    return await this.generateExcel(records, query);
  }

  /**
   * 查询需要导出的流水记录
   * @param query 查询条件
   * @returns 流水记录数组
   */
  private async queryRecordsForExport(query: ExportQuery): Promise<ExportDataRow[]> {
    const { merchant_id, app_id, player_id, item_id, start_time, end_time, record_type } = query;
    
    // 获取需要查询的表
    const tables = await this.shardingService.getItemRecordTables(app_id, start_time, end_time);
    
    if (tables.length === 0) {
      return [];
    }

    // 构建查询条件
    const conditions: string[] = [
      `merchant_id = '${merchant_id}'`,
      `app_id = '${app_id}'`
    ];

    if (player_id) {
      conditions.push(`player_id = '${player_id}'`);
    }

    if (item_id) {
      conditions.push(`item_id = '${item_id}'`);
    }

    if (record_type) {
      conditions.push(`record_type = '${record_type}'`);
    }

    if (start_time) {
      conditions.push(`created_at >= ${start_time}`);
    }

    if (end_time) {
      conditions.push(`created_at <= ${end_time}`);
    }

    const whereClause = conditions.join(' AND ');

    // 过滤出实际存在的表
    const existingTables = await this.shardingService.filterExistingTables(tables);

    if (existingTables.length === 0) {
      return [];
    }

    // 构建UNION查询所有相关表
    const queries = existingTables.map(table => 
      `SELECT * FROM \`${table}\` WHERE ${whereClause}`
    );

    const unionQuery = queries.join(' UNION ALL ') + ' ORDER BY created_at DESC';

    // 执行查询
    const rawRecords = await this.prisma.$queryRawUnsafe<any[]>(unionQuery);

    // 获取道具名称映射
    const itemIds = [...new Set(rawRecords.map(record => record.item_id))];
    const itemTemplates = await this.prisma.itemTemplate.findMany({
      where: {
        id: { in: itemIds },
        merchant_id: merchant_id
      },
      select: {
        id: true,
        item_name: true
      }
    });

    const itemNameMap = new Map(itemTemplates.map(item => [item.id, item.item_name]));

    // 处理数据格式
    return rawRecords.map(record => {
      // 解析备注信息
      let user_remark = '';
      let remark = record.remark || '';
      
      if (remark && remark.startsWith('idempotency:')) {
        const parts = remark.split(' | ');
        if (parts.length > 1) {
          user_remark = parts.slice(1).join(' | ');
        }
        remark = parts[0];
      }

      return {
        id: record.id,
        merchant_id: record.merchant_id,
        app_id: record.app_id,
        player_id: record.player_id,
        item_id: record.item_id,
        item_name: itemNameMap.get(record.item_id) || '未知道具',
        amount: record.amount,
        record_type: record.record_type,
        balance_after: record.balance_after,
        remark: remark,
        user_remark: user_remark,
        created_at: record.created_at,
        created_at_formatted: new Date(record.created_at * 1000).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai'
        })
      };
    });
  }

  /**
   * 生成Excel文件
   * @param records 流水记录
   * @param query 查询条件（用于生成文件名和标题）
   * @returns Excel文件Buffer
   */
  private async generateExcel(records: ExportDataRow[], query: ExportQuery): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('道具背包流水');

    // 设置列定义
    worksheet.columns = [
      { header: '流水ID', key: 'id', width: 12 },
      { header: '商户ID', key: 'merchant_id', width: 15 },
      { header: '应用ID', key: 'app_id', width: 15 },
      { header: '玩家ID', key: 'player_id', width: 20 },
      { header: '道具ID', key: 'item_id', width: 15 },
      { header: '道具名称', key: 'item_name', width: 20 },
      { header: '数量', key: 'amount', width: 10 },
      { header: '操作类型', key: 'record_type', width: 12 },
      { header: '操作后余额', key: 'balance_after', width: 12 },
      { header: '系统备注', key: 'remark', width: 30 },
      { header: '用户备注', key: 'user_remark', width: 30 },
      { header: '创建时间', key: 'created_at_formatted', width: 20 }
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // 添加数据行
    records.forEach(record => {
      const row = worksheet.addRow({
        id: record.id,
        merchant_id: record.merchant_id,
        app_id: record.app_id,
        player_id: record.player_id,
        item_id: record.item_id,
        item_name: record.item_name,
        amount: record.amount,
        record_type: this.getRecordTypeText(record.record_type),
        balance_after: record.balance_after,
        remark: record.remark,
        user_remark: record.user_remark,
        created_at_formatted: record.created_at_formatted
      });

      // 根据操作类型设置行颜色
      if (record.record_type === 'GRANT') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F5E8' } // 淡绿色
        };
      } else if (record.record_type === 'CONSUME') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF0E8' } // 淡橙色
        };
      } else if (record.record_type === 'EXPIRE') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' } // 淡灰色
        };
      }
    });

    // 添加边框
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // 在第一行之前插入标题信息
    worksheet.insertRow(1, []);
    worksheet.insertRow(1, []);
    worksheet.insertRow(1, [`导出时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`]);
    worksheet.insertRow(1, [`总记录数: ${records.length}`]);
    
    if (query.player_id) {
      worksheet.insertRow(1, [`玩家ID: ${query.player_id}`]);
    }
    if (query.item_id) {
      worksheet.insertRow(1, [`道具ID: ${query.item_id}`]);
    }
    if (query.start_time || query.end_time) {
      const timeRange = `时间范围: ${
        query.start_time ? new Date(query.start_time * 1000).toLocaleString('zh-CN') : '不限'
      } ~ ${
        query.end_time ? new Date(query.end_time * 1000).toLocaleString('zh-CN') : '不限'
      }`;
      worksheet.insertRow(1, [timeRange]);
    }
    
    worksheet.insertRow(1, [`商户ID: ${query.merchant_id}, 应用ID: ${query.app_id}`]);
    worksheet.insertRow(1, ['道具背包流水导出']);

    // 设置标题样式
    for (let i = 1; i <= 8; i++) {
      const titleRow = worksheet.getRow(i);
      titleRow.font = { bold: true, size: 12 };
      if (i === 1) {
        titleRow.font = { bold: true, size: 16 };
      }
    }

    // 生成Buffer
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * 获取操作类型的中文描述
   * @param recordType 操作类型
   * @returns 中文描述
   */
  private getRecordTypeText(recordType: string): string {
    switch (recordType) {
      case 'GRANT':
        return '发放';
      case 'CONSUME':
        return '消费';
      case 'EXPIRE':
        return '过期';
      default:
        return recordType;
    }
  }
}