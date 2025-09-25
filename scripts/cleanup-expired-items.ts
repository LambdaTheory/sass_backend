import { PrismaClient } from '@prisma/client';
import { PlayerItemService } from '../src/services/player-item.service';
import { ShardingService } from '../src/services/sharding.service';

/**
 * 清理过期道具
 * 检查所有玩家道具，将过期的道具状态更新为UNUSABLE
 */
export async function cleanupExpiredItems(prismaClient?: PrismaClient) {
  const prisma = prismaClient || new PrismaClient();
  
  try {
    console.log('开始清理过期道具...');
    
    const shardingService = new ShardingService(prisma);
    const playerItemService = new PlayerItemService(prisma, shardingService);
    
    // 获取当前时间戳（秒）
    const now = Math.floor(Date.now() / 1000);
    
    // 获取所有应用
    const apps = await prisma.app.findMany({
      select: { id: true, name: true }
    });
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    const errors: string[] = [];
    
    console.log(`找到 ${apps.length} 个应用`);
    
    // 遍历所有应用，获取其玩家道具表
    for (const app of apps) {
      try {
        console.log(`处理应用: ${app.name} (${app.id})`);
        
        // 获取该应用的所有玩家道具表
        const playerItemTables = await shardingService.getAllPlayerItemTables(app.id);
        
        console.log(`应用 ${app.name} 有 ${playerItemTables.length} 个玩家道具表`);
        
        // 遍历该应用的所有玩家道具表
        for (const tableName of playerItemTables) {
      try {
        console.log(`处理表: ${tableName}`);
        
        // 查询该表中所有过期但状态仍为USABLE的道具
        const expiredItems = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, merchant_id, app_id, player_id, item_id, amount, expire_time 
           FROM \`${tableName}\` 
           WHERE expire_time IS NOT NULL 
           AND expire_time <= ? 
           AND status = 'USABLE'`,
          now
        );
        
        console.log(`表 ${tableName} 中找到 ${expiredItems.length} 个过期道具`);
        
        if (expiredItems.length > 0) {
          // 批量更新过期道具状态
          const updateResult = await prisma.$executeRawUnsafe(
            `UPDATE \`${tableName}\` 
             SET status = 'UNUSABLE', updated_at = ? 
             WHERE expire_time IS NOT NULL 
             AND expire_time <= ? 
             AND status = 'USABLE'`,
            now,
            now
          );
          
          totalUpdated += updateResult;
          console.log(`表 ${tableName} 更新了 ${updateResult} 个道具状态`);
        }
        
          totalProcessed += expiredItems.length;
          
        } catch (error) {
          const errorMsg = `处理表 ${tableName} 时出错: ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
    } catch (error) {
      const errorMsg = `处理应用 ${app.name} 时出错: ${error}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }
    
    console.log('过期道具清理任务完成:');
    console.log(`处理总数: ${totalProcessed}`);
    console.log(`更新总数: ${totalUpdated}`);
    
    if (errors.length > 0) {
      console.log('错误详情:');
      errors.forEach(error => {
        console.log(`  ${error}`);
      });
    }
    
    return {
      processed: totalProcessed,
      updated: totalUpdated,
      errors
    };
    
  } catch (error) {
    console.error('过期道具清理任务执行失败:', error);
    throw error;
  }
}

/**
 * 错误处理
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 执行清理函数
if (require.main === module) {
  cleanupExpiredItems()
    .then((result) => {
      console.log('过期道具清理脚本执行完成');
      console.log('结果:', result);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

// 如果直接运行此脚本
if (require.main === module) {
  const prisma = new PrismaClient();
  cleanupExpiredItems(prisma)
    .finally(() => {
      prisma.$disconnect();
    });
}