import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../../src/services/player-item.service';
import { ShardingService } from '../../src/services/sharding.service';

// Mock PrismaClient
const mockPrisma = {
  $transaction: jest.fn(),
  itemTemplate: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  playerItem: {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  itemRecord: {
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
} as unknown as PrismaClient;

// Mock ShardingService
const mockShardingService = {
  getPlayerItemTable: jest.fn(),
  getItemRecordTable: jest.fn(),
  getAllPlayerItemTables: jest.fn(),
  getAllItemRecordTables: jest.fn(),
  ensureTablesExist: jest.fn(),
  getItemRecordTables: jest.fn(),
  getItemLimitTable: jest.fn(),
  filterExistingTables: jest.fn(),
} as unknown as ShardingService;

describe('PlayerItemService - Daily Limit Fix', () => {
  let playerItemService: PlayerItemService;

  beforeEach(() => {
    jest.clearAllMocks();
    playerItemService = new PlayerItemService(mockPrisma, mockShardingService);

    // 设置默认的mock返回值
    (mockShardingService.getPlayerItemTable as jest.Mock).mockReturnValue('player_item_0');
    (mockShardingService.getItemRecordTable as jest.Mock).mockReturnValue('item_record_0');
    (mockShardingService.getAllPlayerItemTables as jest.Mock).mockReturnValue(['player_item_0']);
    (mockShardingService.getAllItemRecordTables as jest.Mock).mockReturnValue(['item_record_0']);
    (mockShardingService.ensureTablesExist as jest.Mock).mockResolvedValue(undefined);
    (mockShardingService.getItemRecordTables as jest.Mock).mockResolvedValue(['item_record_0']);
    (mockShardingService.getItemLimitTable as jest.Mock).mockReturnValue('item_limits_test_app_20241011');
    (mockShardingService.filterExistingTables as jest.Mock).mockImplementation(async (tables: string[]) => tables);
  });

  describe('正常分批发放不应超过每日限制', () => {
    const testData = {
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      player_id: 'test_player',
      item_id: 'test_item',
      amount: 5,
    };

    const mockItemTemplate = {
      id: 'test_item',
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      name: '测试道具',
      daily_limit_max: 10,
      limit_max: 100,
      total_limit_max: 1000,
      is_active: 'ACTIVE',
      status: 'NORMAL',
      expire_date: null,
    };

    it('应该在事务内正确检查每日限制', async () => {
      // 模拟事务外的道具模板检查
      (mockPrisma.itemTemplate.findFirst as jest.Mock).mockResolvedValue(mockItemTemplate);

      // 模拟事务
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
          // 原子预留每日配额：6 + 5 > 10，返回0表示失败
          if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
            return 0;
          }
          return 1;
        }),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第一次调用：幂等性检查，返回空数组表示无重复
          .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查，返回当前持有0个
          .mockResolvedValue([{      // 其他查询：返回新创建的道具
            id: 1,
            merchant_id: 'test_merchant',
            app_id: 'test_app',
            player_id: 'test_player',
            item_id: 'test_item',
            amount: 1,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
            created_at: Date.now(),
            updated_at: Date.now(),
          }]),
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'test_app',
            merchant_id: 'test_merchant',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(mockItemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        playerItem: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
          }),
        },
        itemRecord: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            operation_type: 'GRANT',
            remark: 'idempotency:test_key',
            created_at: Date.now(),
          }),
        },
      };

      // 每日配额通过计数表控制，此处无需模拟SUM查询

      // 模拟事务执行
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await playerItemService.grantPlayerItem(testData, 'test_key');

      // 应该失败，因为6 + 5 = 11 > 10
      expect(result.success).toBe(false);
      expect(result.message).toContain('超出道具每日限制');
    });

    it('应该在每日限制内成功发放', async () => {
      // 模拟事务外的道具模板检查
      (mockPrisma.itemTemplate.findFirst as jest.Mock).mockResolvedValue(mockItemTemplate);

      // 模拟事务
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
          // 原子预留每日配额：3 + 5 = 8 <= 10，返回1表示成功
          if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
            return 1;
          }
          return 1;
        }),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第一次调用：幂等性检查，返回空数组表示无重复
          .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查，返回当前持有0个
          .mockResolvedValue([{      // 其他查询：返回新创建的道具
            id: 1,
            merchant_id: 'test_merchant',
            app_id: 'test_app',
            player_id: 'test_player',
            item_id: 'test_item',
            amount: 5,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
            created_at: Date.now(),
            updated_at: Date.now(),
          }]),
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'test_app',
            merchant_id: 'test_merchant',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(mockItemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        playerItem: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
          }),
        },
        itemRecord: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            operation_type: 'GRANT',
            remark: 'idempotency:test_key',
            created_at: Date.now(),
          }),
        },
      };

      // 每日配额通过计数表控制，此处无需模拟SUM查询

      // 模拟事务执行
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await playerItemService.grantPlayerItem(testData, 'test_key');

      // 应该成功，因为3 + 5 = 8 <= 10
      expect(result.success).toBe(true);
      expect(result.message).toBe('道具发放成功');
    });

    it('应该在边界情况下正确处理', async () => {
      // 测试恰好达到限制的情况
      const boundaryData = { ...testData, amount: 7 };
      
      // 模拟事务外的道具模板检查
      (mockPrisma.itemTemplate.findFirst as jest.Mock).mockResolvedValue(mockItemTemplate);
      
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
          // 原子预留每日配额：3 + 7 = 10，返回1表示成功
          if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
            return 1;
          }
          return 1;
        }),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第一次调用：幂等性检查，返回空数组表示无重复
          .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查，返回当前持有0个
          .mockResolvedValue([{      // 其他查询：返回新创建的道具
            id: 1,
            merchant_id: 'test_merchant',
            app_id: 'test_app',
            player_id: 'test_player',
            item_id: 'test_item',
            amount: 7,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
            created_at: Date.now(),
            updated_at: Date.now(),
          }]),
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'test_app',
            merchant_id: 'test_merchant',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(mockItemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        playerItem: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...boundaryData,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
          }),
        },
        itemRecord: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...boundaryData,
            operation_type: 'GRANT',
            remark: 'idempotency:test_key',
            created_at: Date.now(),
          }),
        },
      };

      // 每日配额通过计数表控制，此处无需模拟SUM查询

      // 模拟事务执行
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await playerItemService.grantPlayerItem(boundaryData, 'test_key');

      // 应该成功，因为3 + 7 = 10 = 10（恰好达到限制）
      expect(result.success).toBe(true);
      expect(result.message).toBe('道具发放成功');
    });

    it('应该在超出限制时拒绝发放', async () => {
      // 测试超出限制的情况
      const overLimitData = { ...testData, amount: 8 };
      
      // 模拟事务外的道具模板检查
      (mockPrisma.itemTemplate.findFirst as jest.Mock).mockResolvedValue(mockItemTemplate);
      
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
          // 原子预留每日配额：3 + 8 = 11 > 10，返回0表示失败
          if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
            return 0;
          }
          return 1;
        }),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第一次调用：幂等性检查，返回空数组表示无重复
          .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查，返回当前持有0个
          .mockResolvedValue([{      // 其他查询：返回新创建的道具
            id: 1,
            merchant_id: 'test_merchant',
            app_id: 'test_app',
            player_id: 'test_player',
            item_id: 'test_item',
            amount: 8,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
            created_at: Date.now(),
            updated_at: Date.now(),
          }]),
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'test_app',
            merchant_id: 'test_merchant',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(mockItemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      // 每日配额通过计数表控制，此处无需模拟SUM查询

      // 模拟事务执行
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await playerItemService.grantPlayerItem(overLimitData, 'test_key');

      // 应该失败，因为3 + 8 = 11 > 10
      expect(result.success).toBe(false);
      expect(result.message).toContain('超出道具每日限制');
    });
  });

  describe('无每日限制的道具', () => {
    const testData = {
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      player_id: 'test_player',
      item_id: 'test_item_no_limit',
      amount: 100,
    };

    const mockItemTemplateNoLimit = {
      id: 'test_item_no_limit',
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      name: '无限制道具',
      daily_limit_max: null, // 无每日限制
      limit_max: null,
      total_limit_max: null,
      is_active: 'ACTIVE',
      status: 'NORMAL',
      expire_date: null,
    };

    it('应该允许发放任意数量', async () => {
      // 模拟事务外的道具模板检查
      (mockPrisma.itemTemplate.findFirst as jest.Mock).mockResolvedValue(mockItemTemplateNoLimit);

      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 幂等性检查：无重复记录
          .mockResolvedValue([{      // 其他查询：返回新创建的道具
            id: 1,
            merchant_id: 'test_merchant',
            app_id: 'test_app',
            player_id: 'test_player',
            item_id: 'test_item_no_limit',
            amount: 100,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
            created_at: Date.now(),
            updated_at: Date.now(),
          }]),
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'test_app',
            merchant_id: 'test_merchant',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(mockItemTemplateNoLimit),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        playerItem: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            expire_time: null,
            obtain_time: Date.now(),
            status: 'USABLE',
          }),
        },
        itemRecord: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            ...testData,
            operation_type: 'GRANT',
            remark: 'idempotency:test_key',
            created_at: Date.now(),
          }),
        },
      };

      // 模拟事务执行
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await playerItemService.grantPlayerItem(testData, 'test_key');

      expect(result.success).toBe(true);
      expect(result.message).toBe('道具发放成功');
    });
  });
});