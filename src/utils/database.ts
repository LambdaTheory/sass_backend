import { PrismaClient } from '@prisma/client';

/**
 * 数据库连接管理工具类
 * 使用单例模式确保整个应用只有一个PrismaClient实例
 */
class DatabaseManager {
  private static instance: PrismaClient | null = null;

  /**
   * 获取PrismaClient实例
   * @returns PrismaClient实例
   */
  public static getInstance(): PrismaClient {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        errorFormat: 'pretty',
      });
    }

    return DatabaseManager.instance;
  }

  /**
   * 断开数据库连接
   */
  public static async disconnect(): Promise<void> {
    if (DatabaseManager.instance) {
      await DatabaseManager.instance.$disconnect();
      DatabaseManager.instance = null;
      console.log('数据库连接已断开');
    }
  }

  /**
   * 检查数据库连接状态
   */
  public static async checkConnection(): Promise<boolean> {
    try {
      const prisma = DatabaseManager.getInstance();
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('数据库连接检查失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const prisma = DatabaseManager.getInstance();
export { DatabaseManager };