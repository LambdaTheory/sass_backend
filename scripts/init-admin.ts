import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * 初始化超级管理员账号
 * 账号: admin
 * 密码: $2a$12$Ft2z40RdOypriMhKTD9x9.L6wQX4S2tNUNT129.jV/Y94Qk99McE. (已加密)
 * 角色: 超级管理员
 * 权限: 全部权限
 */
async function initAdmin() {
  try {
    console.log('开始初始化超级管理员账号...');

    // 检查是否已存在admin用户
    const existingUser = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (existingUser) {
      console.log('超级管理员账号已存在，跳过初始化');
      return;
    }

    // 生成UUID
    const userId = randomUUID();
    const superAdminId = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);

    // 创建SuperAdmin记录
    await prisma.superAdmin.create({
      data: {
        id: superAdminId,
        created_at: BigInt(timestamp),
        updated_at: BigInt(timestamp)
      }
    });

    // 生成密码哈希
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    // 创建User记录
    await prisma.user.create({
      data: {
        id: userId,
        username: 'admin',
        password: hashedPassword,
        user_type: 'SUPER_ADMIN',
        super_admin_id: superAdminId,
        status: 1,
        created_at: BigInt(timestamp),
        updated_at: BigInt(timestamp)
      }
    });

    // 获取所有权限
    const allPermissions = await prisma.permission.findMany();
    
    if (allPermissions.length === 0) {
      console.log('警告: 系统中没有权限数据，请先运行 npm run init:permissions');
    } else {
      // 为超级管理员分配所有权限
      const userPermissions = allPermissions.map(permission => ({
        id: randomUUID(),
        user_id: userId,
        permission_id: permission.id,
        created_at: BigInt(timestamp)
      }));

      await prisma.userPermission.createMany({
        data: userPermissions
      });

      console.log(`✅ 超级管理员账号创建成功！`);
      console.log(`   用户名: admin`);
      console.log(`   用户ID: ${userId}`);
      console.log(`   超管ID: ${superAdminId}`);
      console.log(`   分配权限数量: ${allPermissions.length}`);
    }

  } catch (error) {
    console.error('❌ 初始化超级管理员账号失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行初始化
initAdmin()
  .then(() => {
    console.log('🎉 超级管理员初始化完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 初始化过程中发生错误:', error);
    process.exit(1);
  });