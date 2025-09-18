import { PrismaClient } from '@prisma/client';
import { ShardingService } from './sharding.service';

/**
 * 索引迁移服务
 * 用于为现有分表添加统计查询优化索引
 */
export class IndexMigrationService {
  private prisma: PrismaClient;
  private shardingService: ShardingService;

  constructor(prisma: PrismaClient, shardingService: ShardingService) {
    this.prisma = prisma;
    this.shardingService = shardingService;
  }

  /**
   * 为单个玩家道具表添加统计索引
   */
  async addPlayerItemTableIndexes(tableName: string): Promise<void> {
    console.log(`为玩家道具表添加统计索引: ${tableName}`);
    
    const indexes = [
      {
        name: 'idx_stats_app_time',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_app_time\` (\`app_id\`, \`obtain_time\`, \`status\`)`
      },
      {
        name: 'idx_stats_item_time',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_item_time\` (\`item_id\`, \`obtain_time\`, \`status\`)`
      },
      {
        name: 'idx_stats_player_time',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_player_time\` (\`player_id\`, \`obtain_time\`)`
      }
    ];

    for (const index of indexes) {
      try {
        // 检查索引是否已存在
        const existingIndexes = await this.prisma.$queryRawUnsafe<any[]>(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${index.name}'`
        );
        
        if (existingIndexes.length === 0) {
          await this.prisma.$executeRawUnsafe(index.sql);
          console.log(`✓ 索引 ${index.name} 添加成功`);
        } else {
          console.log(`- 索引 ${index.name} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`✗ 添加索引 ${index.name} 失败:`, error);
      }
    }
  }

  /**
   * 为单个流水表添加统计索引
   */
  async addItemRecordTableIndexes(tableName: string): Promise<void> {
    console.log(`为流水表添加统计索引: ${tableName}`);
    
    const indexes = [
      {
        name: 'idx_stats_app_time_type',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_app_time_type\` (\`app_id\`, \`created_at\`, \`record_type\`)`
      },
      {
        name: 'idx_stats_item_time_type',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_item_time_type\` (\`item_id\`, \`created_at\`, \`record_type\`)`
      },
      {
        name: 'idx_stats_player_time_record',
        sql: `ALTER TABLE \`${tableName}\` ADD INDEX \`idx_stats_player_time_record\` (\`player_id\`, \`created_at\`)`
      }
    ];

    for (const index of indexes) {
      try {
        // 检查索引是否已存在
        const existingIndexes = await this.prisma.$queryRawUnsafe<any[]>(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${index.name}'`
        );
        
        if (existingIndexes.length === 0) {
          await this.prisma.$executeRawUnsafe(index.sql);
          console.log(`✓ 索引 ${index.name} 添加成功`);
        } else {
          console.log(`- 索引 ${index.name} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`✗ 添加索引 ${index.name} 失败:`, error);
      }
    }
  }

  /**
   * 为主表添加统计索引
   */
  async addMainTableIndexes(): Promise<void> {
    console.log('为主表添加统计索引');
    
    const indexes = [
      {
        table: 'apps',
        name: 'idx_merchant_status',
        sql: 'ALTER TABLE `apps` ADD INDEX `idx_merchant_status` (`merchant_id`, `status`)'
      },
      {
        table: 'item_templates',
        name: 'idx_app_status',
        sql: 'ALTER TABLE `item_templates` ADD INDEX `idx_app_status` (`app_id`, `is_active`, `status`)'
      },
      {
        table: 'sharding_metadata',
        name: 'idx_app_type_status',
        sql: 'ALTER TABLE `sharding_metadata` ADD INDEX `idx_app_type_status` (`app_id`, `table_type`, `status`)'
      },
      {
        table: 'sharding_metadata',
        name: 'idx_merchant_type_status',
        sql: 'ALTER TABLE `sharding_metadata` ADD INDEX `idx_merchant_type_status` (`merchant_id`, `table_type`, `status`)'
      }
    ];

    for (const index of indexes) {
      try {
        // 检查索引是否已存在
        const existingIndexes = await this.prisma.$queryRawUnsafe<any[]>(
          `SHOW INDEX FROM \`${index.table}\` WHERE Key_name = '${index.name}'`
        );
        
        if (existingIndexes.length === 0) {
          await this.prisma.$executeRawUnsafe(index.sql);
          console.log(`✓ 主表索引 ${index.name} 添加成功`);
        } else {
          console.log(`- 主表索引 ${index.name} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`✗ 添加主表索引 ${index.name} 失败:`, error);
      }
    }
  }

  /**
   * 为所有现有分表添加统计索引
   */
  async migrateAllExistingTables(): Promise<void> {
    console.log('开始为所有现有分表添加统计索引...');
    
    try {
      // 1. 先添加主表索引
      await this.addMainTableIndexes();
      
      // 2. 获取所有分表元数据
      const shardingMetadata = await this.prisma.shardingMetadata.findMany({
        where: {
          status: 'ACTIVE'
        }
      });
      
      console.log(`找到 ${shardingMetadata.length} 个活跃分表`);
      
      // 3. 为每个分表添加索引
      for (const metadata of shardingMetadata) {
        try {
          // 检查表是否真实存在
          const tableExists = await this.prisma.$queryRawUnsafe<any[]>(
            `SHOW TABLES LIKE '${metadata.table_name}'`
          );
          
          if (tableExists.length === 0) {
            console.log(`⚠️  表 ${metadata.table_name} 不存在，跳过`);
            continue;
          }
          
          if (metadata.table_type === 'PLAYER_ITEMS') {
            await this.addPlayerItemTableIndexes(metadata.table_name);
          } else if (metadata.table_type === 'ITEM_RECORDS') {
            await this.addItemRecordTableIndexes(metadata.table_name);
          }
        } catch (error) {
          console.error(`处理表 ${metadata.table_name} 时出错:`, error);
        }
      }
      
      console.log('✅ 所有分表索引迁移完成');
    } catch (error) {
      console.error('❌ 分表索引迁移失败:', error);
      throw error;
    }
  }

  /**
   * 为特定应用的分表添加统计索引
   */
  async migrateAppTables(appId: string): Promise<void> {
    console.log(`为应用 ${appId} 的分表添加统计索引...`);
    
    try {
      const shardingMetadata = await this.prisma.shardingMetadata.findMany({
        where: {
          app_id: appId,
          status: 'ACTIVE'
        }
      });
      
      console.log(`找到应用 ${appId} 的 ${shardingMetadata.length} 个活跃分表`);
      
      for (const metadata of shardingMetadata) {
        try {
          // 检查表是否真实存在
          const tableExists = await this.prisma.$queryRawUnsafe<any[]>(
            `SHOW TABLES LIKE '${metadata.table_name}'`
          );
          
          if (tableExists.length === 0) {
            console.log(`⚠️  表 ${metadata.table_name} 不存在，跳过`);
            continue;
          }
          
          if (metadata.table_type === 'PLAYER_ITEMS') {
            await this.addPlayerItemTableIndexes(metadata.table_name);
          } else if (metadata.table_type === 'ITEM_RECORDS') {
            await this.addItemRecordTableIndexes(metadata.table_name);
          }
        } catch (error) {
          console.error(`处理表 ${metadata.table_name} 时出错:`, error);
        }
      }
      
      console.log(`✅ 应用 ${appId} 的分表索引迁移完成`);
    } catch (error) {
      console.error(`❌ 应用 ${appId} 的分表索引迁移失败:`, error);
      throw error;
    }
  }
}