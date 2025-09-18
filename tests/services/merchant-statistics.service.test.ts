import { PrismaClient } from '@prisma/client';
import { MerchantStatisticsService } from '../../src/services/merchant-statistics.service';
import { ShardingService } from '../../src/services/sharding.service';

// Mock PrismaClient
const mockPrisma = {
  shardingMetadata: {
    findMany: jest.fn(),
  },
  itemTemplate: {
    findMany: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
} as unknown as PrismaClient;

// Mock ShardingService
const mockShardingService = {
  getPlayerItemTables: jest.fn(),
  getItemRecordTables: jest.fn(),
  getAllPlayerItemTables: jest.fn(),
  getAllItemRecordTables: jest.fn(),
} as unknown as ShardingService;

describe('MerchantStatisticsService', () => {
  let statisticsService: MerchantStatisticsService;

  beforeEach(() => {
    statisticsService = new MerchantStatisticsService(mockPrisma, mockShardingService);
    jest.clearAllMocks();
  });

  describe('getAppItemStatistics', () => {
    const mockAppId = 'test-app-id';
    const mockMerchantId = 'test-merchant-id';
    const mockStartTime = 1726444800; // 2024-09-16 00:00:00 UTC
    const mockEndTime = 1726531200;   // 2024-09-17 00:00:00 UTC

    beforeEach(() => {
      // Mock 分表查询
      mockShardingService.getPlayerItemTables = jest.fn().mockReturnValue([
        'player_items_test-app-id_202409'
      ]);
      mockShardingService.getItemRecordTables = jest.fn().mockReturnValue([
        'item_records_test-app-id_20240916',
        'item_records_test-app-id_20240917'
      ]);
      mockShardingService.getAllPlayerItemTables = jest.fn().mockReturnValue([
        'player_items_test-app-id_202409'
      ]);
      mockShardingService.getAllItemRecordTables = jest.fn().mockReturnValue([
        'item_records_test-app-id_20240916',
        'item_records_test-app-id_20240917'
      ]);

      // Mock 道具模板查询
      mockPrisma.itemTemplate.findMany = jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          item_name: '金币',
          item_type: 'CURRENCY'
        },
        {
          id: 'item-2',
          item_name: '钻石',
          item_type: 'CURRENCY'
        }
      ]);
    });

    it('should return statistics for all items', async () => {
      // Mock 私有方法的返回值
      jest.spyOn(statisticsService as any, 'getGrantStatistics').mockResolvedValue([
        { item_id: 'item-1', total_granted: 2000 },
        { item_id: 'item-2', total_granted: 800 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getConsumeStatistics').mockResolvedValue([
        { item_id: 'item-1', total_consumed: 1000 },
        { item_id: 'item-2', total_consumed: 300 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getCurrentBalance').mockResolvedValue([
        { item_id: 'item-1', current_balance: 1000 },
        { item_id: 'item-2', current_balance: 500 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getActivePlayersCount').mockResolvedValue(150);
      
      jest.spyOn(statisticsService as any, 'mergeStatistics').mockResolvedValue([
        {
          item_id: 'item-1',
          item_name: '金币',
          total_granted: 2000,
          total_consumed: 1000,
          current_balance: 1000
        },
        {
          item_id: 'item-2',
          item_name: '钻石',
          total_granted: 800,
          total_consumed: 300,
          current_balance: 500
        }
      ]);

      const result = await statisticsService.getAppItemStatistics(mockMerchantId, mockAppId);

      expect(result).toEqual({
        total_items_granted: 2800,
        total_items_consumed: 1300,
        total_items_balance: 1500,
        active_players: 150,
        items: [
          {
            item_id: 'item-1',
            item_name: '金币',
            total_granted: 2000,
            total_consumed: 1000,
            current_balance: 1000
          },
          {
            item_id: 'item-2',
            item_name: '钻石',
            total_granted: 800,
            total_consumed: 300,
            current_balance: 500
          }
        ]
      });

      // 验证返回的统计数据格式正确
      expect(result.items).toHaveLength(2);
      expect(result.total_items_granted).toBe(2800);
      expect(result.total_items_consumed).toBe(1300);
      expect(result.total_items_balance).toBe(1500);
    });

    it('should return statistics with time range filter', async () => {
      // Mock 私有方法的返回值
      jest.spyOn(statisticsService as any, 'getGrantStatistics').mockResolvedValue([
        { item_id: 'item-1', total_granted: 1500 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getConsumeStatistics').mockResolvedValue([
        { item_id: 'item-1', total_consumed: 700 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getCurrentBalance').mockResolvedValue([
        { item_id: 'item-1', current_balance: 800 }
      ]);
      
      jest.spyOn(statisticsService as any, 'getActivePlayersCount').mockResolvedValue(80);
      
      jest.spyOn(statisticsService as any, 'mergeStatistics').mockResolvedValue([
        {
          item_id: 'item-1',
          item_name: '金币',
          total_granted: 1500,
          total_consumed: 700,
          current_balance: 800
        }
      ]);

      const result = await statisticsService.getAppItemStatistics(
        mockMerchantId,
        mockAppId,
        mockStartTime,
        mockEndTime
      );

      expect(result).toEqual({
        total_items_granted: 1500,
        total_items_consumed: 700,
        total_items_balance: 800,
        active_players: 80,
        items: [
          {
            item_id: 'item-1',
            item_name: '金币',
            total_granted: 1500,
            total_consumed: 700,
            current_balance: 800
          }
        ]
      });

      // 验证返回的统计数据格式正确
      expect(result.items).toHaveLength(1);
      expect(result.total_items_granted).toBe(1500);
      expect(result.total_items_consumed).toBe(700);
      expect(result.total_items_balance).toBe(800);
    });

    it('should handle empty results gracefully', async () => {
      // Mock 空结果
      mockPrisma.$queryRawUnsafe = jest.fn()
        .mockResolvedValueOnce([]) // 道具剩余数量查询
        .mockResolvedValueOnce([]) // 派发数量查询
        .mockResolvedValueOnce([]) // 消耗数量查询
        .mockResolvedValueOnce([{ unique_players: 0 }]); // 活跃用户查询

      const result = await statisticsService.getAppItemStatistics(mockMerchantId, mockAppId);

      expect(result).toEqual({
        total_items_granted: 0,
        total_items_consumed: 0,
        total_items_balance: 0,
        active_players: 0,
        items: []
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock database query to fail, but service should handle gracefully
      mockPrisma.$queryRawUnsafe = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const result = await statisticsService.getAppItemStatistics(mockMerchantId, mockAppId);
      
      // Service should return empty result instead of throwing
      expect(result).toEqual({
        items: [],
        active_players: 0,
        total_items_granted: 0,
        total_items_consumed: 0,
        total_items_balance: 0
      });
    });
  });

  describe('getItemStatistics', () => {
    const mockAppId = 'test-app-id';
    const mockMerchantId = 'test-merchant-id';
    const mockItemId = 'item-1';
    const mockStartTime = 1726444800;
    const mockEndTime = 1726531200;

    beforeEach(() => {
      mockShardingService.getPlayerItemTables = jest.fn().mockReturnValue([
        'player_items_test-app-id_202409'
      ]);
      mockShardingService.getItemRecordTables = jest.fn().mockReturnValue([
        'item_records_test-app-id_20240916'
      ]);
    });

    it('should return statistics for specific item', async () => {
      const mockAppStats = {
        items: [
          {
            item_id: 'item-1',
            item_name: '测试道具1',
            total_granted: 1000,
            total_consumed: 500,
            current_balance: 500
          },
          {
            item_id: 'item-2',
            item_name: '测试道具2',
            total_granted: 200,
            total_consumed: 50,
            current_balance: 150
          }
        ],
        active_players: 50,
        total_items_granted: 1200,
        total_items_consumed: 550,
        total_items_balance: 650
      };
      
      jest.spyOn(statisticsService, 'getAppItemStatistics').mockResolvedValue(mockAppStats);

      const result = await statisticsService.getItemStatistics(
        mockMerchantId,
        mockAppId,
        mockItemId,
        mockStartTime,
        mockEndTime
      );

      expect(result).toEqual({
        item_id: 'item-1',
        item_name: '测试道具1',
        total_granted: 1000,
        total_consumed: 500,
        current_balance: 500
      });
    });

    it('should return null for item with no data', async () => {
      const mockAppStats = {
        items: [], // 没有道具数据
        active_players: 0,
        total_items_granted: 0,
        total_items_consumed: 0,
        total_items_balance: 0
      };
      
      jest.spyOn(statisticsService, 'getAppItemStatistics').mockResolvedValue(mockAppStats);

      const result = await statisticsService.getItemStatistics(
        mockMerchantId,
        mockAppId,
        'nonexistent-item'
      );

      expect(result).toBeNull();
    });

    it('should handle partial data correctly', async () => {
      const mockAppStats = {
        items: [
          {
            item_id: 'item-1',
            item_name: '测试道具1',
            total_granted: 300,
            total_consumed: 0, // 没有消耗数据
            current_balance: 300
          }
        ],
        active_players: 10,
        total_items_granted: 300,
        total_items_consumed: 0,
        total_items_balance: 300
      };
      
      jest.spyOn(statisticsService, 'getAppItemStatistics').mockResolvedValue(mockAppStats);

      const result = await statisticsService.getItemStatistics(
        mockMerchantId,
        mockAppId,
        mockItemId
      );

      expect(result).toEqual({
        item_id: 'item-1',
        item_name: '测试道具1',
        total_granted: 300,
        total_consumed: 0,
        current_balance: 300
      });
    });
  });

  describe('error handling', () => {
    const testMerchantId = 'test-merchant-id';
    const testAppId = 'test-app-id';

    it('should handle sharding service errors gracefully', async () => {
      // Mock sharding service to throw error
      mockShardingService.getItemRecordTables = jest.fn().mockImplementation(() => {
        throw new Error('Sharding service error');
      });
      
      await expect(statisticsService.getAppItemStatistics(testMerchantId, testAppId))
        .rejects.toThrow('获取统计数据失败');
    });

    it('should handle item template query errors gracefully', async () => {
      // Mock successful sharding operations
      mockShardingService.getPlayerItemTables = jest.fn().mockReturnValue(['player_items_test_202409']);
      mockShardingService.getItemRecordTables = jest.fn().mockReturnValue(['item_records_test_20240916']);
      mockShardingService.getAllPlayerItemTables = jest.fn().mockReturnValue(['player_items_test_202409']);
      mockShardingService.getAllItemRecordTables = jest.fn().mockReturnValue(['item_records_test_20240916']);
      
      // Mock successful database queries that return some data
      mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([
        { item_id: 'item1', total_granted: 100 }
      ]);
      
      // Mock item template query to fail
      mockPrisma.itemTemplate.findMany = jest.fn().mockRejectedValue(new Error('Item template query failed'));

      await expect(statisticsService.getAppItemStatistics(testMerchantId, testAppId))
        .rejects.toThrow('获取统计数据失败');
    });
  });
});