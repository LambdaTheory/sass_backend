import { PlayerItemService } from './player-item.service';

describe('PlayerItemService - 并发安全测试', () => {
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
      getPlayerItemTables: jest.fn().mockResolvedValue(['player_items_202410']),
      ensureTablesExist: jest.fn().mockResolvedValue(true),
      getPlayerItemTable: jest.fn().mockReturnValue('player_items_202410'),
      getItemRecordTable: jest.fn().mockReturnValue('item_records_202410'),
      getAllItemRecordTables: jest.fn().mockResolvedValue(['item_records_202410']),
      getAllPlayerItemTables: jest.fn().mockResolvedValue(['player_items_202410']),
      getItemRecordTables: jest.fn().mockResolvedValue(['item_records_202410']),
      getItemLimitTable: jest.fn().mockReturnValue('item_limits_test_app_20241011'),
      filterExistingTables: jest.fn().mockImplementation(async (tables: string[]) => tables),
    };

    // 创建服务实例
    service = new PlayerItemService(mockPrisma, mockShardingService);
  });

  it('应该在高并发场景下正确限制每日发放数量', async () => {
    const concurrentRequests = 10;
    const amountPerRequest = 1;
    const dailyLimit = 5;
    
    // 使用共享状态来模拟真实的并发竞争
    let sharedDailyAmount = 0;
    let requestCounter = 0;

    // Mock 应用查询
    mockPrisma.app.findFirst.mockResolvedValue({
      id: 'test_app',
      merchant_id: 'test_merchant',
      status: 1,
    });

    // Mock 道具模板查询
    mockPrisma.itemTemplate.findFirst.mockResolvedValue({
      id: 'test_item',
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      item_name: '测试道具',
      item_type: 'test_type',
      eff_arg: '{}',
      is_active: 'ACTIVE',
      status: 'NORMAL',
      daily_limit_max: dailyLimit,
      limit_max: 100,
    });

    // Mock 分片服务
     mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202410']);
     mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202410']);
     mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202410');
     mockShardingService.getItemRecordTable.mockReturnValue('item_records_202410');
     mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_202410']);

    // Mock 幂等性检查（返回空，表示没有重复请求）
    mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
      if (query.includes('SELECT') && query.includes('idempotency_key')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // Mock 事务处理
     mockPrisma.$transaction.mockImplementation(async (callback: any) => {
       const mockTx = {
         $queryRawUnsafe: jest.fn().mockImplementation((query: string) => {
           if (query.includes('SELECT') && query.includes('idempotency_key')) {
             return Promise.resolve([]);
           }
           if (query.includes('LAST_INSERT_ID()')) {
             return Promise.resolve([{
               id: ++requestCounter,
               merchant_id: 'test_merchant',
               app_id: 'test_app',
               player_id: 'test_player',
               item_id: 'test_item',
               amount: amountPerRequest,
               expire_time: null,
               obtain_time: Date.now() / 1000,
               status: 'USABLE',
               created_at: new Date(),
               updated_at: new Date(),
             }]);
           }
           return Promise.resolve([]);
         }),
         $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
           // 原子预留每日配额：超过 dailyLimit 返回 0
           if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
             if (sharedDailyAmount + amountPerRequest <= dailyLimit) {
               sharedDailyAmount += amountPerRequest;
               return 1;
             }
             return 0;
           }
           return 1;
         }),
         app: {
           findFirst: jest.fn().mockResolvedValue({
             id: 'test_app',
             merchant_id: 'test_merchant',
             status: 1,
           }),
         },
         itemTemplate: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'test_item',
              merchant_id: 'test_merchant',
              app_id: 'test_app',
              item_name: '测试道具',
              item_type: 'test_type',
              eff_arg: '{}',
              is_active: 'ACTIVE',
              status: 'NORMAL',
              daily_limit_max: dailyLimit,
              limit_max: 100,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
       };
       return await callback(mockTx);
     });

    // 创建并发请求
    const promises = Array.from({ length: concurrentRequests }, (_, index) =>
      service.grantPlayerItem(
        {
          merchant_id: 'test_merchant',
          app_id: 'test_app',
          player_id: 'test_player',
          item_id: 'test_item',
          amount: amountPerRequest,
          remark: `并发测试${index}`,
        },
        `concurrent_test_${index}_${Date.now()}`
      )
    );

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 统计成功的请求数量
    const successfulRequests = results.filter((result: any) => result.success);
    const failedRequests = results.filter((result: any) => !result.success);

    console.log(`成功请求: ${successfulRequests.length}`);
    console.log(`失败请求: ${failedRequests.length}`);
    console.log('最终共享状态:', sharedDailyAmount);
    
    // 验证：成功的请求数量不应超过每日限制
    expect(successfulRequests.length).toBeLessThanOrEqual(dailyLimit);
    
    // 验证：失败的请求应该是因为超出每日限制
    failedRequests.forEach((result: any) => {
      expect(result.message).toContain('超出道具每日限制');
    });

    // 验证：成功请求 + 失败请求 = 总请求数
    expect(successfulRequests.length + failedRequests.length).toBe(concurrentRequests);
  }, 30000);

  it('应该在并发场景下防止通过多次小额发放绕过每日限制', async () => {
    const dailyLimit = 5;
    let currentDailyAmount = 0;
    
    // Mock 应用查询
    mockPrisma.app.findFirst.mockResolvedValue({
      id: 'test_app',
      merchant_id: 'test_merchant',
      status: 1,
    });

    // Mock 道具模板查询
    mockPrisma.itemTemplate.findFirst.mockResolvedValue({
      id: 'test_item',
      merchant_id: 'test_merchant',
      app_id: 'test_app',
      item_name: '测试道具',
      item_type: 'test_type',
      eff_arg: '{}',
      is_active: 'ACTIVE',
      status: 'NORMAL',
      daily_limit_max: dailyLimit,
      limit_max: 100,
    });

    // Mock 分片服务
    mockShardingService.getPlayerItemTables.mockResolvedValue(['player_items_202410']);
    mockShardingService.getAllItemRecordTables.mockResolvedValue(['item_records_202410']);
    mockShardingService.getPlayerItemTable.mockReturnValue('player_items_202410');
    mockShardingService.getItemRecordTable.mockReturnValue('item_records_202410');
    mockShardingService.getItemRecordTables.mockResolvedValue(['item_records_202410']);

    // Mock 幂等性检查
    mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
      if (query.includes('SELECT') && query.includes('idempotency_key')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // Mock 事务处理，模拟严格的并发控制
     mockPrisma.$transaction.mockImplementation(async (callback: any) => {
       const mockTx = {
         $queryRawUnsafe: jest.fn().mockImplementation((query: string) => {
           if (query.includes('SELECT') && query.includes('idempotency_key')) {
             return Promise.resolve([]);
           }
           if (query.includes('LAST_INSERT_ID()')) {
             return Promise.resolve([{
               id: 1,
               merchant_id: 'test_merchant',
               app_id: 'test_app',
               player_id: 'test_player',
               item_id: 'test_item',
               amount: 2,
               expire_time: null,
               obtain_time: Date.now() / 1000,
               status: 'USABLE',
               created_at: new Date(),
               updated_at: new Date(),
             }]);
           }
           return Promise.resolve([]);
         }),
         $executeRawUnsafe: jest.fn().mockImplementation((query: string) => {
           if (typeof query === 'string' && query.includes('UPDATE') && query.includes('item_limits') && query.includes('SET granted = granted +')) {
             if (currentDailyAmount + amountPerRequest <= dailyLimit) {
               currentDailyAmount += amountPerRequest;
               return 1;
             }
             return 0;
           }
           return 1;
         }),
         app: {
           findFirst: jest.fn().mockResolvedValue({
             id: 'test_app',
             merchant_id: 'test_merchant',
             status: 1,
           }),
         },
         itemTemplate: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'test_item',
              merchant_id: 'test_merchant',
              app_id: 'test_app',
              item_name: '测试道具',
              item_type: 'test_type',
              eff_arg: '{}',
              is_active: 'ACTIVE',
              status: 'NORMAL',
              daily_limit_max: dailyLimit,
              limit_max: 100,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
       };

      const result = await callback(mockTx);
      
      // 模拟严格的并发控制：检查是否会超出限制
      // 结果由原子更新决定，这里无需再校验

      return result;
    });

    const concurrentRequests = 6;
    const amountPerRequest = 2;

    // 创建并发请求
    const promises = Array.from({ length: concurrentRequests }, (_, index) =>
      service.grantPlayerItem(
        {
          merchant_id: 'test_merchant',
          app_id: 'test_app',
          player_id: 'test_player',
          item_id: 'test_item',
          amount: amountPerRequest,
          remark: `小额绕过测试${index}`,
        },
        `bypass_test_${index}_${Date.now()}`
      )
    );

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 统计成功的请求数量和总发放数量
    const successfulRequests = results.filter((result: any) => result.success);
    const totalGranted = successfulRequests.reduce((sum: number, result: any) => {
      return sum + (result.playerItem?.amount || 0);
    }, 0);

    console.log(`成功请求: ${successfulRequests.length}`);
    console.log(`总发放数量: ${totalGranted}`);
    console.log(`每日限制: ${dailyLimit}`);

    // 验证：总发放数量不应超过每日限制
    expect(totalGranted).toBeLessThanOrEqual(dailyLimit);
    
    // 在正确的并发控制下，应该最多只有2个成功请求（2*2=4 < 5）
    expect(successfulRequests.length).toBeLessThanOrEqual(2);
  }, 30000);
});