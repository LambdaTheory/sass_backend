#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import { ShardingService } from '../services/sharding.service';
import { IndexMigrationService } from '../services/index-migration.service';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();
const shardingService = new ShardingService(prisma);
const indexMigrationService = new IndexMigrationService(prisma, shardingService);

/**
 * 索引迁移脚本
 * 用法:
 * npm run migrate-indexes              # 为所有分表添加索引
 * npm run migrate-indexes --app=<id>   # 为特定应用的分表添加索引
 */
async function main() {
  console.log('🚀 开始执行索引迁移...');
  console.log('⏰ 开始时间:', new Date().toISOString());
  
  try {
    const args = process.argv.slice(2);
    const appIdArg = args.find(arg => arg.startsWith('--app='));
    
    if (appIdArg) {
      // 为特定应用添加索引
      const appId = appIdArg.split('=')[1];
      if (!appId) {
        console.error('❌ 请提供有效的应用ID: --app=<app_id>');
        process.exit(1);
      }
      
      console.log(`📱 为应用 ${appId} 添加索引...`);
      await indexMigrationService.migrateAppTables(appId);
    } else {
      // 为所有分表添加索引
      console.log('🌍 为所有分表添加索引...');
      await indexMigrationService.migrateAllExistingTables();
    }
    
    console.log('✅ 索引迁移完成!');
    console.log('⏰ 结束时间:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ 索引迁移失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', promise, '原因:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在关闭...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在关闭...');
  await prisma.$disconnect();
  process.exit(0);
});

if (require.main === module) {
  main();
}

export { main };