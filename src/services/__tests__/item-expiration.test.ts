import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../player-item.service';
import { ShardingService } from '../sharding.service';
import { randomUUID } from 'crypto';

const uuidv4 = randomUUID;

describe('道具过期测试', () => {
  let prisma: PrismaClient;
  let shardingService: ShardingService;
  let playerItemService: PlayerItemService;

  let testMerchantId: string;
  let testAppId: string;
  let relativeExpireItemId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    shardingService = new ShardingService(prisma);
    playerItemService = new PlayerItemService(prisma, shardingService);

    // 创建测试商户
    testMerchantId = uuidv4();
    await prisma.merchant.create({
      data: {
        id: testMerchantId,
        name: '测试商户-过期测试',
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
        name: '测试应用-过期测试',
        status: 1,
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

  describe('场景1: 相对过期模式（expire_duration）', () => {
    beforeAll(async () => {
      // 创建相对过期的道具模板：2小时后过期
      relativeExpireItemId = 'RELATIVE_EXPIRE_ITEM';
      await prisma.itemTemplate.create({
        data: {
          id: relativeExpireItemId,
          merchant_id: testMerchantId,
          app_id: testAppId,
          item_type: 'RELATIVE_EXPIRE',
          item_name: '相对过期道具',
          eff_arg: '{}',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          expire_duration: 2, // 2小时后过期
          created_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now()),
        },
      });
    });

    it('应该正确计算和存储过期时间', async () => {
      const playerId = 'player_expire_test_1';
      const beforeGrant = Math.floor(Date.now() / 1000);

      // 发放道具
      const result = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerId,
          item_id: relativeExpireItemId,
          amount: 1,
          remark: '测试相对过期',
        },
        `idempotency_${uuidv4()}`
      );

      const afterGrant = Math.floor(Date.now() / 1000);

      console.log('发放结果:', result);
      expect(result.success).toBe(true);
      expect(result.playerItem).toBeDefined();

      // 验证过期时间
      const playerItem = result.playerItem!;
      console.log('玩家道具信息:', {
        id: playerItem.id,
        amount: playerItem.amount,
        expire_time: playerItem.expire_time,
        expire_time_type: typeof playerItem.expire_time,
        obtain_time: playerItem.obtain_time,
        obtain_time_type: typeof playerItem.obtain_time,
        status: playerItem.status,
      });

      expect(playerItem.expire_time).toBeDefined();

      // 转换类型以便比较
      const expireTime = Number(playerItem.expire_time);
      const obtainTime = Number(playerItem.obtain_time);

      console.log('时间计算验证:', {
        beforeGrant,
        obtainTime,
        afterGrant,
        expireTime,
        expectedExpireMin: beforeGrant + 2 * 3600,
        expectedExpireMax: afterGrant + 2 * 3600,
        diff: expireTime - obtainTime,
        expectedDiff: 2 * 3600,
      });

      // 过期时间应该是发放时间 + 2小时（7200秒）
      // 允许几秒的误差
      expect(expireTime).toBeGreaterThanOrEqual(beforeGrant + 2 * 3600);
      expect(expireTime).toBeLessThanOrEqual(afterGrant + 2 * 3600);

      // 验证状态应该是USABLE（尚未过期）
      expect(playerItem.status).toBe('USABLE');
    });

    it('查询时应该正确判断未过期状态', async () => {
      const playerId = 'player_expire_test_1';

      // 查询道具
      const items = await playerItemService.getPlayerItems(
        testMerchantId,
        testAppId,
        playerId,
        undefined,
        undefined,
        relativeExpireItemId
      );

      console.log('查询到的道具:', items);
      expect(items.length).toBeGreaterThan(0);

      const item = items[0];
      console.log('道具状态:', {
        id: item.id,
        expire_time: item.expire_time,
        expire_time_type: typeof item.expire_time,
        status: item.status,
        current_time: Math.floor(Date.now() / 1000),
      });

      // 道具应该还未过期
      expect(item.status).toBe('USABLE');
      expect(item.amount).toBe(1);
    });

    it('验证从数据库直接查询的过期时间', async () => {
      const playerId = 'player_expire_test_1';
      const tableName = shardingService.getPlayerItemTable(testAppId);

      console.log('查询表名:', tableName);

      // 直接查询数据库
      const rawItems = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM \`${tableName}\` WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?`,
        testMerchantId,
        testAppId,
        playerId,
        relativeExpireItemId
      );

      console.log('数据库原始数据:', rawItems);
      expect(rawItems.length).toBeGreaterThan(0);

      const rawItem = rawItems[0];
      const now = Math.floor(Date.now() / 1000);

      console.log('数据库字段详情:', {
        expire_time_value: rawItem.expire_time,
        expire_time_type: typeof rawItem.expire_time,
        expire_time_constructor: rawItem.expire_time?.constructor?.name,
        obtain_time_value: rawItem.obtain_time,
        obtain_time_type: typeof rawItem.obtain_time,
        current_time: now,
        is_expired_check: rawItem.expire_time && now > rawItem.expire_time,
      });

      // 验证过期时间存在且为数值
      expect(rawItem.expire_time).toBeDefined();
      expect(rawItem.expire_time).not.toBeNull();

      // 转换为数字进行比较
      const expireTime = Number(rawItem.expire_time);
      const obtainTime = Number(rawItem.obtain_time);

      console.log('数值比较:', {
        expireTime,
        obtainTime,
        now,
        diff: expireTime - obtainTime,
        expected_diff: 2 * 3600,
        is_expired: now > expireTime,
        time_until_expire: expireTime - now,
      });

      // 验证过期时间 = 获取时间 + 2小时
      expect(expireTime - obtainTime).toBeGreaterThanOrEqual(7199); // 允许1秒误差
      expect(expireTime - obtainTime).toBeLessThanOrEqual(7201);
    });
  });

  describe('场景2: 模拟过期检查', () => {
    it('应该能检测到已过期的道具', async () => {
      // 创建一个已经过期的道具模板（1秒后过期）
      const shortExpireItemId = 'SHORT_EXPIRE_ITEM';
      await prisma.itemTemplate.create({
        data: {
          id: shortExpireItemId,
          merchant_id: testMerchantId,
          app_id: testAppId,
          item_type: 'SHORT_EXPIRE',
          item_name: '短期过期道具',
          eff_arg: '{}',
          is_active: 'ACTIVE',
          status: 'NORMAL',
          expire_duration: 1 / 3600, // 1秒后过期（1/3600小时）
          created_at: BigInt(Date.now()),
          updated_at: BigInt(Date.now()),
        },
      });

      const playerId = 'player_expire_test_2';

      // 发放道具
      const grantResult = await playerItemService.grantPlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerId,
          item_id: shortExpireItemId,
          amount: 1,
          remark: '测试短期过期',
        },
        `idempotency_${uuidv4()}`
      );

      console.log('发放短期道具结果:', grantResult);
      expect(grantResult.success).toBe(true);

      // 等待2秒让道具过期
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 查询道具，应该显示为UNUSABLE
      const items = await playerItemService.getPlayerItems(
        testMerchantId,
        testAppId,
        playerId,
        undefined,
        undefined,
        shortExpireItemId
      );

      console.log('过期后查询结果:', items);
      expect(items.length).toBeGreaterThan(0);

      const item = items[0];
      console.log('过期道具状态:', {
        id: item.id,
        expire_time: item.expire_time,
        status: item.status,
        current_time: Math.floor(Date.now() / 1000),
        is_expired: item.expire_time && Math.floor(Date.now() / 1000) > Number(item.expire_time),
      });

      // 道具应该已经过期
      expect(item.status).toBe('UNUSABLE');

      // 尝试消费过期道具，应该失败
      const consumeResult = await playerItemService.consumePlayerItem(
        {
          merchant_id: testMerchantId,
          app_id: testAppId,
          player_id: playerId,
          item_id: shortExpireItemId,
          amount: 1,
        },
        `idempotency_consume_${uuidv4()}`
      );

      console.log('消费过期道具结果:', consumeResult);
      expect(consumeResult.success).toBe(false);
      expect(consumeResult.message).toContain('过期');
    });
  });
});
