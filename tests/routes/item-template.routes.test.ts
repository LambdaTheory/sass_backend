import { Request, Response } from 'express';
import { success, internalError, badRequest, notFound, forbidden, ApiResponse } from '../../src/utils/response';
import { randomUUID } from 'crypto';
import { ItemStatus, ItemLifecycle } from '@prisma/client';

// 模拟认证中间件验证后的用户信息
interface MockUser {
  id: string;
  username: string;
  user_type: string;
  role?: string;
  merchant_id?: string;
  status: number;
  permissions?: string[];
}

// 模拟商户数据
interface MockMerchant {
  id: string;
  name: string;
  status: number;
}

// 模拟应用数据
interface MockApp {
  id: string;
  merchant_id: string;
  name: string;
  status: number;
}

// 模拟道具模板数据
interface MockItemTemplate {
  id: string;
  merchant_id: string;
  app_id: string;
  item_type: string;
  item_name: string;
  item_icon?: string;
  eff_arg: string;
  is_active: ItemStatus;
  status: ItemLifecycle;
  expire_duration?: number;
  expire_date?: bigint;
  limit_max?: number;
  daily_limit_max?: number;
  total_limit?: number;
  custom?: string;
  created_at: bigint;
  updated_at: bigint;
}

// 模拟用户数据
const mockSuperAdmin: MockUser = {
  id: 'super-admin-1',
  username: 'superadmin',
  user_type: 'ADMIN',
  role: 'SUPER_ADMIN',
  status: 1,
  permissions: ['item_template_read', 'item_template_create', 'item_template_update']
};

const mockMerchantUser: MockUser = {
  id: 'merchant-user-1',
  username: 'merchantuser',
  user_type: 'MERCHANT',
  merchant_id: 'merchant-1',
  status: 1,
  permissions: ['item_template_read', 'item_template_create', 'item_template_update']
};

const mockUserWithoutPermission: MockUser = {
  id: 'user-no-perm-1',
  username: 'nopermuser',
  user_type: 'MERCHANT',
  merchant_id: 'merchant-1',
  status: 1,
  permissions: []
};

// 模拟数据库
const mockMerchants: MockMerchant[] = [
  { id: 'merchant-1', name: '测试商户1', status: 1 },
  { id: 'merchant-2', name: '测试商户2', status: 1 }
];

const mockApps: MockApp[] = [
  { id: 'app-1', merchant_id: 'merchant-1', name: '测试应用1', status: 1 },
  { id: 'app-2', merchant_id: 'merchant-1', name: '测试应用2', status: 1 },
  { id: 'app-3', merchant_id: 'merchant-2', name: '测试应用3', status: 1 }
];

const mockItemTemplates: MockItemTemplate[] = [
  {
    id: 'template-1',
    merchant_id: 'merchant-1',
    app_id: 'app-1',
    item_type: 'weapon',
    item_name: '神剑',
    item_icon: 'sword.png',
    eff_arg: '{"attack": 100}',
    is_active: ItemStatus.ACTIVE,
    status: ItemLifecycle.NORMAL,
    expire_duration: 86400,
    limit_max: 1,
    daily_limit_max: 1,
    total_limit: 100,
    created_at: BigInt(Date.now() - 86400000),
    updated_at: BigInt(Date.now() - 86400000)
  },
  {
    id: 'template-2',
    merchant_id: 'merchant-1',
    app_id: 'app-1',
    item_type: 'potion',
    item_name: '生命药水',
    eff_arg: '{"hp": 50}',
    is_active: ItemStatus.ACTIVE,
    status: ItemLifecycle.NORMAL,
    created_at: BigInt(Date.now() - 43200000),
    updated_at: BigInt(Date.now() - 43200000)
  },
  {
    id: 'template-3',
    merchant_id: 'merchant-1',
    app_id: 'app-2',
    item_type: 'armor',
    item_name: '护甲',
    eff_arg: '{"defense": 80}',
    is_active: ItemStatus.INACTIVE,
    status: ItemLifecycle.NORMAL,
    created_at: BigInt(Date.now() - 21600000),
    updated_at: BigInt(Date.now() - 21600000)
  },
  {
    id: 'template-4',
    merchant_id: 'merchant-2',
    app_id: 'app-3',
    item_type: 'weapon',
    item_name: '魔法杖',
    eff_arg: '{"magic": 120}',
    is_active: ItemStatus.ACTIVE,
    status: ItemLifecycle.NORMAL,
    created_at: BigInt(Date.now() - 10800000),
    updated_at: BigInt(Date.now() - 10800000)
  }
];

