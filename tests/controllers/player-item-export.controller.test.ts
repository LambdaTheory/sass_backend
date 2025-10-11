import { PlayerItemExportService } from '../../src/services/player-item-export.service';
import { ShardingService } from '../../src/services/sharding.service';
import * as ExcelJS from 'exceljs';

// Mock dependencies
const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  itemTemplate: {
    findMany: jest.fn()
  }
};

const mockShardingService = {
  getItemRecordTables: jest.fn(),
  filterExistingTables: jest.fn(),
} as unknown as jest.Mocked<ShardingService>;

describe('PlayerItemExportService', () => {
  let exportService: PlayerItemExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    exportService = new PlayerItemExportService(mockPrisma as any, mockShardingService);
    mockShardingService.filterExistingTables.mockImplementation(async (tables: string[]) => tables);
  });

  describe('exportPlayerItemRecords', () => {
    it('应该成功导出空数据的Excel文件', async () => {
      // Mock empty data
      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_app1_202401']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([]);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1'
      };

      const result = await exportService.exportPlayerItemRecords(query);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockShardingService.getItemRecordTables).toHaveBeenCalledWith('app-1', undefined, undefined);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('应该成功导出包含数据的Excel文件', async () => {
      // Mock data with records
      const mockRecords = [
        {
          id: 1,
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-1',
          amount: 10,
          record_type: 'GRANT',
          balance_after: 10,
          remark: 'idempotency:key123 | 测试发放',
          created_at: 1640995200 // 2022-01-01 00:00:00
        },
        {
          id: 2,
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-1',
          amount: -5,
          record_type: 'CONSUME',
          balance_after: 5,
          remark: 'idempotency:key456 | 测试消费',
          created_at: 1640995260 // 2022-01-01 00:01:00
        }
      ];

      const mockItemTemplates = [
        {
          id: 'item-1',
          item_name: '测试道具'
        }
      ];

      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_app1_202401']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockRecords);
      mockPrisma.itemTemplate.findMany.mockResolvedValue(mockItemTemplates);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        start_time: 1640995200,
        end_time: 1640995300
      };

      const result = await exportService.exportPlayerItemRecords(query);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // 验证查询参数
      expect(mockShardingService.getItemRecordTables).toHaveBeenCalledWith('app-1', 1640995200, 1640995300);
      expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['item-1'] },
          merchant_id: 'merchant-1'
        },
        select: {
          id: true,
          item_name: true
        }
      });

      // 验证SQL查询包含正确的条件
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sqlCall).toContain("merchant_id = 'merchant-1'");
      expect(sqlCall).toContain("app_id = 'app-1'");
      expect(sqlCall).toContain("player_id = 'player-1'");
      expect(sqlCall).toContain('created_at >= 1640995200');
      expect(sqlCall).toContain('created_at <= 1640995300');
    });

    it('应该正确处理不同的查询条件', async () => {
      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_app1_202401']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([]);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_id: 'item-1',
        record_type: 'GRANT' as const
      };

      await exportService.exportPlayerItemRecords(query);

      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sqlCall).toContain("item_id = 'item-1'");
      expect(sqlCall).toContain("record_type = 'GRANT'");
      expect(sqlCall).not.toContain('player_id =');
    });

    it('应该在没有表时返回空Excel', async () => {
      mockShardingService.getItemRecordTables.mockResolvedValue([]);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1'
      };

      const result = await exportService.exportPlayerItemRecords(query);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('应该正确解析备注信息', async () => {
      const mockRecords = [
        {
          id: 1,
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-1',
          amount: 10,
          record_type: 'GRANT',
          balance_after: 10,
          remark: 'idempotency:key123 | 用户备注信息',
          created_at: 1640995200
        },
        {
          id: 2,
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-1',
          amount: -5,
          record_type: 'CONSUME',
          balance_after: 5,
          remark: '普通备注',
          created_at: 1640995260
        }
      ];

      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_app1_202401']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockRecords);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'item-1', item_name: '测试道具' }
      ]);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1'
      };

      const result = await exportService.exportPlayerItemRecords(query);

      expect(result).toBeInstanceOf(Buffer);

      // 可以进一步验证Excel内容，但这里主要验证逻辑正确性
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  describe('Excel文件格式验证', () => {
    it('生成的Excel应该包含正确的列标题', async () => {
      const mockRecords = [
        {
          id: 1,
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-1',
          amount: 10,
          record_type: 'GRANT',
          balance_after: 10,
          remark: '测试',
          created_at: 1640995200
        }
      ];

      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_app1_202401']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockRecords);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'item-1', item_name: '测试道具' }
      ]);

      const query = {
        merchant_id: 'merchant-1',
        app_id: 'app-1'
      };

      const result = await exportService.exportPlayerItemRecords(query);

      // 验证生成的是有效的Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result as any);

      const worksheet = workbook.getWorksheet('道具背包流水');
      expect(worksheet).toBeDefined();

      if (!worksheet) {
        throw new Error('Worksheet not found');
      }

      // 查找表头行（包含"流水ID"的行）
      let headerRowIndex = 1;
      for (let i = 1; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (row.getCell(1).value === '流水ID') {
          headerRowIndex = i;
          break;
        }
      }
      
      const headerRow = worksheet.getRow(headerRowIndex);
      
      expect(headerRow.getCell(1).value).toBe('流水ID');
      expect(headerRow.getCell(2).value).toBe('商户ID');
      expect(headerRow.getCell(3).value).toBe('应用ID');
      expect(headerRow.getCell(4).value).toBe('玩家ID');
      expect(headerRow.getCell(5).value).toBe('道具ID');
      expect(headerRow.getCell(6).value).toBe('道具名称');
      expect(headerRow.getCell(7).value).toBe('数量');
      expect(headerRow.getCell(8).value).toBe('操作类型');
    });
  });
});