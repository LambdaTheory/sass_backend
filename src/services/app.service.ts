import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';

export class AppService {
  private shardingService: ShardingService;

  constructor(private prisma: PrismaClient) {
    this.shardingService = new ShardingService(prisma);
  }

  async getAppStat(appId: string) {
    const playerItemTables = await this.shardingService.getAllPlayerItemTables(appId);
    const itemRecordTables = await this.shardingService.getAllItemRecordTables(appId);

    let playerCount = 0;
    let itemCount = 0;
    let itemTotalAmount = 0;
    let itemRecordCount = 0;

    if (playerItemTables.length > 0) {
      const playerCountQuery = `SELECT COUNT(DISTINCT player_id) as count FROM (${playerItemTables.map(t => `SELECT player_id FROM \`${t}\``).join(' UNION ALL ')}) as players`;
      const playerCountResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(playerCountQuery);
      playerCount = Number(playerCountResult[0].count);

      const itemCountQuery = `SELECT COUNT(*) as count, SUM(amount) as totalAmount FROM (${playerItemTables.map(t => `SELECT amount FROM \`${t}\``).join(' UNION ALL ')}) as items`;
      const itemCountResult = await this.prisma.$queryRawUnsafe<{ count: bigint, totalAmount: number }[]>(itemCountQuery);
      itemCount = Number(itemCountResult[0].count);
      itemTotalAmount = Number(itemCountResult[0].totalAmount) || 0;
    }

    if (itemRecordTables.length > 0) {
      const itemRecordCountQuery = `SELECT COUNT(*) as count FROM (${itemRecordTables.map(t => `SELECT id FROM \`${t}\``).join(' UNION ALL ')}) as records`;
      const itemRecordCountResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(itemRecordCountQuery);
      itemRecordCount = Number(itemRecordCountResult[0].count);
    }

    return {
      player_count: playerCount,
      item_count: itemCount,
      item_total_amount: itemTotalAmount,
      item_record_count: itemRecordCount,
    };
  }

  async updateApp(
    id: string,
    data: { name?: string; status?: number },
  ) {
    const { name, status } = data;

    if (!name && status === undefined) {
      throw new Error("Name or status must be provided for update.");
    }

    const app = await this.prisma.app.findUnique({
      where: { id },
    });

    if (!app) {
      throw new Error("App not found");
    }

    if (name) {
      const existingApp = await this.prisma.app.findFirst({
        where: {
          name,
          merchant_id: app.merchant_id,
          id: {
            not: id,
          },
        },
      });
      if (existingApp) {
        throw new Error("应用名称已存在，请使用其他名称");
      }
    }

    const updatedApp = await this.prisma.app.update({
      where: { id },
      data: {
        name,
        status,
        updated_at: BigInt(Date.now()),
      },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      id: updatedApp.id,
      name: updatedApp.name,
      merchant_id: updatedApp.merchant_id,
      merchant_name: updatedApp.merchant.name,
      status: updatedApp.status,
      created_at: Number(updatedApp.created_at),
      updated_at: Number(updatedApp.updated_at),
    };
  }

  async deleteApp(id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
    });

    if (!app) {
      throw new Error("App not found");
    }

    // 删除应用相关的分片表
    const playerItemTables = await this.shardingService.getAllPlayerItemTables(id);
    const itemRecordTables = await this.shardingService.getAllItemRecordTables(id);

    // 删除所有相关的分片表
    for (const table of playerItemTables) {
      await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
    }

    for (const table of itemRecordTables) {
      await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
    }

    // 删除应用记录
    await this.prisma.app.delete({
      where: { id },
    });

    return { message: "应用删除成功" };
  }
}