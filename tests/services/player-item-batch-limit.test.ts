import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../../src/services/player-item.service';
import { ShardingService } from '../../src/services/sharding.service';

describe('PlayerItemService - 分批操作总量限制测试', () => {
  let prisma: PrismaClient;
  let shardingService: ShardingService;
  let playerItemService: PlayerItemService;

  const testMerchantId = 'test_merchant_batch';
  const testAppId = 'test_app_batch';
  const testPlayerId = 'test_player_batch';
  const testItemId = 'test_item_batch';

  beforeAll(async () => {
    prisma = new PrismaClient();
    shardingService = new ShardingService(prisma);
    playerItemService = new PlayerItemService(prisma, shardingService);

    // 确保分片表存在
    await shardingService.ensureTablesExist(testMerchantId, testAppId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 清理测试数据
    await prisma.itemTemplate.deleteMany({
      where: { merchant_id: testMerchantId }
    });

    // 清理分片表数据
    const playerItemTable = shardingService.getPlayerItemTable(testAppId);
    const itemRecordTable = shardingService.getItemRecordTable(testAppId);
    const totalLimitTable = shardingService.getItemTotalLimitTable(testAppId);

    await prisma.$executeRawUnsafe(`DELETE FROM \`${playerItemTable}\` WHERE merchant_id = ?`, testMerchantId);
    await prisma.$executeRawUnsafe(`DELETE FROM \`${itemRecordTable}\` WHERE merchant_id = ?`, testMerchantId);
    await prisma.$executeRawUnsafe(`DELETE FROM \`${totalLimitTable}\` WHERE merchant_id = ?`, testMerchantId);

    const now = Math.floor(Date.now() / 1000);
    
    // 创建测试道具模板，总限制为50
    await prisma.itemTemplate.upsert({
      where: { merchant_id_id: { merchant_id: testMerchantId, id: testItemId } },
      update: {
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '测试道具-分批限制',
        eff_arg: '{}',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 50,
        status: 'NORMAL',
        is_active: 'ACTIVE',
        updated_at: now,
      },
      create: {
        id: testItemId,
        merchant_id: testMerchantId,
        app_id: testAppId,
        item_type: 'CONSUMABLE',
        item_name: '测试道具-分批限制',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        limit_max: 1000,
        daily_limit_max: 100,
        total_limit: 50, // 总限制50个
        eff_arg: '{}',
        created_at: now,
        updated_at: now
      }
    });
  });

  describe('分批操作总量限制验证', () => {
    test('应该防止分批操作绕过总量限制', async () => {
      // 第一批：发放30个
      const result1 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 30
      }, 'batch_test_1');

      expect(result1.success).toBe(true);
      expect(result1.playerItem?.amount).toBe(30);

      // 第二批：尝试发放25个（总共55个，应该失败）
      const result2 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 25
      }, 'batch_test_2');

      expect(result2.success).toBe(false);
      expect(result2.message).toContain('超出道具总限制');
      expect(result2.message).toContain('当前已发放 30 个');
      expect(result2.message).toContain('本次发放 25 个');
      expect(result2.message).toContain('总限制 50 个');

      // 第三批：发放20个（总共50个，应该成功）
      const result3 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 20
      }, 'batch_test_3');

      expect(result3.success).toBe(true);
      expect(result3.playerItem?.amount).toBe(50); // 累计50个

      // 第四批：尝试再发放1个（总共51个，应该失败）
      const result4 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 1
      }, 'batch_test_4');

      expect(result4.success).toBe(false);
      expect(result4.message).toContain('超出道具总限制');
      expect(result4.message).toContain('当前已发放 50 个');
    });

    test('应该正确处理多次小批量发放', async () => {
      // 连续发放10次，每次5个，总共50个
      let totalGranted = 0;
      
      for (let i = 1; i <= 10; i++) {
        const result = await playerItemService.grantPlayerItem({
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: testPlayerId,
          item_id: testItemId,
          amount: 5
        }, `small_batch_${i}`);

        expect(result.success).toBe(true);
        totalGranted += 5;
        expect(result.playerItem?.amount).toBe(totalGranted);
      }

      // 尝试再发放1个，应该失败
      const finalResult = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 1
      }, 'final_attempt');

      expect(finalResult.success).toBe(false);
      expect(finalResult.message).toContain('超出道具总限制');
      expect(finalResult.message).toContain('当前已发放 50 个');
    });

    test('应该正确处理边界情况', async () => {
      // 发放49个
      const result1 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 49
      }, 'boundary_test_1');

      expect(result1.success).toBe(true);

      // 再发放1个，应该成功（总共50个）
      const result2 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 1
      }, 'boundary_test_2');

      expect(result2.success).toBe(true);
      expect(result2.playerItem?.amount).toBe(50);

      // 再尝试发放1个，应该失败
      const result3 = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: testItemId,
        amount: 1
      }, 'boundary_test_3');

      expect(result3.success).toBe(false);
      expect(result3.message).toContain('超出道具总限制');
    });

    test('应该正确处理总限制为0的情况', async () => {
      const now = Math.floor(Date.now() / 1000);
      
      // 创建总限制为0的道具
      await prisma.itemTemplate.upsert({
        where: { merchant_id_id: { merchant_id: testMerchantId, id: 'zero_limit_item' } },
        update: {},
        create: {
          id: 'zero_limit_item',
          merchant_id: testMerchantId,
          app_id: testAppId,
          item_type: 'CONSUMABLE',
          item_name: '零限制道具',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          limit_max: 1000,
          daily_limit_max: 100,
          total_limit: 0, // 总限制0个
          eff_arg: '{}',
          created_at: now,
          updated_at: now
        }
      });

      // 尝试发放任何数量都应该失败
      const result = await playerItemService.grantPlayerItem({
        merchant_id: testMerchantId,
        app_id: testAppId,
        player_id: testPlayerId,
        item_id: 'zero_limit_item',
        amount: 1
      }, 'zero_limit_test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('超出道具总限制');
      expect(result.message).toContain('总限制 0 个');
    });
  });
});