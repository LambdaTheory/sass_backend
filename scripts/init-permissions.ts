import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// 默认权限配置
const defaultPermissions = [
  // 商户管理权限
  {
    name: 'merchant_create',
    description: '创建商户',
    resource: 'merchant',
    action: 'create'
  },
  {
    name: 'merchant_edit',
    description: '编辑商户信息',
    resource: 'merchant',
    action: 'update'
  },
  {
    name: 'merchant_ban',
    description: '禁用商户',
    resource: 'merchant',
    action: 'ban'
  },
  {
    name: 'merchant_unban',
    description: '解禁商户',
    resource: 'merchant',
    action: 'unban'
  },
  
  // 应用管理权限
  {
    name: 'application_create',
    description: '创建应用',
    resource: 'application',
    action: 'create'
  },
  {
    name: 'application_ban',
    description: '禁用应用',
    resource: 'application',
    action: 'ban'
  },
  {
    name: 'application_unban',
    description: '解禁应用',
    resource: 'application',
    action: 'unban'
  },
  
  // 道具管理权限
  {
    name: 'item_create',
    description: '创建道具',
    resource: 'item',
    action: 'create'
  },
  {
    name: 'item_modify',
    description: '修改道具',
    resource: 'item',
    action: 'update'
  },
  {
    name: 'item_ban',
    description: '禁用道具',
    resource: 'item',
    action: 'ban'
  },
  {
    name: 'item_unban',
    description: '解禁道具',
    resource: 'item',
    action: 'unban'
  }
];

// 角色权限映射
const rolePermissions = {
  SUPER_ADMIN: [
    'merchant_create', 'merchant_edit', 'merchant_ban', 'merchant_unban',
    'application_create', 'application_ban', 'application_unban',
    'item_create', 'item_modify', 'item_ban', 'item_unban'
  ],
  MERCHANT_OWNER: [
    'application_create', 'application_ban', 'application_unban',
    'item_create', 'item_modify', 'item_ban', 'item_unban'
  ]
};

async function initPermissions() {
  try {
    console.log('🚀 开始初始化权限数据...');
    
    const now = BigInt(Date.now());
    
    // 0. 权限系统已重构为用户直接关联权限
    console.log('ℹ️  当前权限系统使用用户直接关联权限的方式');
    
    // 1. 创建权限
    console.log('📝 创建权限记录...');
    for (const permission of defaultPermissions) {
      const existingPermission = await prisma.permission.findUnique({
        where: { name: permission.name }
      });
      
      if (!existingPermission) {
        await prisma.permission.create({
          data: {
            id: randomUUID(),
            name: permission.name,
            description: permission.description,
            resource: permission.resource,
            action: permission.action,
            created_at: now,
            updated_at: now
          }
        });
        console.log(`✅ 创建权限: ${permission.name}`);
      } else {
        console.log(`⚠️  权限已存在: ${permission.name}`);
      }
    }
    
    // 2. 注意：角色权限关联现在通过用户权限表管理
    // 此脚本仅创建权限，具体的用户权限分配在 init-admin.ts 中处理
    console.log('ℹ️  权限创建完成，用户权限分配将在创建用户时处理');
    
    console.log('🎉 权限初始化完成!');
    
    // 3. 显示统计信息
    const permissionCount = await prisma.permission.count();
    const userPermissionCount = await prisma.userPermission.count();
    
    console.log('📊 统计信息:');
    console.log(`   权限总数: ${permissionCount}`);
    console.log(`   用户权限关联总数: ${userPermissionCount}`);
    
  } catch (error) {
    console.error('❌ 权限初始化失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initPermissions()
    .then(() => {
      console.log('✨ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 脚本执行失败:', error);
      process.exit(1);
    });
}

export { initPermissions };