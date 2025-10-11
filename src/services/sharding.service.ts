import { PrismaClient } from "@prisma/client";

export class ShardingService {
  constructor(private prisma: PrismaClient) {}

  // ==================== 表名计算 ====================
  private normalizeToSeconds(timestamp?: number): number | undefined {
    if (timestamp === undefined || timestamp === null) return undefined;
    // 如果入参是毫秒(> 1e10)，转为秒
    return timestamp > 1e10 ? Math.floor(timestamp / 1000) : timestamp;
  }

  getPlayerItemTable(appId: string, timestamp?: number): string {
    const ts = this.normalizeToSeconds(timestamp);
    const date = ts ? new Date(ts * 1000) : new Date();
    const yearMonth = date.toISOString().slice(0, 7).replace("-", "");
    return `player_items_${appId}_${yearMonth}`;
  }

  getItemRecordTable(appId: string, timestamp?: number): string {
    const ts = this.normalizeToSeconds(timestamp);
    const date = ts ? new Date(ts * 1000) : new Date();
    const yearMonthDay = date.toISOString().slice(0, 10).replace(/-/g, "");
    return `item_records_${appId}_${yearMonthDay}`;
  }

  getItemLimitTable(appId: string, timestamp?: number): string {
    const ts = this.normalizeToSeconds(timestamp);
    const date = ts ? new Date(ts * 1000) : new Date();
    const yearMonthDay = date.toISOString().slice(0, 10).replace(/-/g, "");
    return `item_limits_${appId}_${yearMonthDay}`;
  }

  getItemTotalLimitTable(appId: string): string {
    return `item_total_limits_${appId}`;
  }

  // ==================== 获取查询表名列表 ====================

  async getPlayerItemTables(
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> {
    const tables = new Set<string>();

    if (!startTime || !endTime) {
      // 当没有时间范围时，查询所有存在的玩家道具表
      const allTables = await this.getAllPlayerItemTables(appId);
      allTables.forEach(table => tables.add(table));
    } else {
      const startSec = this.normalizeToSeconds(startTime)!;
      const endSec = this.normalizeToSeconds(endTime)!;
      const start = new Date(startSec * 1000);
      const end = new Date(endSec * 1000);

      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        tables.add(this.getPlayerItemTable(appId, Math.floor(d.getTime() / 1000)));
      }
    }

    // 过滤出实际存在的表
    const tableList = Array.from(tables);
    return await this.filterExistingTables(tableList);
  }

  async getItemRecordTables(
    appId: string,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> {
    const tables = new Set<string>();

    if (!startTime || !endTime) {
      tables.add(this.getItemRecordTable(appId));
    } else {
      const startSec = this.normalizeToSeconds(startTime)!;
      const endSec = this.normalizeToSeconds(endTime)!;
      const start = new Date(startSec * 1000);
      const end = new Date(endSec * 1000);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        tables.add(this.getItemRecordTable(appId, Math.floor(d.getTime() / 1000)));
      }
    }

    return Array.from(tables);
  }

  async getAllPlayerItemTables(appId: string): Promise<string[]> {
    const metadata = await this.prisma.shardingMetadata.findMany({
      where: {
        app_id: appId,
        table_type: "PLAYER_ITEMS",
        status: "ACTIVE",
      },
    });
    return metadata.map((m) => m.table_name);
  }

  async getAllItemRecordTables(appId: string): Promise<string[]> {
    const metadata = await this.prisma.shardingMetadata.findMany({
      where: {
        app_id: appId,
        table_type: "ITEM_RECORDS",
        status: "ACTIVE",
      },
    });
    return metadata.map((m) => m.table_name);
  }

  // ==================== 创建分表 ====================

  async createPlayerItemTable(
    merchantId: string,
    appId: string,
    yearMonth: string
  ): Promise<void> {
    const tableName = `player_items_${appId}_${yearMonth}`;
    console.log(`检查玩家道具表是否存在: ${tableName}`);
    
    // 检查元数据中是否存在
    const existing = await this.prisma.shardingMetadata.findFirst({ where: { table_name: tableName } });
    if (existing) {
      console.log(`玩家道具表元数据已存在: ${tableName}`);
      // 再检查表是否真的存在
      try {
        const result = await this.prisma.$queryRawUnsafe<any[]>(`SHOW TABLES LIKE '${tableName}'`);
        if (result && result.length > 0) {
          console.log(`玩家道具表确实存在: ${tableName}`);
          return;
        } else {
          console.log(`玩家道具表元数据存在但表不存在，重新创建: ${tableName}`);
          // 删除错误的元数据记录
          await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
        }
      } catch (error) {
        console.log(`玩家道具表元数据存在但表检查失败，重新创建: ${tableName}`);
        // 删除错误的元数据记录
        await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
      }
    }

    console.log(`开始创建玩家道具表: ${tableName}`);

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        merchant_id VARCHAR(36) NOT NULL,
        app_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        item_id VARCHAR(30) NOT NULL,
        amount INT NOT NULL DEFAULT 1,
        expire_time BIGINT DEFAULT NULL,
        obtain_time BIGINT NOT NULL,
        status ENUM('USABLE', 'UNUSABLE') NOT NULL DEFAULT 'USABLE',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_app_player (app_id, player_id),
        INDEX idx_item (item_id),
        INDEX idx_expire_time (expire_time),
        INDEX idx_status (status),
        INDEX idx_stats_app_time (app_id, obtain_time, status),
        INDEX idx_stats_item_time (item_id, obtain_time, status),
        INDEX idx_stats_player_time (player_id, obtain_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);
    console.log(`玩家道具表创建成功: ${tableName}`);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "PLAYER_ITEMS",
        merchant_id: merchantId,
        app_id: appId,
        table_name: tableName,
        time_range: yearMonth,
        status: "ACTIVE",
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  }

