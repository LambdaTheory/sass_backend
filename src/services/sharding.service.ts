import { PrismaClient } from "@prisma/client";

export class ShardingService {
  constructor(private prisma: PrismaClient) {}

  // ==================== 表名计算 ====================

  getPlayerItemTable(merchantId: string, timestamp?: number): string {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    const yearMonth = date.toISOString().slice(0, 7).replace("-", "");
    return `player_items_${merchantId}_${yearMonth}`;
  }

  getItemRecordTable(merchantId: string, timestamp?: number): string {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    const yearMonthDay = date.toISOString().slice(0, 10).replace(/-/g, "");
    return `item_records_${merchantId}_${yearMonthDay}`;
  }

  getItemLimitTable(merchantId: string, timestamp?: number): string {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    const yearMonthDay = date.toISOString().slice(0, 10).replace(/-/g, "");
    return `item_limits_${merchantId}_${yearMonthDay}`;
  }

  // ==================== 获取查询表名列表 ====================

  async getPlayerItemTables(
    merchantId: string,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> {
    const tables = new Set<string>();

    if (!startTime || !endTime) {
      tables.add(this.getPlayerItemTable(merchantId));
    } else {
      const start = new Date(startTime * 1000);
      const end = new Date(endTime * 1000);

      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        tables.add(this.getPlayerItemTable(merchantId, d.getTime() / 1000));
      }
    }

    return Array.from(tables);
  }

  async getItemRecordTables(
    merchantId: string,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> {
    const tables = new Set<string>();

    if (!startTime || !endTime) {
      tables.add(this.getItemRecordTable(merchantId));
    } else {
      const start = new Date(startTime * 1000);
      const end = new Date(endTime * 1000);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        tables.add(this.getItemRecordTable(merchantId, d.getTime() / 1000));
      }
    }

    return Array.from(tables);
  }

  // ==================== 创建分表 ====================

  async createPlayerItemTable(
    merchantId: string,
    yearMonth: string
  ): Promise<void> {
    const tableName = `player_items_${merchantId}_${yearMonth}`;

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
        status ENUM('normal', 'expired') NOT NULL DEFAULT 'normal',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_app_player (app_id, player_id),
        INDEX idx_item (item_id),
        INDEX idx_expire_time (expire_time),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "PLAYER_ITEMS",
        merchant_id: merchantId,
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
    yearMonthDay: string
  ): Promise<void> {
    const tableName = `item_records_${merchantId}_${yearMonthDay}`;

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        merchant_id VARCHAR(36) NOT NULL,
        app_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        item_id VARCHAR(30) NOT NULL,
        amount INT NOT NULL,
        remark VARCHAR(255) DEFAULT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_app_player (app_id, player_id),
        INDEX idx_item (item_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await this.prisma.$executeRawUnsafe(createTableSQL);

    // 记录元数据
    await this.prisma.shardingMetadata.create({
      data: {
        id: this.generateUUID(),
        table_type: "ITEM_RECORDS",
        merchant_id: merchantId,
        table_name: tableName,
        time_range: yearMonthDay,
        status: "ACTIVE",
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
  }

  // ==================== 自动建表任务 ====================

  async ensureTablesExist(merchantId: string): Promise<void> {
    const now = new Date();

    // 确保当前月的玩家道具表存在
    const currentMonth = now.toISOString().slice(0, 7).replace("-", "");
    await this.createPlayerItemTable(merchantId, currentMonth);

    // 确保明天的流水表存在
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10).replace(/-/g, "");
    await this.createItemRecordTable(merchantId, tomorrowStr);
  }

  // ==================== 工具方法 ====================

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
