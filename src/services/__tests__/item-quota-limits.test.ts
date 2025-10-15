import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../player-item.service';
import { ShardingService } from '../sharding.service';
import { v4 as uuidv4 } from 'uuid';

describe('道具配额限制测试', () => {
  let prisma: PrismaClient;
  let shardingService: ShardingService;
  let playerItemService: PlayerItemService;

  let testMerchantId: string;
  let testAppId: string;
  let testItemId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    shardingService = new ShardingService(prisma);
    playerItemService = new PlayerItemService(prisma, shardingService);

    // 创建测试商户
    testMerchantId = uuidv4();
    await prisma.merchant.create({
      data: {
        id: testMerchantId,
        name: '测试商户-配额限制',
        status: 1,
        created_at: BigInt(Date.now()),
        updated_at: BigInt(Date.now()),
      },
    });

    // 创建测试应用
    testAppId = uuidv4();
    await prisma.app.create({
      data: {
        id: testAppId,
        merchant_id: testMerchantId,
        name: '测试应用-配额限制',
        status: 1,
        created_at: BigInt(Date.now()),
        updated_at: BigInt(Date.now()),
      },
    });

    // 创建道具模板：全局限制5个，单个玩家限制3个
    testItemId = 'TEST_QUOTA_ITEM';
    await prisma.itemTemplate.create({
      data: {
        id: testItemId,
        merchant_id: testMerchantId,
        app_id: testAppId,
        item_type: 'QUOTA_TEST',
        item_name: '配额测试道具',
        eff_arg: '{}',
        is_active: 'ACTIVE',
        status: 'NORMAL',
        total_limit: 5,              // 全局总限制：5个
        player_total_limit: 3,        // 单个玩家限制：3个
        created_at: BigInt(Date.now()),
        updated_at: BigInt(Date.now()),
      },
    });

    // 确保分表存在
    await shardingService.ensureTablesExist(testMerchantId, testAppId);
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.itemTemplate.deleteMany({
      where: { merchant_id: testMerchantId },
    });
    await prisma.app.deleteMany({
      where: { merchant_id: testMerchantId },
    });
    await prisma.merchant.delete({
      where: { id: testMerchantId },
    });

    await prisma.$disconnect();
  });

  describe('场景1: 单个玩家配额限制', () => {
    it('应该允许玩家A获得3个道具（达到玩家限制）', async () => {
      const playerA = 'player_a';

      // 第1次发放：成功
      const result1 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerA,
          item_id: testItemId,
          amount: 1,
          remark: '玩家A-第1次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result1.success).toBe(true);
      expect(result1.message).toBe('道具发放成功');

      // 第2次发放：成功
      const result2 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerA,
          item_id: testItemId,
          amount: 1,
          remark: '玩家A-第2次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result2.success).toBe(true);
      expect(result2.message).toBe('道具发放成功');

      // 第3次发放：成功（刚好达到玩家限制3个）
      const result3 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerA,
          item_id: testItemId,
          amount: 1,
          remark: '玩家A-第3次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result3.success).toBe(true);
      expect(result3.message).toBe('道具发放成功');
    });

    it('应该拒绝玩家A获得第4个道具（超出玩家限制）', async () => {
      const playerA = 'player_a';

      // 第4次发放：失败（超出玩家总限制）
      const result4 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerA,
          item_id: testItemId,
          amount: 1,
          remark: '玩家A-第4次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result4.success).toBe(false);
      expect(result4.message).toContain('超出玩家道具总限制');
      expect(result4.message).toContain('当前已获得 3 个');
      expect(result4.message).toContain('玩家总限制 3 个');
    });
  });

  describe('场景2: 全局配额限制', () => {
    it('应该允许玩家B获得2个道具（全局剩余2个）', async () => {
      const playerB = 'player_b';

      // 玩家B第1次发放：成功（全局已发放3个，还剩2个）
      const result1 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerB,
          item_id: testItemId,
          amount: 1,
          remark: '玩家B-第1次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result1.success).toBe(true);
      expect(result1.message).toBe('道具发放成功');

      // 玩家B第2次发放：成功（全局已发放4个，还剩1个）
      const result2 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerB,
          item_id: testItemId,
          amount: 1,
          remark: '玩家B-第2次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result2.success).toBe(true);
      expect(result2.message).toBe('道具发放成功');
    });

    it('应该拒绝玩家B获得第3个道具（超出全局限制）', async () => {
      const playerB = 'player_b';

      // 玩家B第3次发放：失败（全局已发放5个，达到全局限制）
      const result3 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerB,
          item_id: testItemId,
          amount: 1,
          remark: '玩家B-第3次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result3.success).toBe(false);
      expect(result3.message).toContain('超出道具总限制');
      expect(result3.message).toContain('全局共享');
      expect(result3.message).toContain('当前已发放 5 个');
      expect(result3.message).toContain('总限制 5 个');
    });
  });

  describe('场景3: 验证玩家C也无法获得道具', () => {
    it('应该拒绝新玩家C获得道具（全局配额已用尽）', async () => {
      const playerC = 'player_c';

      // 玩家C尝试获得道具：失败（全局配额已用尽）
      const result = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerC,
          item_id: testItemId,
          amount: 1,
          remark: '玩家C-尝试',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('超出道具总限制');
    });
  });

  describe('场景4: 只有全局限制的道具', () => {
    let onlyGlobalLimitItemId: string;

    beforeAll(async () => {
      // 创建只有全局限制的道具模板
      onlyGlobalLimitItemId = 'TEST_GLOBAL_ONLY';
      await prisma.itemTemplate.create({
        data: {
          id: onlyGlobalLimitItemId,
          merchant_id: testMerchantId,
          app_id: testAppId,
          item_type: 'GLOBAL_ONLY',
          item_name: '仅全局限制道具',
          eff_arg: '{}',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          total_limit: 5,              // 只有全局限制
          player_total_limit: null,    // 没有玩家限制
          created_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now()),
        },
      });
    });

    it('单个玩家应该可以获得超过3个道具（无玩家限制）', async () => {
      const playerD = 'player_d';

      // 玩家D获得4个道具：成功（没有玩家限制）
      for (let i = 1; i <= 4; i++) {
        const result = await playerItemService.grantPlayerItem(
          {
            merchant_id: testMerchantId,
            app_id: testAppId,
            player_id: playerD,
            item_id: onlyGlobalLimitItemId,
            amount: 1,
            remark: `玩家D-第${i}次`,
          },
          `idempotency_${uuidv4()}`
        );
        expect(result.success).toBe(true);
      }
    });

    it('但全局限制仍然生效', async () => {
      const playerD = 'player_d';

      // 玩家D尝试获得第5个：成功（全局刚好5个）
      const result5 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerD,
          item_id: onlyGlobalLimitItemId,
          amount: 1,
          remark: '玩家D-第5次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result5.success).toBe(true);

      // 玩家D尝试获得第6个：失败（全局超限）
      const result6 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerD,
          item_id: onlyGlobalLimitItemId,
          amount: 1,
          remark: '玩家D-第6次',
        },
        `idempotency_${uuidv4()}`
      );
      expect(result6.success).toBe(false);
      expect(result6.message).toContain('超出道具总限制');
    });
  });

  describe('场景5: 只有玩家限制的道具', () => {
    let onlyPlayerLimitItemId: string;

    beforeAll(async () => {
      // 创建只有玩家限制的道具模板
      onlyPlayerLimitItemId = 'TEST_PLAYER_ONLY';
      await prisma.itemTemplate.create({
        data: {
          id: onlyPlayerLimitItemId,
          merchant_id: testMerchantId,
          app_id: testAppId,
          item_type: 'PLAYER_ONLY',
          item_name: '仅玩家限制道具',
          eff_arg: '{}',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          total_limit: null,           // 没有全局限制
          player_total_limit: 2,       // 只有玩家限制
          created_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now()),
        },
      });
    });

    it('每个玩家独立获得2个道具，不受全局限制', async () => {
      const playerE = 'player_e';
      const playerF = 'player_f';
      const playerG = 'player_g';

      // 玩家E获得2个：成功
      for (let i = 1; i <= 2; i++) {
        const result = await playerItemService.grantPlayerItem(
          {
            merchant_id: testMerchantId,
            app_id: testAppId,
            player_id: playerE,
            item_id: onlyPlayerLimitItemId,
            amount: 1,
          },
          `idempotency_${uuidv4()}`
        );
        expect(result.success).toBe(true);
      }

      // 玩家F获得2个：成功（独立计数）
      for (let i = 1; i <= 2; i++) {
        const result = await playerItemService.grantPlayerItem(
          {
            merchant_id: testMerchantId,
            app_id: testAppId,
            player_id: playerF,
            item_id: onlyPlayerLimitItemId,
            amount: 1,
          },
          `idempotency_${uuidv4()}`
        );
        expect(result.success).toBe(true);
      }

      // 玩家G获得2个：成功（没有全局限制）
      for (let i = 1; i <= 2; i++) {
        const result = await playerItemService.grantPlayerItem(
          {
            merchant_id: testMerchantId,
            app_id: testAppId,
            player_id: playerG,
            item_id: onlyPlayerLimitItemId,
            amount: 1,
          },
          `idempotency_${uuidv4()}`
        );
        expect(result.success).toBe(true);
      }

      // 玩家E尝试获得第3个：失败（超出玩家限制）
      const resultE3 = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerE,
          item_id: onlyPlayerLimitItemId,
          amount: 1,
        },
        `idempotency_${uuidv4()}`
      );
      expect(resultE3.success).toBe(false);
      expect(resultE3.message).toContain('超出玩家道具总限制');
    });
  });
});