  async createItemRecordTable(
    merchantId: string,
    appId: string,
    yearMonthDay: string
  ): Promise<void> {
    const tableName = `item_records_${appId}_${yearMonthDay}`;
    console.log(`检查流水表是否存在: ${tableName}`);
    
    // 检查元数据中是否存在
    const existing = await this.prisma.shardingMetadata.findFirst({ where: { table_name: tableName } });
    if (existing) {
      console.log(`流水表元数据已存在: ${tableName}`);
      // 再检查表是否真的存在
      try {
        const result = await this.prisma.$queryRawUnsafe<any[]>(`SHOW TABLES LIKE '${tableName}'`);
        if (result && result.length > 0) {
          console.log(`流水表确实存在: ${tableName}`);
          return;
        } else {
          console.log(`流水表元数据存在但表不存在，重新创建: ${tableName}`);
          // 删除错误的元数据记录
          await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
        }
      } catch (error) {
        console.log(`流水表元数据存在但表检查失败，重新创建: ${tableName}`);
        // 删除错误的元数据记录
        await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
      }
    }

    console.log(`开始创建流水表: ${tableName}`);
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        merchant_id VARCHAR(36) NOT NULL,
        app_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        item_id VARCHAR(30) NOT NULL,
        amount INT NOT NULL,
        record_type ENUM('GRANT', 'CONSUME', 'EXPIRE') NOT NULL DEFAULT 'GRANT',
        remark VARCHAR(255) DEFAULT NULL,
        balance_after INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_app_player (app_id, player_id),
        INDEX idx_item (item_id),
        INDEX idx_record_type (record_type),
        INDEX idx_created_at (created_at),
        INDEX idx_stats_app_time_type (app_id, created_at, record_type),
        INDEX idx_stats_item_time_type (item_id, created_at, record_type),
        INDEX idx_stats_player_time_record (player_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);
    console.log(`流水表创建成功: ${tableName}`);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "ITEM_RECORDS",
        merchant_id: merchantId,
        app_id: appId,
        table_name: tableName,
        time_range: yearMonthDay,
        status: "ACTIVE",
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  }

  async createItemLimitTable(
    merchantId: string,
    appId: string,
    yearMonthDay: string
  ): Promise<void> {
    const tableName = `item_limits_${appId}_${yearMonthDay}`;
    console.log(`检查每日配额表是否存在: ${tableName}`);

    // 检查元数据中是否存在
    const existing = await this.prisma.shardingMetadata.findFirst({ where: { table_name: tableName } });
    if (existing) {
      console.log(`每日配额表元数据已存在: ${tableName}`);
      // 再检查表是否真的存在
      try {
        const result = await this.prisma.$queryRawUnsafe<any[]>(`SHOW TABLES LIKE '${tableName}'`);
        if (result && result.length > 0) {
          console.log(`每日配额表确实存在: ${tableName}`);
          return;
        } else {
          console.log(`每日配额表元数据存在但表不存在，重新创建: ${tableName}`);
          // 删除错误的元数据记录
          await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
        }
      } catch (error) {
        console.log(`每日配额表元数据存在但表检查失败，重新创建: ${tableName}`);
        // 删除错误的元数据记录
        await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
      }
    }

    console.log(`开始创建每日配额表: ${tableName}`);
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        merchant_id VARCHAR(36) NOT NULL,
        app_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        item_id VARCHAR(30) NOT NULL,
        date_key VARCHAR(8) NOT NULL,
        daily_limit INT NOT NULL,
        granted INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_quota (merchant_id, app_id, player_id, item_id, date_key),
        INDEX idx_app_player_date (app_id, player_id, date_key),
        INDEX idx_item_date (item_id, date_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);
    console.log(`每日配额表创建成功: ${tableName}`);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "ITEM_LIMITS",
        merchant_id: merchantId,
        app_id: appId,
        table_name: tableName,
        time_range: yearMonthDay,
        status: "ACTIVE",
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  }