// 模拟获取道具模板列表的核心逻辑
function simulateGetItemTemplates(
  user: MockUser | null,
  queryParams: {
    merchant_id?: string;
    app_id?: string;
    page?: number;
    pageSize?: number;
    item_type?: string;
    item_name?: string;
    is_active?: ItemStatus;
    status?: ItemLifecycle;
  }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 参数验证 - merchant_id和app_id都是必填的
    if (!queryParams.merchant_id) {
      return badRequest('merchant_id参数是必填的');
    }
    if (!queryParams.app_id) {
      return badRequest('app_id参数是必填的');
    }

    // 权限检查
    if (user.role !== 'SUPER_ADMIN' && !user.permissions?.includes('item_template_read')) {
      return forbidden('权限不足');
    }

    // 确定查询的商户ID
    let merchantId: string;
    if (user.role === 'SUPER_ADMIN') {
      merchantId = queryParams.merchant_id;
    } else {
      if (!user.merchant_id) {
        return forbidden('用户未关联任何商户');
      }
      if (user.merchant_id !== queryParams.merchant_id) {
        return forbidden('无权访问指定商户的数据');
      }
      merchantId = user.merchant_id;
    }

    // 验证应用权限
    const app = mockApps.find(a => a.id === queryParams.app_id && a.merchant_id === merchantId);
    if (!app) {
      return notFound('应用不存在或无权访问');
    }

    // 筛选数据 - 现在app_id是必填的，直接按merchant_id和app_id筛选
    let filteredTemplates = mockItemTemplates.filter(t => 
      t.merchant_id === merchantId && t.app_id === queryParams.app_id
    );

    if (queryParams.item_type) {
      filteredTemplates = filteredTemplates.filter(t => t.item_type.includes(queryParams.item_type!));
    }

    if (queryParams.item_name) {
      filteredTemplates = filteredTemplates.filter(t => t.item_name.includes(queryParams.item_name!));
    }

    if (queryParams.is_active !== undefined) {
      filteredTemplates = filteredTemplates.filter(t => t.is_active === queryParams.is_active);
    }

    if (queryParams.status !== undefined) {
      filteredTemplates = filteredTemplates.filter(t => t.status === queryParams.status);
    }

    // 分页
    const page = queryParams.page || 1;
    const pageSize = queryParams.pageSize || 20;
    const total = filteredTemplates.length;
    const totalPages = Math.ceil(total / pageSize);
    const skip = (page - 1) * pageSize;
    const templates = filteredTemplates.slice(skip, skip + pageSize);

    // 添加关联数据
    const templatesWithRelations = templates.map(template => ({
      ...template,
      app: mockApps.find(a => a.id === template.app_id),
      merchant: mockMerchants.find(m => m.id === template.merchant_id)
    }));

    return success({
      templates: templatesWithRelations,
      total,
      page,
      pageSize,
      totalPages
    });
  } catch (error) {
    return internalError('获取道具模板列表失败');
  }
}

// 模拟获取单个道具模板的核心逻辑
function simulateGetItemTemplateById(
  user: MockUser | null,
  templateId: string,
  queryParams: { merchant_id?: string }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 权限检查
    if (user.role !== 'SUPER_ADMIN' && !user.permissions?.includes('item_template_read')) {
      return forbidden('权限不足');
    }

    // 确定查询的商户ID
    let merchantId: string;
    if (user.role === 'SUPER_ADMIN') {
      if (!queryParams.merchant_id) {
        return badRequest('超级管理员必须指定merchant_id参数');
      }
      merchantId = queryParams.merchant_id;
    } else {
      if (!user.merchant_id) {
        return forbidden('用户未关联任何商户');
      }
      merchantId = user.merchant_id;
    }

    // 查找模板
    const template = mockItemTemplates.find(t => t.id === templateId && t.merchant_id === merchantId);
    if (!template) {
      return notFound('道具模板不存在或无权访问');
    }

    // 添加关联数据
    const templateWithRelations = {
      ...template,
      app: mockApps.find(a => a.id === template.app_id),
      merchant: mockMerchants.find(m => m.id === template.merchant_id)
    };

    return success(templateWithRelations);
  } catch (error) {
    return internalError('获取道具模板详情失败');
  }
}

