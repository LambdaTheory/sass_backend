import { PrismaClient } from '@prisma/client';
import { ShardingService } from "./sharding.service";

// 玩家道具类型定义
export interface PlayerItem {
  id: number;
  merchant_id: string;
  app_id: string;
  player_id: string;
  item_id: string;
  item_name?: string; // 道具名称，从道具模板表关联查询
  amount: number;
  expire_time?: number;
  obtain_time: number;
  status: 'USABLE' | 'UNUSABLE';
  latest_idempotency_key?: string; // 最新的幂等性键
}

export class PlayerItemService {
  constructor(
    private prisma: PrismaClient,
    private shardingService: ShardingService
  ) {}

  // ==================== 发放道具 ====================

  /**
   * 发放道具给玩家
   * @param data 发放道具数据
   * @param idempotencyKey 幂等性键，用于防止重复发放
   * @returns 发放结果
   */
  async grantPlayerItem(
    data: {
      merchant_id: string;
      app_id: string;
      player_id: string;
      item_id: string;
      amount: number;
      remark?: string;
    },
    idempotencyKey: string
  ): Promise<{
    success: boolean;
    playerItem?: PlayerItem;
    itemRecord?: any;
    message: string;
  }> {
    const now = Math.floor(Date.now() / 1000);

    // 确保分表存在
    await this.shardingService.ensureTablesExist(
      data.merchant_id,
      data.app_id,
      now
    );

    const playerItemTableName = this.shardingService.getPlayerItemTable(
      data.app_id,
      now
    );
    const itemRecordTableName = this.shardingService.getItemRecordTable(
      data.app_id,
      now
    );

    // 使用事务确保数据一致性
    return await this.prisma.$transaction(async (tx) => {
      // 1. 检查幂等性 - 查询是否已经有相同的流水记录
      // 需要查询所有可能的表，因为幂等性键可能在之前的表中
      const allRecordTables = await this.shardingService.getAllItemRecordTables(
        data.app_id
      );
      let existingRecord: any[] = [];

      // 如果没有任何表，则跳过幂等性检查
      if (allRecordTables.length > 0) {
        // 构建查询所有表的UNION语句
        const queries = allRecordTables.map(
          (table) =>
            `SELECT id FROM \`${table}\` WHERE merchant_id = '${data.merchant_id}' AND app_id = '${data.app_id}' AND player_id = '${data.player_id}' AND item_id = '${data.item_id}' AND remark = 'idempotency:${idempotencyKey}'`
        );

        const unionQuery = queries.join(" UNION ALL ") + " LIMIT 1";

        try {
          existingRecord = await tx.$queryRawUnsafe<any[]>(unionQuery);
        } catch (error) {
          // 如果查询失败（比如表不存在），继续执行，不影响正常流程
          console.warn("幂等性检查查询失败，继续执行:", error);
          existingRecord = [];
        }
      }

      if (existingRecord.length > 0) {
        return {
          success: true,
          message: "道具已发放，幂等性检查通过",
        };
      }

      // 2. 检查应用是否被禁用
      const appData = await tx.app.findFirst({
        where: {
          id: data.app_id,
          merchant_id: data.merchant_id,
        },
      });

      if (!appData) {
        return {
          success: false,
          message: "应用不存在",
        };
      }

      if (appData.status !== 1) {
        return {
          success: false,
          message: "应用已被禁用，无法核销道具",
        };
      }

      // 3. 检查应用是否被禁用
      const appInfo = await tx.app.findFirst({
        where: {
          id: data.app_id,
          merchant_id: data.merchant_id,
        },
      });

      if (!appInfo) {
        return {
          success: false,
          message: "应用不存在",
        };
      }

      if (appInfo.status !== 1) {
        return {
          success: false,
          message: "应用已被禁用，无法发放道具",
        };
      }

      // 4. 先执行动态过期检查，确保数据库状态最新
      const currentTimestamp = Date.now();
      await tx.itemTemplate.updateMany({
        where: {
          merchant_id: data.merchant_id,
          app_id: data.app_id,
          status: "NORMAL",
          expire_date: {
            not: null,
            lte: BigInt(currentTimestamp)
          }
        },
        data: {
          status: "EXPIRED",
          updated_at: BigInt(currentTimestamp)
        }
      });

      // 5. 检查道具模板是否存在且有效
      const itemTemplate = await tx.itemTemplate.findFirst({
        where: {
          id: data.item_id,
          merchant_id: data.merchant_id,
          app_id: data.app_id,
          is_active: "ACTIVE",
          status: "NORMAL",
        },
      });

      if (!itemTemplate) {
        return {
          success: false,
          message: "道具模板不存在或已失效",
        };
      }

      // 6. 检查道具模板是否过期（这个检查现在应该不会触发，因为上面已经更新了状态）
      if (itemTemplate.expire_date && now > Number(itemTemplate.expire_date)) {
        return {
          success: false,
          message: "道具模板已过期，无法发放道具",
        };
      }

      // 7. 检查发放限制
      if (itemTemplate.total_limit && itemTemplate.total_limit > 0) {
        // 查询已发放总数
        const grantedCount = await this.getPlayerItemTotalAmount(
          data.merchant_id,
          data.app_id,
          data.player_id,
          data.item_id,
          tx
        );

        if (grantedCount + data.amount > itemTemplate.total_limit) {
          return {
            success: false,
            message: `超出道具总限制，当前已有${grantedCount}个，限制${itemTemplate.total_limit}个`,
          };
        }
      }

      // 7. 检查每日限制
      if (itemTemplate.daily_limit_max && itemTemplate.daily_limit_max > 0) {
        const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        const todayEnd = Math.floor(
          new Date().setHours(23, 59, 59, 999) / 1000
        );

        const todayGranted = await this.getPlayerItemAmountInTimeRange(
          data.merchant_id,
          data.app_id,
          data.player_id,
          data.item_id,
          todayStart,
          todayEnd,
          tx
        );

        if (todayGranted + data.amount > itemTemplate.daily_limit_max) {
          return {
            success: false,
            message: `超出道具每日限制，今日已获得${todayGranted}个，限制${itemTemplate.daily_limit_max}个`,
          };
        }
      }

      // 8. 计算过期时间 - 根据道具模板配置计算最小过期时间
      let expireTime: number | undefined;
      const expireTimes: number[] = [];

      // 如果有固定过期时间(小时)，计算从当前时间开始的过期时间戳
      if (itemTemplate.expire_duration && itemTemplate.expire_duration > 0) {
        // expire_duration是小时数，需要转换为秒数（1小时 = 3600秒）
        expireTimes.push(now + itemTemplate.expire_duration * 3600);
      }

      // 如果有固定过期时间戳，直接使用
      if (itemTemplate.expire_date) {
        expireTimes.push(Number(itemTemplate.expire_date));
      }

      // 取最小值作为过期时间
      if (expireTimes.length > 0) {
        expireTime = Math.min(...expireTimes);
      }

      // 9. 每次发放都创建新的道具记录（不再合并相同item_id的道具）
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${playerItemTableName}\` (merchant_id, app_id, player_id, item_id, amount, expire_time, obtain_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.merchant_id,
        data.app_id,
        data.player_id,
        data.item_id,
        data.amount,
        expireTime,
        now,
        expireTime && now > expireTime ? "UNUSABLE" : "USABLE",
        now,
        now
      );

      const newItem = await tx.$queryRawUnsafe<PlayerItem[]>(
        `SELECT * FROM \`${playerItemTableName}\` WHERE id = LAST_INSERT_ID()`
      );

      const playerItem = newItem[0];

      // 11. 创建流水记录
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${itemRecordTableName}\` (merchant_id, app_id, player_id, item_id, amount, record_type, remark, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.merchant_id,
        data.app_id,
        data.player_id,
        data.item_id,
        data.amount,
        'GRANT',
        `idempotency:${idempotencyKey}${
          data.remark ? ` | ${data.remark}` : ""
        }`,
        playerItem.amount,
        now
      );

      const itemRecord = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM \`${itemRecordTableName}\` WHERE id = LAST_INSERT_ID()`
      );

      return {
        success: true,
        playerItem,
        itemRecord: itemRecord[0],
        message: "道具发放成功",
      };
    });
  }

  /**
   * 获取玩家某个道具的总数量
   */
  private async getPlayerItemTotalAmount(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string,
    tx?: any
  ): Promise<number> {
    const tables = await this.shardingService.getAllPlayerItemTables(appId);

    if (tables.length === 0) {
      return 0;
    }

    const queries = tables.map(
      (table) =>
        `SELECT COALESCE(SUM(amount), 0) as total FROM \`${table}\` WHERE merchant_id = '${merchantId}' AND app_id = '${appId}' AND player_id = '${playerId}' AND item_id = '${itemId}'`
    );

    const unionQuery = `SELECT SUM(total) as grand_total FROM (${queries.join(
      " UNION ALL "
    )}) as subquery`;
    const client = tx || this.prisma;

    try {
      const result = (await client.$queryRawUnsafe(unionQuery)) as {
        grand_total: bigint | null;
      }[];
      return Number(result[0]?.grand_total || 0);
    } catch (error) {
      console.warn("查询玩家道具总数量失败，返回0:", error);
      return 0;
    }
  }

  /**
   * 获取玩家在指定时间范围内获得某个道具的数量
   */
  private async getPlayerItemAmountInTimeRange(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string,
    startTime: number,
    endTime: number,
    tx?: any
  ): Promise<number> {
    const tables = await this.shardingService.getItemRecordTables(
      appId,
      startTime,
      endTime
    );

    if (tables.length === 0) {
      return 0;
    }

    // 获取实际存在的表
    const allExistingTables = await this.shardingService.getAllItemRecordTables(
      appId
    );
    const existingTables = tables.filter((table) =>
      allExistingTables.includes(table)
    );

    if (existingTables.length === 0) {
      return 0;
    }

    const queries = existingTables.map(
      (table) =>
        `SELECT COALESCE(SUM(amount), 0) as total FROM \`${table}\` WHERE merchant_id = '${merchantId}' AND app_id = '${appId}' AND player_id = '${playerId}' AND item_id = '${itemId}' AND created_at >= ${startTime} AND created_at <= ${endTime} AND amount > 0`
    );

    const unionQuery = `SELECT SUM(total) as grand_total FROM (${queries.join(
      " UNION ALL "
    )}) as subquery`;
    const client = tx || this.prisma;

    try {
      const result = (await client.$queryRawUnsafe(unionQuery)) as {
        grand_total: bigint | null;
      }[];
      return Number(result[0]?.grand_total || 0);
    } catch (error) {
      console.warn("查询时间范围内道具数量失败，返回0:", error);
      return 0;
    }
  }

  // ==================== 创建玩家道具 ====================

  async createPlayerItem(data: Omit<PlayerItem, "id">): Promise<PlayerItem> {
    const tableName = this.shardingService.getPlayerItemTable(
      data.app_id,
      data.obtain_time
    );

    const createSQL = `
      INSERT INTO \`${tableName}\` (
        merchant_id, app_id, player_id, item_id, amount, 
        expire_time, obtain_time, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = Math.floor(Date.now() / 1000);

    await this.prisma.$executeRawUnsafe(
      createSQL,
      data.merchant_id,
      data.app_id,
      data.player_id,
      data.item_id,
      data.amount,
      data.expire_time,
      data.obtain_time,
      data.status,
      now,
      now
    );

    // 获取插入的记录
    const result = await this.prisma.$queryRawUnsafe<PlayerItem[]>(
      `SELECT * FROM \`${tableName}\` WHERE id = LAST_INSERT_ID()`
    );

    return result[0];
  }

  // ==================== 查询玩家道具 ====================

  async getPlayerItems(
    merchantId: string,
    appId: string,
    playerId: string,
    startTime?: number,
    endTime?: number,
    itemId?: string
  ): Promise<PlayerItem[]> {
    const tables = await this.shardingService.getPlayerItemTables(
      appId,
      startTime,
      endTime
    );

    if (tables.length === 0) {
      return [];
    }

    const queries = tables.map((table) => {
      const whereConditions = [
        `merchant_id = '${merchantId}'`,
        `app_id = '${appId}'`,
        `player_id = '${playerId}'`,
      ];

      if (startTime) {
        whereConditions.push(`obtain_time >= ${startTime}`);
      }

      if (endTime) {
        whereConditions.push(`obtain_time <= ${endTime}`);
      }

      if (itemId) {
        whereConditions.push(`item_id = '${itemId}'`);
      }

      return `SELECT * FROM \`${table}\` WHERE ${whereConditions.join(
        " AND "
      )}`;
    });

    const unionQuery = queries.join(" UNION ALL ");
    const results = await this.prisma.$queryRawUnsafe<PlayerItem[]>(unionQuery);

    // 实时计算过期状态
    const now = Math.floor(Date.now() / 1000);
    const itemsWithStatus = results.map((item) => ({
      ...item,
      status: (item.expire_time && now > item.expire_time
        ? "UNUSABLE"
        : "USABLE") as "USABLE" | "UNUSABLE",
    }));

    // 如果没有道具，直接返回空数组
    if (itemsWithStatus.length === 0) {
      return [];
    }

    // 获取所有唯一的道具ID
    const uniqueItemIds = [
      ...new Set(itemsWithStatus.map((item) => item.item_id)),
    ];

    // 批量查询道具模板信息，包含状态信息和过期时间
    const itemTemplates = await this.prisma.itemTemplate.findMany({
      where: {
        id: { in: uniqueItemIds },
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

    // 创建道具ID到道具信息的映射
    const itemTemplateMap = new Map(
      itemTemplates.map((template) => [template.id, template])
    );

    // 检查模板过期并处理过期道具
    const expiredTemplateIds = new Set<string>();
    const expiredItems: PlayerItem[] = [];
    
    // 识别过期的模板
    itemTemplates.forEach(template => {
      if (template.expire_date) {
        // expire_date是毫秒时间戳，now是秒时间戳，需要转换
        const expireDateInSeconds = Number(template.expire_date) / 1000;
        if (now > expireDateInSeconds) {
          expiredTemplateIds.add(template.id);
        }
      }
    });
    
    // 收集需要处理的过期道具
    itemsWithStatus.forEach(item => {
      if (expiredTemplateIds.has(item.item_id) && item.amount > 0) {
        expiredItems.push(item);
      }
    });
    
    // 如果有过期道具需要处理，使用事务进行处理
    if (expiredItems.length > 0) {
      await this.handleExpiredItems(expiredItems, merchantId, appId, now);
      
      // 更新内存中的道具数据，反映数据库中的变更
      const expiredItemIds = new Set(expiredItems.map(item => item.id));
      itemsWithStatus.forEach(item => {
        if (expiredItemIds.has(item.id)) {
          item.amount = 0;
          item.status = 'UNUSABLE';
        }
      });
    }

    // 获取每个道具记录对应的最新幂等性键
    const itemsWithIdempotencyKeys = await Promise.all(
      itemsWithStatus.map(async (item) => {
        let latestIdempotencyKey: string | undefined;
        
        try {
          // 查询该道具记录对应的最新流水记录
          const recordTables = await this.shardingService.getAllItemRecordTables(appId);
          
          if (recordTables.length > 0) {
            // 构建查询最新流水记录的UNION语句
            const queries = recordTables.map(
              (table) =>
                `SELECT remark, created_at FROM \`${table}\` WHERE merchant_id = '${merchantId}' AND app_id = '${appId}' AND player_id = '${playerId}' AND item_id = '${item.item_id}' AND remark LIKE 'idempotency:%'`
            );
            
            const unionQuery = `(${queries.join(") UNION ALL (")}) ORDER BY created_at DESC LIMIT 1`;
            const latestRecords = await this.prisma.$queryRawUnsafe<{remark: string, created_at: number}[]>(unionQuery);
            
            if (latestRecords.length > 0) {
              const remark = latestRecords[0].remark;
              if (remark && remark.startsWith('idempotency:')) {
                const parts = remark.split(' | ');
                latestIdempotencyKey = parts[0].replace('idempotency:', '');
              }
            }
          }
        } catch (error) {
          console.warn("获取幂等性键失败:", error);
        }
        
        return {
          ...item,
          latest_idempotency_key: latestIdempotencyKey
        };
      })
    );

    // 为每个道具添加道具名称并重新计算综合状态
    return itemsWithIdempotencyKeys.map((item) => {
      const template = itemTemplateMap.get(item.item_id);
      const isExpired = item.expire_time && now > item.expire_time;
      const isTemplateInactive = template?.is_active !== "ACTIVE";
      const isTemplateDeleted =
        template?.status === "DELETED" || template?.status === "PENDING_DELETE";
      const isTemplateExpired = template?.expire_date && now > (Number(template.expire_date) / 1000);

      // 检查道具是否可用：模板状态为PENDING_DELETE或DELETED时不可用
      const isAvailable = template ? 
        (template.status !== 'PENDING_DELETE' && template.status !== 'DELETED') : 
        true;

      return {
        ...item,
        item_name: template?.item_name || "未知道具",
        is_available: isAvailable, // 添加可用性标识
        unavailable_reason: !isAvailable ? '道具模板已被删除，暂不可用' : null, // 不可用原因
        status:
          isExpired || isTemplateInactive || isTemplateDeleted || isTemplateExpired
            ? "UNUSABLE"
            : ("USABLE" as "USABLE" | "UNUSABLE"),
      };
    });
  }

  // ==================== 更新玩家道具 ====================

  async updatePlayerItem(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string,
    updates: Partial<Pick<PlayerItem, "amount" | "expire_time">>
  ): Promise<boolean> {
    const tableName = this.shardingService.getPlayerItemTable(appId);

    const setClauses = [];
    const values = [];

    if (updates.amount !== undefined) {
      setClauses.push("amount = ?");
      values.push(updates.amount);
    }

    if (updates.expire_time !== undefined) {
      setClauses.push("expire_time = ?");
      values.push(updates.expire_time);
    }

    if (setClauses.length === 0) {
      return false;
    }

    setClauses.push("updated_at = ?");
    values.push(Math.floor(Date.now() / 1000));

    const updateSQL = `
      UPDATE \`${tableName}\` 
      SET ${setClauses.join(", ")} 
      WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?
    `;

    values.push(merchantId, appId, playerId, itemId);

    const result = await this.prisma.$executeRawUnsafe(updateSQL, ...values);

    return (result as any).affectedRows > 0;
  }

  // ==================== 处理过期道具 ====================

  /**
   * 处理过期道具
   * @param expiredItems 过期的道具列表
   * @param merchantId 商户ID
   * @param appId 应用ID
   * @param currentTime 当前时间戳
   */
  private async handleExpiredItems(
    expiredItems: PlayerItem[],
    merchantId: string,
    appId: string,
    currentTime: number
  ): Promise<void> {
    // 使用事务确保数据一致性
    await this.prisma.$transaction(async (tx) => {
      for (const item of expiredItems) {
        // 确保分表存在
        await this.shardingService.ensureTablesExist(
          merchantId,
          appId,
          currentTime
        );

        const playerItemTableName = this.shardingService.getPlayerItemTable(
          appId,
          currentTime
        );
        const itemRecordTableName = this.shardingService.getItemRecordTable(
          appId,
          currentTime
        );

        // 创建过期流水记录
        await tx.$executeRawUnsafe(
          `INSERT INTO \`${itemRecordTableName}\` (merchant_id, app_id, player_id, item_id, amount, record_type, remark, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.merchant_id,
          item.app_id,
          item.player_id,
          item.item_id,
          -item.amount, // 负数表示扣除
          'EXPIRE',
          '模板过期自动扣除',
          0, // 过期后余额为0
          currentTime
        );

        // 将道具数量设为0
        await tx.$executeRawUnsafe(
          `UPDATE \`${playerItemTableName}\` SET amount = 0, status = 'UNUSABLE', updated_at = ? WHERE id = ?`,
          currentTime,
          item.id
        );
      }
    });
  }

  // ==================== 消费玩家道具 ====================

  /**
   * 消费玩家道具
   * @param data 消费道具数据
   * @param idempotencyKey 幂等性键，用于防止重复消费
   * @returns 消费结果
   */
  async consumePlayerItem(
    data: {
      merchant_id: string;
      app_id: string;
      player_id: string;
      item_id: string;
      player_item_id?: number; // 新增：指定要消费的道具记录ID
      amount: number;
      remark?: string;
    },
    idempotencyKey: string
  ): Promise<{
    success: boolean;
    playerItem?: PlayerItem;
    itemRecord?: any;
    message: string;
  }> {
    const now = Math.floor(Date.now() / 1000);

    // 确保分表存在
    await this.shardingService.ensureTablesExist(
      data.merchant_id,
      data.app_id,
      now
    );

    const playerItemTableName = this.shardingService.getPlayerItemTable(
      data.app_id,
      now
    );
    const itemRecordTableName = this.shardingService.getItemRecordTable(
      data.app_id,
      now
    );

    // 使用事务确保数据一致性
    return await this.prisma.$transaction(async (tx) => {
      // 1. 检查幂等性 - 查询是否已经有相同的流水记录
      const allRecordTables = await this.shardingService.getAllItemRecordTables(
        data.app_id
      );
      let existingRecord: any[] = [];

      // 如果没有任何表，则跳过幂等性检查
      if (allRecordTables.length > 0) {
        // 构建查询所有表的UNION语句
        const queries = allRecordTables.map(
          (table) =>
            `SELECT id FROM \`${table}\` WHERE merchant_id = '${data.merchant_id}' AND app_id = '${data.app_id}' AND player_id = '${data.player_id}' AND item_id = '${data.item_id}' AND remark = 'idempotency:${idempotencyKey}'`
        );

        const unionQuery = queries.join(" UNION ALL ") + " LIMIT 1";

        try {
          existingRecord = await tx.$queryRawUnsafe<any[]>(unionQuery);
        } catch (error) {
          // 如果查询失败（比如表不存在），继续执行，不影响正常流程
          console.warn("幂等性检查查询失败，继续执行:", error);
          existingRecord = [];
        }
      }

      if (existingRecord.length > 0) {
        return {
          success: true,
          message: "道具已消费，幂等性检查通过",
        };
      }

      // 2. 检查道具模板是否存在且有效
      const itemTemplate = await tx.itemTemplate.findFirst({
        where: {
          id: data.item_id,
          merchant_id: data.merchant_id,
          app_id: data.app_id,
          is_active: "ACTIVE",
        },
      });

      if (!itemTemplate) {
        return {
          success: false,
          message: "道具模板不存在或已失效",
        };
      }

      if (itemTemplate.status === "PENDING_DELETE") {
        return {
          success: false,
          message: "道具模板已被删除，暂不可用",
        };
      }

      if (itemTemplate.status !== "NORMAL") {
        return {
          success: false,
          message: "道具模板状态异常，无法消费",
        };
      }

      // 5. 根据player_item_id精确查询要消费的道具记录（使用行锁防止并发问题）
      let targetItem: PlayerItem;
      
      if (data.player_item_id) {
        // 如果指定了player_item_id，精确查询该记录
        const specificItems = await tx.$queryRawUnsafe<PlayerItem[]>(
          `SELECT * FROM \`${playerItemTableName}\` WHERE id = ? AND merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ? FOR UPDATE`,
          data.player_item_id,
          data.merchant_id,
          data.app_id,
          data.player_id,
          data.item_id
        );
        
        if (specificItems.length === 0) {
          return {
            success: false,
            message: "指定的道具记录不存在",
          };
        }
        
        targetItem = specificItems[0];
      } else {
        // 如果没有指定player_item_id，按照先进先出原则选择最早的可用道具
        const availableItems = await tx.$queryRawUnsafe<PlayerItem[]>(
          `SELECT * FROM \`${playerItemTableName}\` WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ? AND amount > 0 ORDER BY obtain_time ASC LIMIT 1 FOR UPDATE`,
          data.merchant_id,
          data.app_id,
          data.player_id,
          data.item_id
        );
        
        if (availableItems.length === 0) {
          return {
            success: false,
            message: "玩家没有该道具",
          };
        }
        
        targetItem = availableItems[0];
      }

      // 6. 检查道具是否可用（未过期）
      if (targetItem.expire_time && now > targetItem.expire_time) {
        return {
          success: false,
          message: "道具已过期，无法消费",
        };
      }

      // 7. 检查道具数量是否足够
      if (targetItem.amount < data.amount) {
        return {
          success: false,
          message: `道具数量不足，当前数量：${targetItem.amount}，需要消费：${data.amount}`,
        };
      }

      // 8. 更新道具数量
      const newAmount = targetItem.amount - data.amount;
      let playerItem: PlayerItem;

      if (newAmount === 0) {
        // 如果消费后数量为0，删除道具记录
        await tx.$executeRawUnsafe(
          `DELETE FROM \`${playerItemTableName}\` WHERE id = ?`,
          targetItem.id
        );
        
        playerItem = {
          ...targetItem,
          amount: 0,
        };
      } else {
        // 更新道具数量
        await tx.$executeRawUnsafe(
          `UPDATE \`${playerItemTableName}\` SET amount = ?, updated_at = ? WHERE id = ?`,
          newAmount,
          now,
          targetItem.id
        );

        playerItem = {
          ...targetItem,
          amount: newAmount,
        };
      }

      // 9. 创建消费流水记录
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${itemRecordTableName}\` (merchant_id, app_id, player_id, item_id, amount, record_type, remark, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.merchant_id,
        data.app_id,
        data.player_id,
        data.item_id,
        -data.amount, // 消费记录为负数
        'CONSUME',
        `idempotency:${idempotencyKey}${
          data.remark ? ` | ${data.remark}` : ""
        }`,
        newAmount,
        now
      );

      const itemRecord = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM \`${itemRecordTableName}\` WHERE id = LAST_INSERT_ID()`
      );

      return {
        success: true,
        playerItem,
        itemRecord: itemRecord[0],
        message: "道具消费成功",
      };
    });
  }

  // ==================== 删除玩家道具 ====================

  async deletePlayerItem(
    merchantId: string,
    appId: string,
    playerId: string,
    itemId: string
  ): Promise<boolean> {
    const tableName = this.shardingService.getPlayerItemTable(appId);

    const deleteSQL = `
      DELETE FROM \`${tableName}\` 
      WHERE merchant_id = ? AND app_id = ? AND player_id = ? AND item_id = ?
    `;

    const result = await this.prisma.$executeRawUnsafe(
      deleteSQL,
      merchantId,
      appId,
      playerId,
      itemId
    );

    return (result as any).affectedRows > 0;
  }
}