  async createItemTotalLimitTable(
    merchantId: string,
    appId: string
  ): Promise<void> {
    const tableName = this.getItemTotalLimitTable(appId);
    console.log(`检查总发放量计数表是否存在: ${tableName}`);

    // 检查元数据中是否存在
    const existing = await this.prisma.shardingMetadata.findFirst({ where: { table_name: tableName } });
    if (existing) {
      console.log(`总发放量计数表元数据已存在: ${tableName}`);
      // 再检查表是否真的存在
      try {
        const result = await this.prisma.$queryRawUnsafe<any[]>(`SHOW TABLES LIKE '${tableName}'`);
        if (result && result.length > 0) {
          console.log(`总发放量计数表确实存在: ${tableName}`);
          return;
        } else {
          console.log(`总发放量计数表元数据存在但表不存在，重新创建: ${tableName}`);
          // 删除错误的元数据记录
          await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
        }
      } catch (error) {
        console.log(`总发放量计数表元数据存在但表检查失败，重新创建: ${tableName}`);
        // 删除错误的元数据记录
        await this.prisma.shardingMetadata.delete({ where: { id: existing.id } });
      }
    }

    console.log(`开始创建总发放量计数表: ${tableName}`);
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        merchant_id VARCHAR(36) NOT NULL,
        app_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        item_id VARCHAR(30) NOT NULL,
        total_limit INT NOT NULL,
        granted INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_total_quota (merchant_id, app_id, player_id, item_id),
        INDEX idx_app_player (app_id, player_id),
        INDEX idx_item (item_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);
    console.log(`总发放量计数表创建成功: ${tableName}`);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "ITEM_TOTAL_LIMITS",
        merchant_id: merchantId,
        app_id: appId,
        table_name: tableName,
        time_range: "permanent", // 总发放量表是永久的，不按时间分片
        status: "ACTIVE",
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  }

  // ==================== 自动建表任务 ====================

  async ensureTablesExist(merchantId: string, appId: string, timestamp?: number): Promise<void> {
    const now = timestamp || Math.floor(Date.now() / 1000);
    console.log(`开始确保表存在: merchantId=${merchantId}, appId=${appId}, timestamp=${timestamp}`);

    try {
      // 确保指定时间的玩家道具表存在
      const playerItemTable = this.getPlayerItemTable(appId, now);
      const targetMonth = playerItemTable.split('_').pop()!;
      console.log(`创建玩家道具表: ${playerItemTable}`);
      await this.createPlayerItemTable(merchantId, appId, targetMonth);

      // 确保指定时间的流水表存在
      const itemRecordTable = this.getItemRecordTable(appId, now);
      const targetDayStr = itemRecordTable.split('_').pop()!;
      console.log(`创建流水表: ${itemRecordTable}`);
      await this.createItemRecordTable(merchantId, appId, targetDayStr);

      // 确保指定时间的每日配额表存在
      const itemLimitTable = this.getItemLimitTable(appId, now);
      const targetLimitDayStr = itemLimitTable.split('_').pop()!;
      console.log(`创建每日配额表: ${itemLimitTable}`);
      await this.createItemLimitTable(merchantId, appId, targetLimitDayStr);

      // 确保总发放量计数表存在
      console.log(`创建总发放量计数表`);
      await this.createItemTotalLimitTable(merchantId, appId);

      // 如果没有传入时间戳，还需要确保明天的流水表存在
      if (!timestamp) {
        const tomorrow = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const tomorrowItemRecordTable = this.getItemRecordTable(appId, tomorrow);
        const tomorrowStr = tomorrowItemRecordTable.split('_').pop()!;
        console.log(`创建明天的流水表: ${tomorrowItemRecordTable}`);
        await this.createItemRecordTable(merchantId, appId, tomorrowStr);

        // 同时创建明天的每日配额表
        const tomorrowItemLimitTable = this.getItemLimitTable(appId, tomorrow);
        const tomorrowLimitStr = tomorrowItemLimitTable.split('_').pop()!;
        console.log(`创建明天的每日配额表: ${tomorrowItemLimitTable}`);
        await this.createItemLimitTable(merchantId, appId, tomorrowLimitStr);
      }
      
      console.log(`表创建完成: merchantId=${merchantId}, appId=${appId}`);
    } catch (error) {
      console.error(`创建表失败: merchantId=${merchantId}, appId=${appId}`, error);
      throw error;
    }
  }

  async autoCreateTableTask(): Promise<void> {
    console.log("开始执行自动建表任务");
    const apps = await this.prisma.app.findMany({
      where: { status: 1 },
    });

    for (const app of apps) {
      try {
        await this.ensureTablesExist(app.merchant_id, app.id);
        console.log(`为应用 ${app.name}(${app.id}) 创建分表成功`);
      } catch (error) {
        console.error(`为应用 ${app.name}(${app.id}) 创建分表失败`, error);
      }
    }
    console.log("自动建表任务执行结束");
  }

  // ==================== 工具方法 ====================

  /**
   * 检查表是否实际存在于数据库中
   */
  async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        tableName
      );
      return result.length > 0;
    } catch (error) {
      console.warn(`检查表 ${tableName} 是否存在时出错:`, error);
      return false;
    }
  }

  /**
   * 过滤出实际存在的表
   */
  async filterExistingTables(tableNames: string[]): Promise<string[]> {
    const existingTables: string[] = [];
    
    for (const tableName of tableNames) {
      const exists = await this.checkTableExists(tableName);
      if (exists) {
        existingTables.push(tableName);
      }
    }
    
    return existingTables;
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }
}
