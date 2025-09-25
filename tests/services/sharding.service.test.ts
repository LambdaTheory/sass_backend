import { PrismaClient } from '@prisma/client';
import { ShardingService } from '../../src/services/sharding.service';

// Mock PrismaClient
const mockPrisma = {
  shardingMetadata: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  app: {
    findMany: jest.fn(),
  },
  $executeRawUnsafe: jest.fn(),
  $queryRawUnsafe: jest.fn(),
} as unknown as PrismaClient;

describe('ShardingService', () => {
  let shardingService: ShardingService;

  beforeEach(() => {
    shardingService = new ShardingService(mockPrisma);
    jest.clearAllMocks();
    // Mock console.warn to avoid test failures
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPlayerItemTable', () => {
    it('should generate correct table name with timestamp', () => {
      // 2024-09-16 的时间戳 (秒)
      const timestamp = 1726444800; // 2024-09-16 00:00:00 UTC
      const tableName = shardingService.getPlayerItemTable('test-app-id', timestamp);
      expect(tableName).toBe('player_items_test-app-id_202409');
    });

    it('should generate correct table name without timestamp', () => {
      const tableName = shardingService.getPlayerItemTable('test-app-id');
      expect(tableName).toMatch(/^player_items_test-app-id_\d{6}$/);
    });
  });

  describe('getItemRecordTable', () => {
    it('should generate correct table name with timestamp', () => {
      // 2024-09-16 的时间戳 (秒)
      const timestamp = 1726444800; // 2024-09-16 00:00:00 UTC
      const tableName = shardingService.getItemRecordTable('test-app-id', timestamp);
      expect(tableName).toBe('item_records_test-app-id_20240916');
    });

    it('should generate correct table name without timestamp', () => {
      const tableName = shardingService.getItemRecordTable('test-app-id');
      expect(tableName).toMatch(/^item_records_test-app-id_\d{8}$/);
    });
  });

  describe('checkTableExists', () => {
    it('should return true when table exists', async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ table_name: 'test_table' }]);
      
      const exists = await shardingService.checkTableExists('test_table');
      
      expect(exists).toBe(true);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        'test_table'
      );
    });

    it('should return false when table does not exist', async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([]);
      
      const exists = await shardingService.checkTableExists('non_existent_table');
      
      expect(exists).toBe(false);
    });

    it('should return false when query fails', async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const exists = await shardingService.checkTableExists('test_table');
      
      expect(exists).toBe(false);
    });
  });

  describe('filterExistingTables', () => {
    it('should return only existing tables', async () => {
      const tableNames = ['table1', 'table2', 'table3'];
      
      // Mock checkTableExists to return true for table1 and table3, false for table2
      (mockPrisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ table_name: 'table1' }]) // table1 exists
        .mockResolvedValueOnce([]) // table2 doesn't exist
        .mockResolvedValueOnce([{ table_name: 'table3' }]); // table3 exists
      
      const existingTables = await shardingService.filterExistingTables(tableNames);
      
      expect(existingTables).toEqual(['table1', 'table3']);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    });

    it('should return empty array when no tables exist', async () => {
      const tableNames = ['table1', 'table2'];
      
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([]);
      
      const existingTables = await shardingService.filterExistingTables(tableNames);
      
      expect(existingTables).toEqual([]);
    });

    it('should handle empty input array', async () => {
      const existingTables = await shardingService.filterExistingTables([]);
      
      expect(existingTables).toEqual([]);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('createPlayerItemTable', () => {
    it('should not create table if it already exists', async () => {
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue({ id: 'existing' });
      mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([{ 'Tables_in_daojusaas (player_items_app-id_202509)': 'player_items_app-id_202509' }]);
      
      await shardingService.createPlayerItemTable('merchant-id', 'app-id', '202509');
      
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.shardingMetadata.create).not.toHaveBeenCalled();
    });

    it('should recreate table if metadata exists but table does not exist', async () => {
      const existingMetadata = { id: 'existing-id' };
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(existingMetadata);
      mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([]); // 表不存在
      mockPrisma.shardingMetadata.delete = jest.fn().mockResolvedValue({});
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createPlayerItemTable('merchant-id', 'app-id', '202509');
      
      expect(mockPrisma.shardingMetadata.delete).toHaveBeenCalledWith({ where: { id: 'existing-id' } });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `player_items_app-id_202509`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalled();
    });

    it('should recreate table if table check fails', async () => {
      const existingMetadata = { id: 'existing-id' };
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(existingMetadata);
      mockPrisma.$queryRawUnsafe = jest.fn().mockRejectedValue(new Error('Table check failed'));
      mockPrisma.shardingMetadata.delete = jest.fn().mockResolvedValue({});
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createPlayerItemTable('merchant-id', 'app-id', '202509');
      
      expect(mockPrisma.shardingMetadata.delete).toHaveBeenCalledWith({ where: { id: 'existing-id' } });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `player_items_app-id_202509`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalled();
    });

    it('should create table and metadata if not exists', async () => {
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createPlayerItemTable('merchant-id', 'app-id', '202509');
      
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `player_items_app-id_202509`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          table_type: 'PLAYER_ITEMS',
          merchant_id: 'merchant-id',
          app_id: 'app-id',
          table_name: 'player_items_app-id_202509',
          time_range: '202509',
          status: 'ACTIVE',
        })
      });
    });
  });

  describe('createItemRecordTable', () => {
    it('should not create table if it already exists', async () => {
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue({ id: 'existing' });
      mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([{ 'Tables_in_daojusaas (item_records_app-id_20250916)': 'item_records_app-id_20250916' }]);
      
      await shardingService.createItemRecordTable('merchant-id', 'app-id', '20250916');
      
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.shardingMetadata.create).not.toHaveBeenCalled();
    });

    it('should recreate table if metadata exists but table does not exist', async () => {
      const existingMetadata = { id: 'existing-id' };
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(existingMetadata);
      mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([]); // 表不存在
      mockPrisma.shardingMetadata.delete = jest.fn().mockResolvedValue({});
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createItemRecordTable('merchant-id', 'app-id', '20250916');
      
      expect(mockPrisma.shardingMetadata.delete).toHaveBeenCalledWith({ where: { id: 'existing-id' } });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `item_records_app-id_20250916`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalled();
    });

    it('should recreate table if table check fails', async () => {
      const existingMetadata = { id: 'existing-id' };
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(existingMetadata);
      mockPrisma.$queryRawUnsafe = jest.fn().mockRejectedValue(new Error('Table check failed'));
      mockPrisma.shardingMetadata.delete = jest.fn().mockResolvedValue({});
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createItemRecordTable('merchant-id', 'app-id', '20250916');
      
      expect(mockPrisma.shardingMetadata.delete).toHaveBeenCalledWith({ where: { id: 'existing-id' } });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `item_records_app-id_20250916`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalled();
    });

    it('should create table and metadata if not exists', async () => {
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
      
      await shardingService.createItemRecordTable('merchant-id', 'app-id', '20250916');
      
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `item_records_app-id_20250916`')
      );
      expect(mockPrisma.shardingMetadata.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          table_type: 'ITEM_RECORDS',
          merchant_id: 'merchant-id',
          app_id: 'app-id',
          table_name: 'item_records_app-id_20250916',
          time_range: '20250916',
          status: 'ACTIVE',
        })
      });
    });
  });

  describe('ensureTablesExist', () => {
    beforeEach(() => {
      mockPrisma.shardingMetadata.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      mockPrisma.shardingMetadata.create = jest.fn().mockResolvedValue({});
    });

    it('should create tables for specified timestamp', async () => {
      const timestamp = 1726444800; // 2025-09-16 00:00:00 UTC
      
      await shardingService.ensureTablesExist('merchant-id', 'app-id', timestamp);
      
      // 应该创建玩家道具表 (按月)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `player_items_app-id_202409`')
      );
      
      // 应该创建流水表 (按日)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS `item_records_app-id_20240916`')
      );
      
      // 不应该创建明天的表
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('should create tables for current time and tomorrow when no timestamp provided', async () => {
      await shardingService.ensureTablesExist('merchant-id', 'app-id');
      
      // 应该创建当前时间的表和明天的流水表
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    });
  });
});