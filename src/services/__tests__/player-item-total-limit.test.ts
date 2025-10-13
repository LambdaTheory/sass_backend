import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../player-item.service';
import { ShardingService } from '../sharding.service';

describe('PlayerItemService - Total Limit Concurrency Tests', () => {
  let prisma: PrismaClient;
  let shardingService: ShardingService;
  let playerItemService: PlayerItemService;

  const testMerchantId = 'test-merchant-total-limit';
  const testAppId = 'test-app-total-limit';
  const testPlayerId = 'test-player-total-limit';
  const testItemId = 'test-item-total-limit';

  beforeAll(async () => {
    prisma = new PrismaClient();
    shardingService = new ShardingService(prisma);
    playerItemService = new PlayerItemService(prisma, shardingService);

    // 确保分片表存在
    await shardingService.ensureTablesExist(testMerchantId, testAppId);

    // 创建测试道具模板
    await prisma.itemTemplate.upsert({
      where: {
        merchant_id_id: {
          merchant_id: testMerchantId,
          id: testItemId,
        },
      },
      update: {
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '测试道具-总限制',
        eff_arg: '{}',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 50, // 设置总限制为50
        status: 'NORMAL',
        updated_at: Math.floor(Date.now() / 1000),
      },
      create: {
        id: testItemId,
        merchant_id: testMerchantId,
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '测试道具-总限制',
        eff_arg: '{}',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 50, // 设置总限制为50
        status: 'NORMAL',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  });

  afterAll(async () => {
    // 清理测试数据
    try {
      await prisma.itemTemplate.deleteMany({
        where: {
          merchant_id: testMerchantId,
          app_id: testAppId,
        },
      });

      // 清理分片表数据
      const playerItemTable = shardingService.getPlayerItemTable(testAppId);
      const itemRecordTable = shardingService.getItemRecordTable(testAppId);
      const totalLimitTable = shardingService.getItemTotalLimitTable(testAppId);

      await prisma.$executeRawUnsafe(`DELETE FROM \`${playerItemTable}\` WHERE merchant_id = ?`, testMerchantId);
      await prisma.$executeRawUnsafe(`DELETE FROM \`${itemRecordTable}\` WHERE merchant_id = ?`, testMerchantId);
      await prisma.$executeRawUnsafe(`DELETE FROM \`${totalLimitTable}\` WHERE merchant_id = ?`, testMerchantId);
    } catch (error) {
      console.warn('清理测试数据时出错:', error);
    }

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 每个测试前清理相关数据
    const playerItemTable = shardingService.getPlayerItemTable(testAppId);
    const itemRecordTable = shardingService.getItemRecordTable(testAppId);
    const totalLimitTable = shardingService.getItemTotalLimitTable(testAppId);

    await prisma.$executeRawUnsafe(`DELETE FROM \`${playerItemTable}\` WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?`, 
      testMerchantId, testAppId, testPlayerId, testItemId);
    await prisma.$executeRawUnsafe(`DELETE FROM \`${itemRecordTable}\` WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?`, 
      testMerchantId, testAppId, testPlayerId, testItemId);
    await prisma.$executeRawUnsafe(`DELETE FROM \`${totalLimitTable}\` WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?`, 
      testMerchantId, testAppId, testPlayerId, testItemId);
  });

  test('应该防止通过并发请求绕过总发放上限', async () => {
    const totalLimit = 50;
    const concurrentRequests = 10;
    const amountPerRequest = 10; // 每次请求10个，总共100个，超过限制50个

    // 并发发起多个请求
    const promises = Array.from({ length: concurrentRequests }, (_, index) =>
      playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: testPlayerId,
          item_id: testItemId,
          amount: amountPerRequest,
          remark: `并发测试-${index}`,
        },
        `concurrent-test-${index}-${Date.now()}`
      )
    );

    const results = await Promise.all(promises);

    // 统计成功和失败的请求
    const successResults = results.filter(r => r.success);
    const failureResults = results.filter(r => !r.success);

    // 计算总发放数量
    const totalGranted = successResults.reduce((sum, result) => {
      return sum + (result.playerItem?.amount || 0);
    }, 0);

    // 验证总发放数量不超过限制
    expect(totalGranted).toBeLessThanOrEqual(totalLimit);

    // 验证至少有一些请求失败（因为总请求量超过限制）
    expect(failureResults.length).toBeGreaterThan(0);

    // 验证失败的请求包含正确的错误信息
    failureResults.forEach(result => {
      expect(result.message).toContain('超出道具总发放限制');
    });

    console.log(`并发测试结果: 成功 ${successResults.length} 个请求，失败 ${failureResults.length} 个请求，总发放 ${totalGranted} 个道具`);
  });

  test('应该防止通过分批发放绕过总发放上限', async () => {
    const totalLimit = 50;
    
    // 第一批：发放30个
    const firstBatch = await playerItemService.grantPlayerItem(
      {
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 30,
        remark: '第一批发放',
      },
      `batch-test-1-${Date.now()}`
    );

    expect(firstBatch.success).toBe(true);
    expect(firstBatch.playerItem?.amount).toBe(30);

    // 第二批：尝试发放25个（总共55个，超过限制50个）
    const secondBatch = await playerItemService.grantPlayerItem(
      {
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 25,
        remark: '第二批发放',
      },
      `batch-test-2-${Date.now()}`
    );

    expect(secondBatch.success).toBe(false);
    expect(secondBatch.message).toContain('超出道具总发放限制');

    // 第三批：发放剩余的20个（总共50个，正好达到限制）
    const thirdBatch = await playerItemService.grantPlayerItem(
      {
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 20,
        remark: '第三批发放',
      },
      `batch-test-3-${Date.now()}`
    );

    expect(thirdBatch.success).toBe(true);
    expect(thirdBatch.playerItem?.amount).toBe(20);

    // 第四批：尝试再发放1个（总共51个，超过限制）
    const fourthBatch = await playerItemService.grantPlayerItem(
      {
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 1,
        remark: '第四批发放',
      },
      `batch-test-4-${Date.now()}`
    );

    expect(fourthBatch.success).toBe(false);
    expect(fourthBatch.message).toContain('超出道具总发放限制');

    // 验证总发放数量
    const playerItems = await playerItemService.getPlayerItems(
      testMerchantId,
      testAppId,
      testPlayerId
    );

    const totalAmount = playerItems
      .filter(item => item.item_id === testItemId)
      .reduce((sum, item) => sum + item.amount, 0);

    expect(totalAmount).toBe(50); // 正好达到限制
  });

  test('应该正确处理总限制为0的情况', async () => {
    // 创建一个总限制为0的道具模板
    const zeroLimitItemId = 'zero-limit-item';
    await prisma.itemTemplate.upsert({
      where: {
        merchant_id_id: {
          merchant_id: testMerchantId,
          id: zeroLimitItemId,
        },
      },
      update: {
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '零限制道具',
        eff_arg: '{}',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 0, // 总限制为0
        status: 'NORMAL',
        updated_at: Math.floor(Date.now() / 1000),
      },
      create: {
        id: zeroLimitItemId,
        merchant_id: testMerchantId,
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '零限制道具',
        eff_arg: '{}',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 0, // 总限制为0
        status: 'NORMAL',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });

    // 尝试发放任何数量都应该失败
    const result = await playerItemService.grantPlayerItem(
      {
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: zeroLimitItemId,
        amount: 1,
        remark: '零限制测试',
      },
      `zero-limit-test-${Date.now()}`
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('超出道具总发放限制');

    // 清理
    await prisma.itemTemplate.delete({
      where: {
        merchant_id_id: {
          merchant_id: testMerchantId,
          id: zeroLimitItemId,
        },
      },
    });
  });
});