// 模拟获取道具模板统计信息的核心逻辑
function simulateGetItemTemplateStats(
  user: MockUser | null,
  queryParams: { merchant_id?: string; app_id?: string }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 参数验证 - merchant_id和app_id都是必填的
    if (!queryParams.merchant_id) {
      return badRequest('merchant_id参数是必填的');
    }
    if (!queryParams.app_id) {
      return badRequest('app_id参数是必填的');
    }

    // 权限检查
    if (user.role !== 'SUPER_ADMIN' && !user.permissions?.includes('item_template_read')) {
      return forbidden('权限不足');
    }

    // 确定查询的商户ID
    let merchantId: string;
    if (user.role === 'SUPER_ADMIN') {
      merchantId = queryParams.merchant_id;
    } else {
      if (!user.merchant_id) {
        return forbidden('用户未关联任何商户');
      }
      if (user.merchant_id !== queryParams.merchant_id) {
        return forbidden('无权访问指定商户的数据');
      }
      merchantId = user.merchant_id;
    }

    // 验证应用权限
    const app = mockApps.find(a => a.id === queryParams.app_id && a.merchant_id === merchantId);
    if (!app) {
      return notFound('应用不存在或无权访问');
    }

    // 筛选数据 - 现在app_id是必填的，直接按merchant_id和app_id筛选
    let filteredTemplates = mockItemTemplates.filter(t => 
      t.merchant_id === merchantId && t.app_id === queryParams.app_id
    );

    // 统计
    const total = filteredTemplates.length;
    const active = filteredTemplates.filter(t => t.is_active === ItemStatus.ACTIVE).length;
    const inactive = filteredTemplates.filter(t => t.is_active === ItemStatus.INACTIVE).length;
    const expired = filteredTemplates.filter(t => t.status === ItemLifecycle.EXPIRED).length;

    return success({
      total,
      active,
      inactive,
      expired
    });
  } catch (error) {
    return internalError('获取道具模板统计信息失败');
  }
}

// 模拟创建道具模板的核心逻辑
function simulateCreateItemTemplate(
  user: MockUser | null,
  requestBody: {
    merchant_id?: string;
    app_id?: string;
    item_name?: string;
    item_type?: string;
    item_icon?: string;
    eff_arg?: string;
    is_active?: ItemStatus;
    status?: ItemLifecycle;
    expire_duration?: number;
    expire_date?: number;
    limit_max?: number;
    daily_limit_max?: number;
    total_limit?: number;
    custom?: string;
  }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 权限检查
    if (!user.permissions?.includes('item_template_create')) {
      return forbidden('无权限创建道具模板');
    }

    const {
      merchant_id,
      app_id,
      item_name,
      item_type,
      item_icon,
      eff_arg,
      is_active,
      status,
      expire_duration,
      expire_date,
      limit_max,
      daily_limit_max,
      total_limit,
      custom
    } = requestBody;

    // 验证必填参数
    if (!merchant_id) {
      return badRequest('merchant_id 是必填参数');
    }

    if (!app_id) {
      return badRequest('app_id 是必填参数');
    }

    if (!item_name) {
      return badRequest('item_name 是必填参数');
    }

    if (!item_type) {
      return badRequest('item_type 是必填参数');
    }

    // 权限校验
    if (user.user_type === 'SUPER_ADMIN') {
      // 超级管理员可以为任何商户创建道具模板
    } else {
      // 商户用户只能为自己的商户创建道具模板
      if (!user.merchant_id) {
        return forbidden('用户未关联任何商户');
      }

      if (user.merchant_id !== merchant_id) {
        return forbidden('无权限为其他商户创建道具模板');
      }
    }

    // 验证应用是否存在且属于当前商户
    const app = mockApps.find(a => a.id === app_id && a.merchant_id === merchant_id);
    if (!app) {
      return notFound('应用不存在或无权访问');
    }

    // 验证过期时长
    if (expire_duration !== undefined) {
      if (typeof expire_duration !== 'number' || expire_duration < 0) {
        return badRequest('过期时长必须是大于等于0的数字，0表示没有限制');
      }
    }

    // 验证过期时间戳
    if (expire_date !== undefined) {
      if (typeof expire_date !== 'number') {
        return badRequest('过期时间戳格式无效');
      }
      
      // 创建时不允许设置过去的时间
      if (expire_date <= Date.now()) {
        return badRequest('过期时间戳必须是未来的时间');
      }
    }

    // 验证eff_arg是否为有效JSON字符串
    if (eff_arg && typeof eff_arg !== 'string') {
      return badRequest('eff_arg必须是JSON字符串');
    }

    // 生成新的道具模板
    const templateId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTemplate: MockItemTemplate = {
      id: templateId,
      merchant_id,
      app_id,
      item_name,
      item_type,
      item_icon: item_icon || undefined,
      eff_arg: eff_arg || '{}',
      is_active: is_active !== undefined ? is_active : ItemStatus.ACTIVE,
      status: status || ItemLifecycle.NORMAL,
      expire_duration: expire_duration || undefined,
      expire_date: expire_date ? BigInt(expire_date) : undefined,
      limit_max: limit_max || undefined,
      daily_limit_max: daily_limit_max || undefined,
      total_limit: total_limit || undefined,
      custom: custom || undefined,
      created_at: BigInt(Date.now()),
      updated_at: BigInt(Date.now())
    };

    // 添加到模拟数据中
    mockItemTemplates.push(newTemplate);

    return success(newTemplate);
  } catch (error) {
    return internalError('创建道具模板失败');
  }
}

