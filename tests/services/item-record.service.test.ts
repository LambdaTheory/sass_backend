import { ItemRecordService } from '../../src/services/item-record.service';
import { ShardingService } from '../../src/services/sharding.service';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient
const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
} as unknown as PrismaClient;

// Mock ShardingService
const mockShardingService = {
  getItemRecordTables: jest.fn(),
  getItemRecordTable: jest.fn(),
} as unknown as ShardingService;

describe('ItemRecordService', () => {
  let itemRecordService: ItemRecordService;

  beforeEach(() => {
    itemRecordService = new ItemRecordService(mockPrisma, mockShardingService);
    jest.clearAllMocks();
  });

  describe('getItemRecords', () => {
    it('should parse user_remark from remark field correctly', async () => {
      // Mock data with remark containing idempotency key and user remark
      const mockRawRecords = [
        {
          id: 1,
          merchant_id: 'test_merchant',
          app_id: 'test_app',
          player_id: 'test_player',
          item_id: 'test_item',
          amount: 100,
          record_type: 'GRANT',
          remark: 'idempotency:abc123 | 新用户注册奖励',
          balance_after: 100,
          created_at: 1726488000,
        },
        {
          id: 2,
          merchant_id: 'test_merchant',
          app_id: 'test_app',
          player_id: 'test_player',
          item_id: 'test_item',
          amount: 50,
          record_type: 'GRANT',
          remark: 'idempotency:def456',
          balance_after: 150,
          created_at: 1726488100,
        },
      ];

      // Mock sharding service
      (mockShardingService.getItemRecordTables as jest.Mock).mockReturnValue([
        'item_records_test_app_202409',
      ]);

      // Mock count query
      (mockPrisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: BigInt(2) }]) // count query
        .mockResolvedValueOnce(mockRawRecords); // records query

      const result = await itemRecordService.getItemRecords(
        'test_merchant',
        'test_app',
        {
          page: 1,
          pageSize: 20,
        }
      );

      expect(result.total).toBe(2);
      expect(result.records).toHaveLength(2);
      
      // Check first record with user remark
      expect(result.records[0]).toMatchObject({
        id: 1,
        idempotency_key: 'abc123',
        user_remark: '新用户注册奖励',
        remark: 'idempotency:abc123 | 新用户注册奖励',
        balance_after: 100,
      });
      
      // Check second record without user remark
      expect(result.records[1]).toMatchObject({
        id: 2,
        idempotency_key: 'def456',
        user_remark: '',
        remark: 'idempotency:def456',
        balance_after: 150,
      });
    });

    it('should handle records without idempotency key', async () => {
      const mockRawRecords = [
        {
          id: 3,
          merchant_id: 'test_merchant',
          app_id: 'test_app',
          player_id: 'test_player',
          item_id: 'test_item',
          amount: 25,
          record_type: 'CONSUME',
          remark: '普通消费记录',
          balance_after: 125,
          created_at: 1726488200,
        },
      ];

      (mockShardingService.getItemRecordTables as jest.Mock).mockReturnValue([
        'item_records_test_app_202409',
      ]);

      (mockPrisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: BigInt(1) }])
        .mockResolvedValueOnce(mockRawRecords);

      const result = await itemRecordService.getItemRecords(
        'test_merchant',
        'test_app',
        {
          page: 1,
          pageSize: 20,
        }
      );

      expect(result.records[0]).toMatchObject({
        id: 3,
        idempotency_key: undefined,
        user_remark: '',
        remark: '普通消费记录',
        balance_after: 125,
      });
    });

    it('应该正确返回balance_after字段', async () => {
       const mockRecords = [
         {
           id: 1,
           merchant_id: 'test_merchant',
           app_id: 'test_app',
           player_id: 'test_player',
           item_id: 'test_item',
           amount: 50,
           record_type: 'GRANT',
           remark: 'idempotency:grant123',
           balance_after: 50,
           created_at: 1726488000,
         },
         {
           id: 2,
           merchant_id: 'test_merchant',
           app_id: 'test_app',
           player_id: 'test_player',
           item_id: 'test_item',
           amount: 20,
           record_type: 'CONSUME',
           remark: 'idempotency:consume456',
           balance_after: 30,
           created_at: 1726488100,
         },
       ];
 
       (mockShardingService.getItemRecordTables as jest.Mock).mockResolvedValue(['test_table']);
       (mockPrisma.$queryRawUnsafe as jest.Mock)
         .mockResolvedValueOnce([{ count: BigInt(2) }])
         .mockResolvedValueOnce(mockRecords);
 
       const result = await itemRecordService.getItemRecords('test_merchant', 'test_app', {
         playerId: 'test_player',
         itemId: 'test_item'
       });
 
       expect(result.records).toHaveLength(2);
       expect(result.records[0]).toMatchObject({
         balance_after: 50,
         amount: 50,
         record_type: 'GRANT'
       });
       expect(result.records[1]).toMatchObject({
         balance_after: 30,
         amount: 20,
         record_type: 'CONSUME'
       });
     });
  });
});