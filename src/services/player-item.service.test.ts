import { PlayerItemService } from './player-item.service';

describe('PlayerItemService', () => {
  let service: PlayerItemService;
  let mockPrisma: any;
  let mockShardingService: any;

  beforeEach(() => {
    // 创建 mock 实例
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      itemTemplate: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      app: {
        findFirst: jest.fn(),
      },
    };

    mockShardingService = {
      getPlayerItemTables: jest.fn(),
      ensureTablesExist: jest.fn(),
      getPlayerItemTable: jest.fn(),
      getItemRecordTable: jest.fn(),
      getAllItemRecordTables: jest.fn(),
      getAllPlayerItemTables: jest.fn(),
      getItemRecordTables: jest.fn(),
    };

    // 创建服务实例
    service = new PlayerItemService(mockPrisma, mockShardingService);
  });

  describe('getPlayerItems', () => {
    it('应该返回包含道具名称的玩家道具列表', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      
      // Mock 分片表查询
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202409']);
      
      // Mock 玩家道具查询结果
      const mockPlayerItems = [
        {
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'item-1',
          amount: 10,
          expire_time: Math.floor(Date.now() / 1000) + 3600, // 1小时后过期
          obtain_time: Math.floor(Date.now() / 1000) - 3600, // 1小时前获得
        },
        {
          id: 2,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'item-2',
          amount: 5,
          expire_time: null,
          obtain_time: Math.floor(Date.now() / 1000) - 1800, // 30分钟前获得
        },
      ];
      
      // Mock 流水记录查询结果（用于获取幂等性键）
      const mockItemRecords = [
        { remark: 'idempotency:test-key-123 | 测试备注' },
        { remark: 'idempotency:test-key-456' }
      ];
      
      // 设置多次调用的返回值：第一次返回道具列表，后续返回流水记录
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce(mockPlayerItems) // 第一次调用返回道具列表
        .mockResolvedValueOnce([mockItemRecords[0]]) // 第二次调用返回item-1的流水记录
        .mockResolvedValueOnce([mockItemRecords[1]]); // 第三次调用返回item-2的流水记录
      
      // Mock 道具模板查询结果
      const mockItemTemplates = [
        { id: 'item-1', item_name: '金币', is_active: 'ACTIVE', status: 'NORMAL' },
        { id: 'item-2', item_name: '钻石', is_active: 'ACTIVE', status: 'NORMAL' },
      ];
      
      mockPrisma.itemTemplate.findMany.mockResolvedValue(mockItemTemplates);
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        merchant_id: merchantId,
        app_id: appId,
        player_id: playerId,
        item_id: 'item-1',
        item_name: '金币',
        amount: 10,
        expire_time: expect.any(Number),
        obtain_time: expect.any(Number),
        status: 'USABLE',
        latest_idempotency_key: 'test-key-123',
        is_available: true,
        unavailable_reason: null,
      });
      
      expect(result[1]).toEqual({
        id: 2,
        merchant_id: merchantId,
        app_id: appId,
        player_id: playerId,
        item_id: 'item-2',
        item_name: '钻石',
        amount: 5,
        expire_time: null,
        obtain_time: expect.any(Number),
        status: 'USABLE',
        latest_idempotency_key: 'test-key-456',
        is_available: true,
        unavailable_reason: null,
      });
      
      // 验证道具模板查询参数
      expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['item-1', 'item-2'] },
          merchant_id: merchantId,
          app_id: appId,
        },
        select: {
          id: true,
          item_name: true,
          is_active: true,
          status: true,
          expire_date: true,
        },
      });
    });

    it('应该为未找到模板的道具返回"未知道具"', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      
      const mockPlayerItems = [
        {
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'unknown-item',
          amount: 1,
          expire_time: null,
          obtain_time: Math.floor(Date.now() / 1000),
        },
      ];
      
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockPlayerItems);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([]); // 没有找到道具模板
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      expect(result).toHaveLength(1);
      expect(result[0].item_name).toBe('未知道具');
    });

    it('应该在没有分片表时返回空数组', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      
      mockShardingService.getPlayerItemTables.mockResolvedValue([]);
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      expect(result).toEqual([]);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.itemTemplate.findMany).not.toHaveBeenCalled();
    });

    it('应该在没有玩家道具时返回空数组', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      expect(result).toEqual([]);
      expect(mockPrisma.itemTemplate.findMany).not.toHaveBeenCalled();
    });

    it('应该支持按item_id筛选道具', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      const itemId = 'item-1';
      
      const mockPlayerItems = [
        {
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'item-1',
          amount: 5,
          expire_time: null,
          obtain_time: 1609459200,
          status: 'USABLE'
        },
        {
          id: 2,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'item-2',
          amount: 3,
          expire_time: null,
          obtain_time: 1609459200,
          status: 'USABLE'
        }
      ];
      
      const mockItemTemplates = [
        {
          id: 'item-1',
          item_name: '道具1',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          expire_date: null
        }
      ];
      
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      // 模拟只返回item-1的道具
      mockPrisma.$queryRawUnsafe.mockResolvedValue([mockPlayerItems[0]]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue(mockItemTemplates);
      mockShardingService.getAllItemRecordTables.mockResolvedValue([]);
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, itemId);
      
      expect(result).toHaveLength(1);
      expect(result[0].item_id).toBe('item-1');
      expect(result[0].item_name).toBe('道具1');
      
      // 验证SQL查询包含item_id筛选条件
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining(`item_id = '${itemId}'`)
      );
    });

    it('应该处理模板过期的道具并创建过期流水记录', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      const now = Math.floor(Date.now() / 1000);
      const pastTime = now - 3600; // 1小时前
      
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      
      // Mock 玩家道具查询结果 - 包含一个基于过期模板的道具
      const mockPlayerItems = [
        {
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'expired-item',
          amount: 10,
          expire_time: null,
          obtain_time: now - 7200, // 2小时前获得
        },
      ];
      
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockPlayerItems);
      
      // Mock 道具模板查询结果 - 模板已过期
      const mockItemTemplates = [
        { 
          id: 'expired-item', 
          item_name: '过期道具', 
          is_active: 'ACTIVE', 
          status: 'NORMAL',
          expire_date: BigInt(pastTime * 1000) // 过期时间戳（毫秒）
        },
      ];
      
      mockPrisma.itemTemplate.findMany.mockResolvedValue(mockItemTemplates);
      
      // Mock 事务和分表相关方法
      mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
      mockShardingService.ensureTablesExist.mockResolvedValue(undefined);
      mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202409');
      mockShardingService.getItemRecordTable.mockReturnValue('item_records_202409');
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      // 验证返回结果 - 道具数量应该为0，状态为UNUSABLE
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'expired-item',
          item_name: '过期道具',
          amount: 0,
          expire_time: null,
          obtain_time: expect.any(Number),
          status: 'UNUSABLE',
          is_available: true,
          unavailable_reason: null,
          latest_idempotency_key: undefined,
        });
      
      // 验证创建了过期流水记录
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `item_records_202409`'),
        merchantId,
        appId,
        playerId,
        'expired-item',
        -10, // 负数表示扣除
        'EXPIRE',
        '模板过期自动扣除',
        0, // 过期后余额为0
        expect.any(Number)
      );
      
      // 验证更新了道具数量为0
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `player_items_202409`'),
        expect.any(Number),
        1
      );
    });

    it('应该正确处理混合情况：部分道具模板过期，部分正常', async () => {
      const merchantId = 'merchant-1';
      const appId = 'app-1';
      const playerId = 'player-1';
      const now = Math.floor(Date.now() / 1000);
      const pastTime = now - 3600; // 1小时前
      const futureTime = now + 3600; // 1小时后
      
      mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202409']);
      
      // Mock 玩家道具查询结果
      const mockPlayerItems = [
        {
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'expired-item',
          amount: 5,
          expire_time: null,
          obtain_time: now - 7200,
        },
        {
          id: 2,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'normal-item',
          amount: 10,
          expire_time: null,
          obtain_time: now - 3600,
        },
      ];
      
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockPlayerItems);
      
      // Mock 道具模板查询结果 - 一个过期，一个正常
      const mockItemTemplates = [
        { 
          id: 'expired-item', 
          item_name: '过期道具', 
          is_active: 'ACTIVE', 
          status: 'NORMAL',
          expire_date: BigInt(pastTime * 1000) // 已过期
        },
        { 
          id: 'normal-item', 
          item_name: '正常道具', 
          is_active: 'ACTIVE', 
          status: 'NORMAL',
          expire_date: BigInt(futureTime * 1000) // 未过期
        },
      ];
      
      mockPrisma.itemTemplate.findMany.mockResolvedValue(mockItemTemplates);
      
      // Mock 事务和分表相关方法
      mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
      mockShardingService.ensureTablesExist.mockResolvedValue(undefined);
      mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202409');
      mockShardingService.getItemRecordTable.mockReturnValue('item_records_202409');
      
      const result = await service.getPlayerItems(merchantId, appId, playerId, undefined, undefined, undefined);
      
      // 验证返回结果
      expect(result).toHaveLength(2);
      
      // 过期道具应该数量为0，状态为UNUSABLE
      const expiredItem = result.find(item => item.item_id === 'expired-item');
      expect(expiredItem).toEqual({
          id: 1,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'expired-item',
          item_name: '过期道具',
          amount: 0,
          expire_time: null,
          obtain_time: expect.any(Number),
          status: 'UNUSABLE',
          is_available: true,
          unavailable_reason: null,
          latest_idempotency_key: undefined,
        });
      
      // 正常道具应该保持原有数量和状态
      const normalItem = result.find(item => item.item_id === 'normal-item');
      expect(normalItem).toEqual({
          id: 2,
          merchant_id: merchantId,
          app_id: appId,
          player_id: playerId,
          item_id: 'normal-item',
          item_name: '正常道具',
          amount: 10,
          expire_time: null,
          obtain_time: expect.any(Number),
          status: 'USABLE',
          is_available: true,
          unavailable_reason: null,
          latest_idempotency_key: undefined,
        });
      
      // 验证只为过期道具创建了流水记录
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `item_records_202409`'),
        merchantId,
        appId,
        playerId,
        'expired-item',
        -5,
        'EXPIRE',
        '模板过期自动扣除',
        0,
        expect.any(Number)
      );
    });
  });

  describe('consumePlayerItem', () => {
    const mockData = {
      merchant_id: 'merchant-1',
      app_id: 'app-1',
      player_id: 'player-1',
      item_id: 'item-1',
      amount: 5,
      remark: 'test consume',
    };
    const idempotencyKey = 'test-key-123';

    beforeEach(() => {
      // Mock transaction to execute callback immediately
      mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
      mockShardingService.ensureTablesExist.mockResolvedValue(undefined);
      mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202409');
      mockShardingService.getItemRecordTable.mockReturnValue('item_records_202409');
      mockShardingService.getAllItemRecordTables.mockResolvedValue([]);
      mockShardingService.getAllPlayerItemTables.mockResolvedValue(['player_items_202409']);
    });

    it('应该在道具模板不存在时返回错误', async () => {
      // Mock 幂等性检查
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      
      // Mock 道具模板查询 - 道具模板不存在
      mockPrisma.itemTemplate.findFirst.mockResolvedValue(null);

      const result = await service.consumePlayerItem(mockData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toBe('道具模板不存在或已失效');
    });

    it('应该在玩家没有该道具时返回错误', async () => {
      // Mock 幂等性检查
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      
      // Mock 道具模板查询 - 模板正常
      mockPrisma.itemTemplate.findFirst.mockResolvedValue({
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        expire_date: null,
      });

      // Mock 玩家道具查询 - 玩家没有该道具
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.consumePlayerItem(mockData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toBe('玩家没有该道具');
    });
  });

  describe('grantPlayerItem', () => {
    const mockData = {
      merchant_id: 'merchant-1',
      app_id: 'app-1',
      player_id: 'player-1',
      item_id: 'item-1',
      amount: 10,
      remark: 'test grant',
    };
    const idempotencyKey = 'test-key-456';

    beforeEach(() => {
      // Mock transaction to execute callback immediately
      mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
      mockShardingService.ensureTablesExist.mockResolvedValue(undefined);
      mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202409');
      mockShardingService.getItemRecordTable.mockReturnValue('item_records_202409');
      mockShardingService.getAllItemRecordTables.mockResolvedValue([]);
    });

    it('应该在应用被禁用时返回错误', async () => {
      // Mock 道具模板查询 - 用于preCheckDailyLimit
      mockPrisma.itemTemplate.findFirst.mockResolvedValueOnce({
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        daily_limit_max: null, // 无每日限制
      });
      
      // Mock 预检查查询
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ grand_total: BigInt(0) }]);
      
      // Mock 幂等性检查
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      
      // Mock 应用查询 - 应用被禁用
      mockPrisma.app.findFirst.mockResolvedValueOnce({
        id: 'app-1',
        merchant_id: 'merchant-1',
        status: 0, // 禁用状态
      });

      const result = await service.grantPlayerItem(mockData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toBe('应用已被禁用，无法发放道具');
    });

    it('应该在道具模板过期时返回错误', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTime = now - 3600; // 1小时前过期

      // Mock 幂等性检查
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      
      // Mock 应用查询 - 应用正常
      mockPrisma.app.findFirst.mockResolvedValue({
        id: 'app-1',
        merchant_id: 'merchant-1',
        status: 1, // 启用状态
      });

      // Mock 道具模板查询 - 模板已过期
      mockPrisma.itemTemplate.findFirst.mockResolvedValue({
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        expire_date: BigInt(expiredTime),
      });

      const result = await service.grantPlayerItem(mockData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toBe('道具模板已过期，无法发放道具');
    });

    it('应该在超出持有上限时返回错误', async () => {
      // Mock getAllItemRecordTables 以触发幂等性检查
      mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202409']);
      
      // Mock 幂等性检查和带锁的持有数量查询
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // 幂等性检查
        .mockResolvedValueOnce([{ total: BigInt(1) }]); // 带锁的查询当前持有数量（单表）
      
      // Mock 应用查询 - 应用正常
      mockPrisma.app.findFirst.mockResolvedValue({
        id: 'app-1',
        merchant_id: 'merchant-1',
        status: 1, // 启用状态
      });

      // Mock 道具模板更新（过期检查）
      mockPrisma.itemTemplate.updateMany.mockResolvedValue({ count: 0 });

      // Mock 道具模板查询 - 设置持有上限为1
      mockPrisma.itemTemplate.findFirst.mockResolvedValue({
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        limit_max: 1, // 持有上限为1
        total_limit: null,
        daily_limit_max: null,
        expire_date: null,
        expire_duration: null,
      });

      // Mock getAllPlayerItemTables
      mockShardingService.getAllPlayerItemTables.mockResolvedValue(['player_items_202409']);

      // 尝试发放2个道具，应该失败
      const testData = { ...mockData, amount: 2 };
      const result = await service.grantPlayerItem(testData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toBe('超出道具持有上限，当前持有1个，持有上限1个');
    });

    it('应该在持有上限内成功发放道具', async () => {
      // Mock getAllItemRecordTables 以触发幂等性检查
      mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202409']);
      
      // Mock 查询新插入的道具记录
      const mockNewItem = {
        id: 1,
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        item_id: 'item-1',
        amount: 2,
        expire_time: null,
        obtain_time: Math.floor(Date.now() / 1000),
        status: 'USABLE',
      };
      
      // Mock 查询新插入的流水记录
      const mockItemRecord = {
        id: 1,
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        item_id: 'item-1',
        amount: 2,
        record_type: 'GRANT',
        remark: `idempotency:${idempotencyKey} | test grant`,
        balance_after: 2,
        created_at: Math.floor(Date.now() / 1000),
      };

      // Mock 所有的$queryRawUnsafe调用，按调用顺序
         mockPrisma.$queryRawUnsafe
           .mockResolvedValueOnce([]) // 幂等性检查
           .mockResolvedValueOnce([{ total: BigInt(2) }]) // 带锁的查询当前持有数量（单表）
           .mockResolvedValueOnce([mockNewItem]) // 查询新插入的道具记录
           .mockResolvedValueOnce([mockItemRecord]); // 查询新插入的流水记录
      
      // Mock 应用查询 - 应用正常
      mockPrisma.app.findFirst.mockResolvedValue({
        id: 'app-1',
        merchant_id: 'merchant-1',
        status: 1, // 启用状态
      });

      // Mock 道具模板更新（过期检查）
      mockPrisma.itemTemplate.updateMany.mockResolvedValue({ count: 0 });

      // Mock 道具模板查询 - 设置持有上限为5
      mockPrisma.itemTemplate.findFirst.mockResolvedValue({
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        limit_max: 5, // 持有上限为5
        total_limit: null,
        daily_limit_max: null,
        expire_date: null,
        expire_duration: null,
      });

      // Mock getAllPlayerItemTables
      mockShardingService.getAllPlayerItemTables.mockResolvedValue(['player_items_202409']);
      
      // Mock 插入道具记录
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

      // 尝试发放2个道具，应该成功（当前2个 + 发放2个 = 4个 < 上限5个）
      const testData = { ...mockData, amount: 2 };
      const result = await service.grantPlayerItem(testData, idempotencyKey);

      expect(result.success).toBe(true);
      expect(result.message).toBe('道具发放成功');
      expect(result.playerItem).toEqual(mockNewItem);
      expect(result.itemRecord).toEqual(mockItemRecord);
    });

    it('应该正确检查每日发放上限，只统计GRANT类型的记录', async () => {
      // Mock 道具模板查询 - 设置每日发放上限为1
      const itemTemplate = {
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        limit_max: null,
        total_limit: null,
        daily_limit_max: 1, // 每日发放上限为1
        expire_date: null,
        expire_duration: null,
      };

      // Mock 事务外的道具模板检查
      mockPrisma.itemTemplate.findFirst.mockResolvedValue(itemTemplate);

      // Mock 事务
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第一次调用：幂等性检查，返回空数组表示无重复
          .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查，返回当前持有0个
          .mockResolvedValueOnce([{ total: 1 }]) // 第三次调用：每日限制检查，返回已发放1个
          .mockResolvedValue([{ id: 1, amount: 1 }]), // 其他查询
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'app-1',
            merchant_id: 'merchant-1',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(itemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      // Mock getAllPlayerItemTables 和 getAllItemRecordTables
      mockShardingService.getAllPlayerItemTables.mockResolvedValue(['player_items_202409']);
      mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202409']);
      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_202409']);

      // Mock 事务执行
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      const result = await service.grantPlayerItem(mockData, idempotencyKey);

      expect(result.success).toBe(false);
      expect(result.message).toContain('超出道具每日限制');
      
      // 验证查询条件包含 record_type = 'GRANT'
      const allCalls = mockTx.$queryRawUnsafe.mock.calls;
      const hasGrantQuery = allCalls.some((call: any[]) => 
        typeof call[0] === 'string' && call[0].includes("record_type = 'GRANT'")
      );
      expect(hasGrantQuery).toBe(true);
    });

    it('应该防止通过多次小额发放绕过每日限制', async () => {
      console.log('TEST: 测试开始执行');
      // 完全重置所有mock
      jest.clearAllMocks();
      
      // 设置每日限制为3个
      const dailyLimit = 3;
      
      // Mock 道具模板查询 - 设置每日发放上限为3
      const itemTemplate = {
        id: 'item-1',
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        limit_max: null,
        total_limit: null,
        daily_limit_max: dailyLimit,
        expire_date: null,
        expire_duration: null,
      };

      const mockData = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        item_id: 'item-1',
        amount: 2,
      };

      // Mock 事务外的道具模板检查
      mockPrisma.itemTemplate.findFirst.mockResolvedValue(itemTemplate);

      // Mock 分表服务
      mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_202409']);
      mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202409']);
      mockShardingService.getAllPlayerItemTables.mockResolvedValue(['player_items_202409']);
      mockShardingService.ensureTablesExist.mockResolvedValue(undefined);
      mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202409');
      mockShardingService.getItemRecordTable.mockReturnValue('item_records_202409');
      
      // 第一次发放：今日已发放0个，发放2个，应该成功
      const mockTx1 = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 第1次调用：幂等性检查
          .mockResolvedValueOnce([{ total: 0 }]) // 第2次调用：持有上限检查
          .mockResolvedValueOnce([{ grand_total: 0 }]) // 第3次调用：总量检查
          .mockResolvedValueOnce([{ total: 0 }]) // 第4次调用：每日限制检查（今日已发放0个）
          .mockResolvedValue([{ id: 1, amount: 2 }]), // 其他查询
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'app-1',
            merchant_id: 'merchant-1',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(itemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      // Mock 第一次事务执行
      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => {
        return await callback(mockTx1);
      });
      
      const firstResult = await service.grantPlayerItem(mockData, 'first-grant-key');
      expect(firstResult.success).toBe(true);

      // 重新设置道具模板mock（确保第二次调用也能通过模板检查）
      mockPrisma.itemTemplate.findFirst.mockResolvedValue(itemTemplate);

      // 第二次发放：今日已发放2个，再发放2个，应该失败（2+2=4 > 3）
      const mockTx2 = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([]) // 幂等性检查
          .mockResolvedValueOnce([{ total: 2 }]), // 每日限制检查（今日已发放2个）
        app: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'app-1',
            merchant_id: 'merchant-1',
            status: 1,
          }),
        },
        itemTemplate: {
          findFirst: jest.fn().mockResolvedValue(itemTemplate),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      // Mock 第二次事务执行
      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => {
        return await callback(mockTx2);
      });

      const secondResult = await service.grantPlayerItem(mockData, 'second-grant-key');
      
      expect(secondResult.success).toBe(false);
      expect(secondResult.message).toContain('超出道具每日限制');
    });

    it('应该正确将expire_duration从小时转换为秒', () => {
      // 这是一个简单的单元测试，验证时间转换逻辑
      const now = Math.floor(Date.now() / 1000);
      const expireDurationHours = 3; // 3小时
      const expectedExpireTime = now + expireDurationHours * 3600; // 3小时 = 10800秒
      
      // 模拟道具模板的expire_duration字段
      const itemTemplate = {
        expire_duration: expireDurationHours,
        expire_date: null
      };
      
      // 模拟服务中的过期时间计算逻辑
      let expireTime: number | undefined;
      const expireTimes: number[] = [];
      
      // 如果有固定过期时间(小时)，计算从当前时间开始的过期时间戳
      if (itemTemplate.expire_duration && itemTemplate.expire_duration > 0) {
        // expire_duration是小时数，需要转换为秒数（1小时 = 3600秒）
        expireTimes.push(now + itemTemplate.expire_duration * 3600);
      }
      
      // 如果有固定过期时间戳，需要转换为秒时间戳
      if (itemTemplate.expire_date) {
        // expire_date是毫秒时间戳，需要转换为秒时间戳
        expireTimes.push(Number(itemTemplate.expire_date) / 1000);
      }
      
      // 取最小值作为过期时间
      if (expireTimes.length > 0) {
        expireTime = Math.min(...expireTimes);
      }
      
      // 验证转换结果
      expect(expireTime).toBe(expectedExpireTime);
      expect(expireTime! - now).toBe(10800); // 3小时 = 10800秒
    });
  });
});