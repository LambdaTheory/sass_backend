import { PrismaClient } from '@prisma/client';
import { AppService } from '../../src/services/app.service';
import { ShardingService } from '../../src/services/sharding.service';

describe('AppService', () => {
  let appService: AppService;
  let prisma: PrismaClient;
  let shardingService: ShardingService;

  beforeEach(() => {
    prisma = new PrismaClient();
    shardingService = new ShardingService(prisma);
    appService = new AppService(prisma);
    // Mock the sharding service methods
    jest.spyOn(shardingService, 'getAllPlayerItemTables').mockResolvedValue(['player_items_test_202301']);
    jest.spyOn(shardingService, 'getAllItemRecordTables').mockResolvedValue(['item_records_test_20230101']);
    jest.spyOn(shardingService, 'filterExistingTables').mockImplementation(async (tables) => tables); // 假设所有表都存在
    (appService as any).shardingService = shardingService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAppStat', () => {
    it('should return app statistics', async () => {
      // Mock the prisma query raw results
      prisma.$queryRawUnsafe = jest.fn()
        .mockResolvedValueOnce([{ count: 10n }]) // player count
        .mockResolvedValueOnce([{ count: 100n, totalAmount: 1000 }]) // item count and total amount
        .mockResolvedValueOnce([{ count: 500n }]); // item record count

      const stats = await appService.getAppStat('test');

      expect(stats).toEqual({
        player_count: 10,
        item_count: 100,
        item_total_amount: 1000,
        item_record_count: 500,
      });
    });
  });
});