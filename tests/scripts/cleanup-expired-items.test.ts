// Mock modules first
jest.mock('@prisma/client');
jest.mock('../../src/services/sharding.service');

import { PrismaClient } from '@prisma/client';
import { cleanupExpiredItems } from '../../scripts/cleanup-expired-items';
import { ShardingService } from '../../src/services/sharding.service';

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(),
  error: jest.spyOn(console, 'error').mockImplementation()
};

// Create mock instances
const mockPrisma = {
  app: {
    findMany: jest.fn()
  },
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $disconnect: jest.fn()
};

const mockShardingService = {
  getAllPlayerItemTables: jest.fn()
};

// Mock the constructors
(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);
(ShardingService as jest.MockedClass<typeof ShardingService>).mockImplementation(() => mockShardingService as any);

describe('cleanup-expired-items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('cleanupExpiredItems', () => {
    it('应该成功清理过期道具', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTime = now - 3600; // 1小时前过期
      
      // Mock 应用查询结果
      mockPrisma.app.findMany.mockResolvedValue([
        { id: 'app1', name: '测试应用1' },
        { id: 'app2', name: '测试应用2' }
      ]);
      
      // Mock 玩家道具表查询结果
      mockShardingService.getAllPlayerItemTables
        .mockResolvedValueOnce(['player_items_app1_202401'])
        .mockResolvedValueOnce(['player_items_app2_202401']);
      
      // Mock 过期道具查询结果
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: 1,
            merchant_id: 'merchant1',
            app_id: 'app1',
            player_id: 'player1',
            item_id: 'item1',
            amount: 5,
            expire_time: expiredTime
          }
        ])
        .mockResolvedValueOnce([]); // 第二个表没有过期道具
      
      // Mock 更新操作结果
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1); // 更新了1个道具
      
      await cleanupExpiredItems();
      
      // 验证调用
       expect(mockPrisma.app.findMany).toHaveBeenCalledWith({
         select: { id: true, name: true }
       });
      expect(mockShardingService.getAllPlayerItemTables).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      // 注意：在测试中我们传入了prisma实例，所以不会调用$disconnect
      
      // 验证日志输出
       expect(consoleSpy.log).toHaveBeenCalledWith('开始清理过期道具...');
       expect(consoleSpy.log).toHaveBeenCalledWith('找到 2 个应用');
       expect(consoleSpy.log).toHaveBeenCalledWith('处理应用: 测试应用1 (app1)');
       expect(consoleSpy.log).toHaveBeenCalledWith('应用 测试应用1 有 1 个玩家道具表');
       expect(consoleSpy.log).toHaveBeenCalledWith('处理表: player_items_app1_202401');
       expect(consoleSpy.log).toHaveBeenCalledWith('表 player_items_app1_202401 中找到 1 个过期道具');
       expect(consoleSpy.log).toHaveBeenCalledWith('表 player_items_app1_202401 更新了 1 个道具状态');
    });

    it('应该处理没有过期道具的情况', async () => {
      // Mock 应用查询结果
      mockPrisma.app.findMany.mockResolvedValue([
        { id: 'app1', name: '测试应用1' }
      ]);
      
      // Mock 玩家道具表查询结果
      mockShardingService.getAllPlayerItemTables
        .mockResolvedValue(['player_items_app1_202401']);
      
      // Mock 没有过期道具
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      
      await cleanupExpiredItems();
      
      // 验证调用
      expect(mockPrisma.app.findMany).toHaveBeenCalled();
      expect(mockShardingService.getAllPlayerItemTables).toHaveBeenCalledWith('app1');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
       expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      
      // 验证日志输出
       expect(consoleSpy.log).toHaveBeenCalledWith('表 player_items_app1_202401 中找到 0 个过期道具');
    });

    it('应该处理数据库错误', async () => {
      const error = new Error('数据库连接失败');
      
      // Mock 数据库错误
      mockPrisma.app.findMany.mockRejectedValue(error);
      
      // 使用try-catch来捕获异常
      try {
        await cleanupExpiredItems(mockPrisma as any);
      } catch (e) {
        // 预期会抛出异常
      }
      
      // 验证错误处理
      expect(consoleSpy.error).toHaveBeenCalledWith('过期道具清理任务执行失败:', error);
    });

    it('应该处理应用级别的错误', async () => {
      // Mock 应用查询结果
      mockPrisma.app.findMany.mockResolvedValue([
        { id: 'app1', name: '测试应用1' }
      ]);
      
      // Mock 获取表时出错
      const error = new Error('获取分表失败');
      mockShardingService.getAllPlayerItemTables.mockRejectedValue(error);
      
      await cleanupExpiredItems();
      
      // 验证错误处理
       expect(consoleSpy.error).toHaveBeenCalledWith('处理应用 测试应用1 时出错: Error: 获取分表失败');
    });

    it('应该处理没有应用的情况', async () => {
      // Mock 没有应用
      mockPrisma.app.findMany.mockResolvedValue([]);
      
      await cleanupExpiredItems();
      
      // 验证调用
       expect(mockPrisma.app.findMany).toHaveBeenCalled();
       expect(mockShardingService.getAllPlayerItemTables).not.toHaveBeenCalled();
       
       // 验证日志输出
       expect(consoleSpy.log).toHaveBeenCalledWith('找到 0 个应用');
    });
  });
});