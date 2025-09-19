import { PrismaClient } from '@prisma/client';
import { ItemTemplateService } from '../src/services/item-template.service';

const prisma = new PrismaClient();

/**
 * 清理待删除的道具模板
 * 清理超过7天的PENDING_DELETE状态道具模板
 */
async function cleanupDeletedTemplates() {
  try {
    console.log('开始清理待删除的道具模板...');
    
    const itemTemplateService = new ItemTemplateService(prisma);
    const result = await itemTemplateService.cleanupPendingDeleteTemplates(7);
    
    console.log('清理任务完成:');
    console.log(`处理总数: ${result.processed}`);
    console.log(`成功删除: ${result.success}`);
    console.log(`失败数量: ${result.failed}`);
    
    if (result.errors.length > 0) {
      console.log('错误详情:');
      result.errors.forEach(error => {
        console.log(`  ${error}`);
      });
    }
    
  } catch (error) {
    console.error('清理任务执行失败:', error);
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
  cleanupDeletedTemplates()
    .then(() => {
      console.log('清理脚本执行完成');
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { cleanupDeletedTemplates };