describe('Item Template Routes - 道具模板管理功能验证', () => {
  describe('GET /item-templates - 获取道具模板列表', () => {
    test('超级管理员可以获取指定商户的道具模板列表', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1
      };

      const result = simulateGetItemTemplates(superAdmin, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(2); // app-1 有2个模板
      expect(result.data.total).toBe(2);
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    });

    test('商户用户只能获取自己商户的道具模板列表', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(2);
      expect(result.data.templates.every((t: any) => t.merchant_id === 'merchant-1' && t.app_id === 'app-1')).toBe(true);
    });

    test('必须提供merchant_id和app_id参数', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(2); // app-1 有2个模板
      expect(result.data.templates.every((t: any) => t.app_id === 'app-1')).toBe(true);
    });

    test('可以按道具类型筛选', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1', item_type: 'weapon' });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(1); // app-1 有1个weapon类型
      expect(result.data.templates[0].item_type).toBe('weapon');
    });

    test('可以按激活状态筛选', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1', is_active: ItemStatus.ACTIVE });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(2); // app-1 有2个激活的模板
      expect(result.data.templates.every((t: any) => t.is_active === ItemStatus.ACTIVE)).toBe(true);
    });

    test('支持分页查询', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1', page: 1, pageSize: 1 });
      
      expect(result.code).toBe(200);
      expect(result.data.templates).toHaveLength(1);
      expect(result.data.total).toBe(2);
      expect(result.data.totalPages).toBe(2);
    });

    test('缺少merchant_id参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1
      };

      const result = simulateGetItemTemplates(superAdmin, { app_id: 'app-1' });
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('merchant_id参数是必填的');
    });

    test('缺少app_id参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1
      };

      const result = simulateGetItemTemplates(superAdmin, { merchant_id: 'merchant-1' });
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('app_id参数是必填的');
    });

    test('无权限用户无法访问', () => {
      const unauthorizedUser: MockUser = {
        id: 'user-2',
        username: 'user2',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: [] // 没有权限
      };

      const result = simulateGetItemTemplates(unauthorizedUser, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('权限不足');
    });

    test('访问不存在的应用返回错误', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-1', app_id: 'non-existent-app' });
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('应用不存在或无权访问');
    });

    test('商户用户访问其他商户数据返回错误', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplates(merchantUser, { merchant_id: 'merchant-2', app_id: 'app-3' });
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('无权访问指定商户的数据');
    });
  });

  describe('GET /item-templates/:id - 获取单个道具模板详情', () => {
    test('超级管理员可以获取指定商户的道具模板详情', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1
      };

      const result = simulateGetItemTemplateById(superAdmin, 'template-1', { merchant_id: 'merchant-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.id).toBe('template-1');
      expect(result.data.item_name).toBe('神剑');
      expect(result.data.app).toBeDefined();
      expect(result.data.merchant).toBeDefined();
    });

    test('商户用户可以获取自己商户的道具模板详情', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateById(merchantUser, 'template-1', {});
      
      expect(result.code).toBe(200);
      expect(result.data.id).toBe('template-1');
      expect(result.data.merchant_id).toBe('merchant-1');
    });

    test('商户用户无法访问其他商户的道具模板', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateById(merchantUser, 'template-4', {}); // template-4 属于 merchant-2
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('道具模板不存在或无权访问');
    });

    test('访问不存在的模板返回404', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateById(merchantUser, 'non-existent-template', {});
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('道具模板不存在或无权访问');
    });
  });

  describe('GET /item-templates/stats - 获取道具模板统计信息', () => {
    test('超级管理员可以获取指定商户的统计信息', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1
      };

      const result = simulateGetItemTemplateStats(superAdmin, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.total).toBe(2);
      expect(result.data.active).toBe(2);
      expect(result.data.inactive).toBe(0);
      expect(result.data.expired).toBe(0);
    });

    test('商户用户可以获取自己商户的统计信息', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateStats(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.total).toBe(2);
      expect(result.data.active).toBe(2);
      expect(result.data.inactive).toBe(0);
    });

    test('必须提供merchant_id和app_id参数获取统计信息', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateStats(merchantUser, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(200);
      expect(result.data.total).toBe(2); // app-1 有2个模板
      expect(result.data.active).toBe(2);
      expect(result.data.inactive).toBe(0);
    });

    test('访问不存在的应用返回错误', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read']
      };

      const result = simulateGetItemTemplateStats(merchantUser, { merchant_id: 'merchant-1', app_id: 'non-existent-app' });
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('应用不存在或无权访问');
    });
  });

  describe('权限和认证测试', () => {
    test('未登录用户无法访问任何接口', () => {
      const listResult = simulateGetItemTemplates(null, { merchant_id: 'merchant-1', app_id: 'app-1' });
      const detailResult = simulateGetItemTemplateById(null, 'template-1', { merchant_id: 'merchant-1' });
      const statsResult = simulateGetItemTemplateStats(null, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(listResult.code).toBe(401);
      expect(detailResult.code).toBe(401);
      expect(statsResult.code).toBe(401);
    });

    test('无关联商户的用户无法访问', () => {
      const userWithoutMerchant: MockUser = {
        id: 'user-3',
        username: 'user3',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        status: 1,
        permissions: ['item_template_read']
        // 没有 merchant_id
      };

      const result = simulateGetItemTemplates(userWithoutMerchant, { merchant_id: 'merchant-1', app_id: 'app-1' });
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('用户未关联任何商户');
    });
  });

  describe('POST /item-templates - 创建道具模板', () => {
    test('超级管理员可以为指定商户创建道具模板', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        item_icon: 'new-item.png',
        eff_arg: JSON.stringify({ attack: 150, description: '这是一个新道具', rarity: 'RARE' }),
        is_active: ItemStatus.ACTIVE
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.data.merchant_id).toBe('merchant-1');
      expect(result.data.app_id).toBe('app-1');
      expect(result.data.item_name).toBe('新道具');
      expect(result.data.item_type).toBe('weapon');
      expect(result.data.is_active).toBe(ItemStatus.ACTIVE);
    });

    test('商户用户可以为自己商户创建道具模板', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '商户道具',
        item_type: 'potion',
        eff_arg: JSON.stringify({ description: '商户创建的道具' }),
        is_active: ItemStatus.INACTIVE
      };

      const result = simulateCreateItemTemplate(merchantUser, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.data.merchant_id).toBe('merchant-1');
      expect(result.data.item_name).toBe('商户道具');
      expect(result.data.is_active).toBe(ItemStatus.INACTIVE);
    });

    test('缺少merchant_id参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('merchant_id 是必填参数');
    });

    test('缺少app_id参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        item_name: '新道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('app_id 是必填参数');
    });

    test('缺少item_name参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('item_name 是必填参数');
    });

    test('缺少item_type参数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具'
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('item_type 是必填参数');
    });

    test('商户用户无法为其他商户创建道具模板', () => {
      const merchantUser: MockUser = {
        id: 'user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-2',
        app_id: 'app-3',
        item_name: '非法道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(merchantUser, requestBody);
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('无权限为其他商户创建道具模板');
    });

    test('访问不存在的应用返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'non-existent-app',
        item_name: '新道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('应用不存在或无权访问');
    });

    test('无权限用户无法创建道具模板', () => {
      const noPermissionUser: MockUser = {
        id: 'user-3',
        username: 'user3',
        user_type: 'MERCHANT_OWNER',
        role: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1,
        permissions: ['item_template_read'] // 只有读权限
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(noPermissionUser, requestBody);
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('无权限创建道具模板');
    });

    test('过期时长为负数时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_duration: -100
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('过期时长必须是大于等于0的数字，0表示没有限制');
    });

    test('过期时长为0时创建成功（表示没有限制）', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_duration: 0
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('操作成功');
    });

    test('过期时间戳为过去时间时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_date: Date.now() - 86400000 // 昨天的时间戳
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('过期时间戳必须是未来的时间');
    });

    test('过期时间戳为当前时间时返回错误', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_date: Date.now() // 当前时间戳
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('过期时间戳必须是未来的时间');
    });

    test('过期时间戳为未来时间时创建成功', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_date: Date.now() + 86400000 // 明天的时间戳
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('操作成功');
    });

    test('过期时长为正数时创建成功', () => {
      const superAdmin: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
        status: 1,
        permissions: ['item_template_create']
      };

      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon',
        expire_duration: 3600 // 1小时
      };

      const result = simulateCreateItemTemplate(superAdmin, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('操作成功');
    });

    test('未登录用户无法创建道具模板', () => {
      const requestBody = {
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        item_name: '新道具',
        item_type: 'weapon'
      };

      const result = simulateCreateItemTemplate(null, requestBody);
      
      expect(result.code).toBe(401);
      expect(result.message).toBe('未认证');
    });
  });

  // 模拟更新道具模板的核心逻辑
  function simulateUpdateItemTemplate(
    user: MockUser | null,
    templateId: string,
    updateData: any,
    queryParams: { merchant_id?: string } = {}
  ): ApiResponse<any> {
    try {
      // 用户认证检查
      if (!user) {
        return { code: 401, message: '未认证', data: null };
      }

      // 参数验证
      if (!templateId) {
        return badRequest('道具模板ID不能为空');
      }

      // 权限检查
      if (user.role !== 'SUPER_ADMIN' && !user.permissions?.includes('item_template_update')) {
        return forbidden('权限不足');
      }

      // 确定查询的商户ID
      let merchantId: string;
      if (user.role === 'SUPER_ADMIN') {
        if (!queryParams.merchant_id) {
          return badRequest('超级管理员必须指定merchant_id参数');
        }
        merchantId = queryParams.merchant_id;
      } else {
        if (!user.merchant_id) {
          return forbidden('用户未关联任何商户');
        }
        merchantId = user.merchant_id;
      }

      // 查找模板
      const templateIndex = mockItemTemplates.findIndex(t => 
        t.id === templateId && t.merchant_id === merchantId
      );

      if (templateIndex === -1) {
        return notFound('道具模板不存在或无权访问');
      }

      // 验证更新数据
      if (updateData.eff_arg !== undefined && updateData.eff_arg !== null && typeof updateData.eff_arg !== 'string') {
        return badRequest('eff_arg必须是JSON字符串');
      }

      if (updateData.expire_duration !== undefined && updateData.expire_duration !== null) {
        if (typeof updateData.expire_duration !== 'number' || updateData.expire_duration < 0) {
          return badRequest('过期时长必须是大于等于0的数字');
        }
      }

      // 验证过期时间戳并处理过期逻辑
      let shouldSetExpired = false;
      if (updateData.expire_date !== undefined && updateData.expire_date !== null) {
        const currentTimestamp = Date.now();
        const expireTimestamp = typeof updateData.expire_date === 'string' ? parseInt(updateData.expire_date) : updateData.expire_date;
        
        if (isNaN(expireTimestamp)) {
          return badRequest('过期时间戳格式无效');
        }
        
        // 如果设置的过期时间是过去的时间，自动将状态设为expired
        if (expireTimestamp <= currentTimestamp) {
          shouldSetExpired = true;
        }
      }

      // 检查是否有更新数据
      const updateKeys = Object.keys(updateData);
      if (updateKeys.length === 0) {
        return badRequest('至少需要提供一个要更新的字段');
      }

      // 更新模板
      const template = mockItemTemplates[templateIndex];
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          if (key === 'expire_date' && updateData[key]) {
            (template as any)[key] = BigInt(updateData[key]);
          } else {
            (template as any)[key] = updateData[key];
          }
        }
      });
      
      // 处理状态：如果设置了过去的过期时间，自动设为expired
      if (shouldSetExpired) {
        template.status = ItemLifecycle.EXPIRED;
      }
      
      template.updated_at = BigInt(Date.now());

      // 转换BigInt字段为数字
      const responseData = {
        ...template,
        created_at: Number(template.created_at),
        updated_at: Number(template.updated_at),
        expire_date: template.expire_date ? Number(template.expire_date) : null
      };

      return success(responseData, '道具模板更新成功');
    } catch (error) {
      return internalError('更新道具模板失败');
    }
  }

  describe('PUT /item-templates/:id - 更新道具模板', () => {
    test('超级管理员可以更新指定商户的道具模板', () => {
      const updateData = {
        item_name: '更新后的剑',
        item_type: 'weapon_updated'
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('道具模板更新成功');
      expect(result.data.item_name).toBe('更新后的剑');
      expect(result.data.item_type).toBe('weapon_updated');
    });

    test('商户用户可以更新自己商户的道具模板', () => {
      const updateData = {
        item_name: '更新后的盾牌',
        is_active: ItemStatus.INACTIVE
      };

      const result = simulateUpdateItemTemplate(
        mockMerchantUser,
        'template-2',
        updateData
      );
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('道具模板更新成功');
      expect(result.data.item_name).toBe('更新后的盾牌');
      expect(result.data.is_active).toBe(ItemStatus.INACTIVE);
    });

    test('超级管理员未指定merchant_id时返回错误', () => {
      const updateData = {
        item_name: '更新后的剑'
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData
      );
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('超级管理员必须指定merchant_id参数');
    });

    test('商户用户无法更新其他商户的道具模板', () => {
      const updateData = {
        item_name: '更新后的魔法杖'
      };

      const result = simulateUpdateItemTemplate(
        mockMerchantUser,
        'template-4', // 属于merchant-2的模板
        updateData
      );
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('道具模板不存在或无权访问');
    });

    test('更新不存在的道具模板返回错误', () => {
      const updateData = {
        item_name: '更新后的道具'
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'non-existent-template',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('道具模板不存在或无权访问');
    });

    test('无权限用户无法更新道具模板', () => {
      const updateData = {
        item_name: '更新后的道具'
      };

      const result = simulateUpdateItemTemplate(
        mockUserWithoutPermission,
        'template-1',
        updateData
      );
      
      expect(result.code).toBe(403);
      expect(result.message).toBe('权限不足');
    });

    test('未提供任何更新字段时返回错误', () => {
      const updateData = {};

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('至少需要提供一个要更新的字段');
    });

    test('eff_arg不是字符串时返回错误', () => {
      const updateData = {
        eff_arg: { attack: 100 } // 应该是字符串
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('eff_arg必须是JSON字符串');
    });

    test('过期时长为负数时返回错误', () => {
      const updateData = {
        expire_duration: -100
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('过期时长必须是大于等于0的数字');
    });

    test('过期时间戳为过去时间时自动设为过期状态', () => {
      const pastTimestamp = Date.now() - 86400000; // 昨天
      const updateData = {
        expire_date: pastTimestamp
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(200);
      expect(result.data.status).toBe('EXPIRED');
    });

    test('过期时间戳为未来时间时更新成功', () => {
      const futureTimestamp = Date.now() + 86400000; // 明天
      const updateData = {
        expire_date: futureTimestamp
      };

      const result = simulateUpdateItemTemplate(
        mockSuperAdmin,
        'template-1',
        updateData,
        { merchant_id: 'merchant-1' }
      );
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('道具模板更新成功');
      expect(result.data.expire_date).toBe(futureTimestamp);
    });

    test('未登录用户无法更新道具模板', () => {
       const updateData = {
         item_name: '更新后的道具'
       };

       const result = simulateUpdateItemTemplate(
         null,
         'template-1',
         updateData
       );
       
       expect(result.code).toBe(401);
       expect(result.message).toBe('未认证');
     });
   });
});