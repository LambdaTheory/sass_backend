import { Request, Response } from 'express';
import { success, internalError, badRequest, notFound, forbidden, ApiResponse } from '../../src/utils/response';

// Mock the services
jest.mock('../../src/services/player-item.service');
jest.mock('../../src/services/sharding.service');

const { PlayerItemService } = require('../../src/services/player-item.service');
const { ShardingService } = require('../../src/services/sharding.service');

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

// 模拟玩家道具数据
interface MockPlayerItem {
  id: number;
  merchant_id: string;
  app_id: string;
  player_id: string;
  item_id: string;
  amount: number;
  obtain_time: number;
  status: 'normal' | 'expired';
}

// 模拟用户数据
const mockSuperAdmin: MockUser = {
  id: 'super-admin-1',
  username: 'superadmin',
  user_type: 'ADMIN',
  role: 'SUPER_ADMIN',
  status: 1,
  permissions: ['player_item_read', 'player_item_create', 'player_item_update', 'item_grant']
};

const mockMerchantUser: MockUser = {
  id: 'merchant-user-1',
  username: 'merchantuser',
  user_type: 'MERCHANT',
  merchant_id: 'merchant-1',
  status: 1,
  permissions: ['player_item_read', 'item_grant']
};

const mockUserWithoutPermission: MockUser = {
  id: 'user-no-perm-1',
  username: 'nopermuser',
  user_type: 'MERCHANT',
  merchant_id: 'merchant-1',
  status: 1,
  permissions: []
};

// 模拟玩家道具数据
const mockPlayerItems: MockPlayerItem[] = [
  {
    id: 1,
    merchant_id: 'merchant-1',
    app_id: 'app-1',
    player_id: 'player-1',
    item_id: 'item-001',
    amount: 10,
    obtain_time: 1640995200,
    status: 'normal'
  },
  {
    id: 2,
    merchant_id: 'merchant-1',
    app_id: 'app-1',
    player_id: 'player-1',
    item_id: 'item-002',
    amount: 5,
    obtain_time: 1640995200,
    status: 'normal'
  }
];

// 模拟权限检查函数
function hasPermission(user: MockUser, resource: string, action: string): boolean {
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  const requiredPermission = `${resource}_${action}`;
  return user.permissions?.includes(requiredPermission) || false;
}

// 模拟商户访问权限检查
function hasMerchantAccess(user: MockUser, merchantId: string): boolean {
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  return user.merchant_id === merchantId;
}

// 模拟获取玩家道具列表的业务逻辑
function simulateGetPlayerItems(
  user: MockUser | null,
  params: {
    merchant_id?: string;
    app_id?: string;
    player_id?: string;
    start_time?: string;
    end_time?: string;
    page?: string;
    pageSize?: string;
  }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return badRequest('用户信息缺失');
    }

    // 参数验证
    if (!params.merchant_id) {
      return badRequest('merchant_id 参数必填且必须为字符串');
    }
    if (!params.app_id) {
      return badRequest('app_id 参数必填且必须为字符串');
    }
    if (!params.player_id) {
      return badRequest('player_id 参数必填且必须为字符串');
    }

    // 权限检查
    if (!hasPermission(user, 'player_item', 'read')) {
      return forbidden('权限不足');
    }

    // 商户访问权限检查
    if (!hasMerchantAccess(user, params.merchant_id)) {
      return forbidden('无权限访问其他商户的数据');
    }

    // 分页参数验证
    const page = parseInt(params.page || '1', 10);
    const pageSize = parseInt(params.pageSize || '20', 10);

    if (isNaN(page) || page < 1) {
      return badRequest('page 参数必须为正整数');
    }
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      return badRequest('pageSize 参数必须为1-100之间的整数');
    }

    // 时间参数验证
    let startTime: number | undefined;
    let endTime: number | undefined;

    if (params.start_time) {
      startTime = parseInt(params.start_time, 10);
      if (isNaN(startTime)) {
        return badRequest('start_time 参数必须为有效的时间戳');
      }
    }

    if (params.end_time) {
      endTime = parseInt(params.end_time, 10);
      if (isNaN(endTime)) {
        return badRequest('end_time 参数必须为有效的时间戳');
      }
    }

    if (startTime && endTime && startTime > endTime) {
      return badRequest('start_time 不能大于 end_time');
    }

    // 模拟查询结果
    const filteredItems = mockPlayerItems.filter(item => 
      item.merchant_id === params.merchant_id &&
      item.app_id === params.app_id &&
      item.player_id === params.player_id
    );

    // 手动分页处理
    const total = filteredItems.length;
    const offset = (page - 1) * pageSize;
    const paginatedItems = filteredItems.slice(offset, offset + pageSize);
    const totalPages = Math.ceil(total / pageSize);

    return success({
      items: paginatedItems,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }, '获取玩家背包道具列表成功');

  } catch (error) {
    console.error('获取玩家背包道具列表失败:', error);
    return internalError('获取玩家背包道具列表失败');
  }
}

// 模拟获取单个玩家道具详情的业务逻辑
function simulateGetPlayerItemById(
  user: MockUser | null,
  itemId: string,
  params: {
    merchant_id?: string;
    app_id?: string;
    player_id?: string;
  }
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return badRequest('用户信息缺失');
    }

    // 参数验证
    if (!params.merchant_id) {
      return badRequest('merchant_id 参数必填且必须为字符串');
    }
    if (!params.app_id) {
      return badRequest('app_id 参数必填且必须为字符串');
    }
    if (!params.player_id) {
      return badRequest('player_id 参数必填且必须为字符串');
    }

    // 权限检查
    if (!hasPermission(user, 'player_item', 'read')) {
      return forbidden('权限不足');
    }

    // 商户访问权限检查
    if (!hasMerchantAccess(user, params.merchant_id)) {
      return forbidden('无权限访问其他商户的数据');
    }

    // 查找道具
    const item = mockPlayerItems.find(item => 
      item.id.toString() === itemId &&
      item.merchant_id === params.merchant_id &&
      item.app_id === params.app_id &&
      item.player_id === params.player_id
    );

    if (!item) {
      return notFound('道具不存在');
    }

    return success({ item }, '获取玩家道具详情成功');

  } catch (error) {
    console.error('获取玩家道具详情失败:', error);
    return internalError('获取玩家道具详情失败');
  }
}

// 模拟发放道具的业务逻辑
// 模拟商户访问权限检查（新版本）
function getMerchantAccessPermission(
  user: MockUser,
  requestedMerchantId?: string
): {
  allowed: boolean;
  merchantId?: string;
  message?: string;
} {
  // 超级管理员可以访问任何商户
  if (user.role === 'SUPER_ADMIN') {
    if (requestedMerchantId) {
      return {
        allowed: true,
        merchantId: requestedMerchantId
      };
    } else {
      return {
        allowed: false,
        message: '超级管理员必须指定merchant_id参数'
      };
    }
  }

  // 商户用户只能访问自己的商户
  if (user.user_type === 'MERCHANT' || user.user_type === 'MERCHANT_OWNER') {
    if (!user.merchant_id) {
      return {
        allowed: false,
        message: '用户未关联任何商户'
      };
    }

    if (requestedMerchantId && user.merchant_id !== requestedMerchantId) {
      return {
        allowed: false,
        message: '无权限访问其他商户的数据'
      };
    }

    return {
      allowed: true,
      merchantId: user.merchant_id
    };
  }

  return {
    allowed: false,
    message: '用户类型无效'
  };
}

// 模拟应用验证
function validateApp(appId: string, merchantId: string): {
  valid: boolean;
  message?: string;
} {
  // 模拟应用数据
  const mockApps = [
    { id: 'app-1', merchant_id: 'merchant-1', status: 1 },
    { id: 'app-2', merchant_id: 'merchant-1', status: 1 },
    { id: 'app-3', merchant_id: 'merchant-2', status: 1 }
  ];

  const app = mockApps.find(a => a.id === appId && a.merchant_id === merchantId && a.status === 1);
  
  if (!app) {
    return {
      valid: false,
      message: '应用不存在或已禁用'
    };
  }

  return { valid: true };
}

// 模拟消费道具的业务逻辑
function simulateConsumePlayerItem(
  user: MockUser | null,
  itemId: string,
  body: {
    merchant_id?: string;
    app_id?: string;
    player_id?: string;
    amount?: number;
    remark?: string;
  },
  idempotencyKey?: string
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return badRequest('用户信息缺失');
    }

    // 幂等性键检查
    if (!idempotencyKey) {
      return badRequest('缺少幂等性键 X-Idempotency-Key');
    }

    // 根据用户角色处理merchant_id
    const merchantAccess = getMerchantAccessPermission(user, body.merchant_id);
    if (!merchantAccess.allowed) {
      return forbidden(merchantAccess.message || '权限不足');
    }
    
    // 使用权限检查返回的merchant_id
    const finalMerchantId = merchantAccess.merchantId!;

    // 基础参数验证
    if (!body.app_id) {
      return badRequest('app_id 参数必填且必须为字符串');
    }
    if (!body.player_id) {
      return badRequest('player_id 参数必填且必须为字符串');
    }
    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0 || !Number.isInteger(body.amount)) {
      return badRequest('amount 参数必填且必须为正整数');
    }

    // 权限检查
    if (!hasPermission(user, 'item', 'consume')) {
      return forbidden('需要道具消费权限');
    }

    // 验证应用是否属于当前商户
    const appValidation = validateApp(body.app_id, finalMerchantId);
    if (!appValidation.valid) {
      return badRequest(appValidation.message!);
    }

    // 查找要消费的道具
    const playerItem = mockPlayerItems.find(item => 
      item.id.toString() === itemId &&
      item.merchant_id === finalMerchantId &&
      item.app_id === body.app_id &&
      item.player_id === body.player_id
    );

    if (!playerItem) {
      return notFound('道具不存在');
    }

    if (playerItem.status !== 'normal') {
      return badRequest('道具状态异常，无法消费');
    }

    if (playerItem.amount < body.amount) {
      return badRequest('道具数量不足');
    }

    // 模拟成功消费道具
    const consumeResult = {
      id: playerItem.id,
      merchant_id: finalMerchantId,
      app_id: body.app_id,
      player_id: body.player_id,
      item_id: playerItem.item_id,
      amount: playerItem.amount - body.amount,
      obtain_time: playerItem.obtain_time,
      status: playerItem.amount - body.amount > 0 ? 'normal' : 'consumed',
      remark: body.remark
    };

    return success({ 
      playerItem: consumeResult,
      itemRecord: {
        id: Math.floor(Math.random() * 1000000),
        operation_type: 'consume',
        amount: body.amount
      }
    }, '消费道具成功');

  } catch (error) {
    console.error('消费道具失败:', error);
    return internalError('消费道具失败');
  }
}

function simulateGrantPlayerItem(
  user: MockUser | null,
  body: {
    merchant_id?: string;
    app_id?: string;
    player_id?: string;
    item_id?: string;
    amount?: number;
    remark?: string;
  },
  idempotencyKey?: string
): ApiResponse<any> {
  try {
    // 用户认证检查
    if (!user) {
      return badRequest('用户信息缺失');
    }

    // 幂等性键检查
    if (!idempotencyKey) {
      return badRequest('缺少幂等性键 X-Idempotency-Key');
    }

    // 根据用户角色处理merchant_id
    const merchantAccess = getMerchantAccessPermission(user, body.merchant_id);
    if (!merchantAccess.allowed) {
      return forbidden(merchantAccess.message || '权限不足');
    }
    
    // 使用权限检查返回的merchant_id
    const finalMerchantId = merchantAccess.merchantId!;

    // 基础参数验证
    if (!body.app_id) {
      return badRequest('app_id 参数必填且必须为字符串');
    }
    if (!body.player_id) {
      return badRequest('player_id 参数必填且必须为字符串');
    }
    if (!body.item_id) {
      return badRequest('item_id 参数必填且必须为字符串');
    }
    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0 || !Number.isInteger(body.amount)) {
      return badRequest('amount 参数必填且必须为正整数');
    }


    // 权限检查
    if (!hasPermission(user, 'item', 'grant')) {
      return forbidden('需要道具发放权限');
    }

    // 验证应用是否属于当前商户
    const appValidation = validateApp(body.app_id, finalMerchantId);
    if (!appValidation.valid) {
      return badRequest(appValidation.message!);
    }

    // 模拟成功发放道具
    const grantResult = {
      id: Math.floor(Math.random() * 1000000),
      merchant_id: finalMerchantId,
      app_id: body.app_id,
      player_id: body.player_id,
      item_id: body.item_id,
      amount: body.amount,
      obtain_time: Math.floor(Date.now() / 1000),
      status: 'normal',
      remark: body.remark
    };

    return success({ 
      playerItem: grantResult,
      itemRecord: {
        id: Math.floor(Math.random() * 1000000),
        operation_type: 'grant',
        amount: body.amount
      }
    }, '发放道具成功');

  } catch (error) {
    console.error('发放道具失败:', error);
    return internalError('发放道具失败');
  }
}

describe('Player Item Routes Logic', () => {
  let mockPlayerItemService: jest.Mocked<any>;
  let mockShardingService: jest.Mocked<any>;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // Mock ShardingService
    mockShardingService = {
      getPlayerItemTables: jest.fn().mockResolvedValue(['player_items_app1_202401'])
    };
    ShardingService.mockImplementation(() => mockShardingService);

    // Mock PlayerItemService
    mockPlayerItemService = {
      getPlayerItems: jest.fn()
    };
    PlayerItemService.mockImplementation(() => mockPlayerItemService);
  });

  describe('获取玩家背包道具列表', () => {
    it('应该成功获取玩家背包道具列表', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1',
         page: '1',
         pageSize: '20'
       });

       expect(result.code).toBe(200);
       expect(result.data.items).toHaveLength(2);
       expect(result.data.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      });
    });

    it('应该支持时间范围查询', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1',
         start_time: '1640995200',
         end_time: '1672531200'
       });

       expect(result.code).toBe(200);
       expect(result.data.items).toHaveLength(2);
    });

    it('应该支持分页查询', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1',
         page: '1',
         pageSize: '1'
       });

       expect(result.code).toBe(200);
       expect(result.data.items).toHaveLength(1);
       expect(result.data.pagination.total).toBe(2);
       expect(result.data.pagination.totalPages).toBe(2);
       expect(result.data.pagination.hasNext).toBe(true);
    });

    it('缺少必填参数时应该返回400错误', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1'
         // 缺少 player_id
       });

       expect(result.code).toBe(400);
       expect(result.message).toContain('player_id');
    });

    it('无效的分页参数应该返回400错误', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1',
         page: '0',
         pageSize: '101'
       });

       expect(result.code).toBe(400);
    });

    it('无效的时间参数应该返回400错误', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1',
         start_time: 'invalid',
         end_time: '1672531200'
       });

       expect(result.code).toBe(400);
       expect(result.message).toContain('start_time');
    });

    it('未登录用户应该返回400错误', () => {
       const result = simulateGetPlayerItems(null, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(400);
    });

    it('无权限用户应该返回403错误', () => {
       const result = simulateGetPlayerItems(mockUserWithoutPermission, {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(403);
    });

    it('访问其他商户数据应该返回403错误', () => {
       const result = simulateGetPlayerItems(mockMerchantUser, {
         merchant_id: 'merchant-2', // 不同的商户ID
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(403);
    });

    it('超级管理员应该可以访问任何商户的数据', () => {
       const result = simulateGetPlayerItems(mockSuperAdmin, {
         merchant_id: 'merchant-2',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(200);
    });
  });

  describe('获取单个玩家道具详情', () => {
     it('应该成功获取单个玩家道具详情', () => {
       const result = simulateGetPlayerItemById(mockMerchantUser, '1', {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(200);
       expect(result.data.item).toEqual(mockPlayerItems[0]);
     });

     it('道具不存在时应该返回404错误', () => {
       const result = simulateGetPlayerItemById(mockMerchantUser, '999', {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(404);
       expect(result.message).toContain('道具不存在');
     });

     it('缺少必填参数时应该返回400错误', () => {
       const result = simulateGetPlayerItemById(mockMerchantUser, '1', {
         merchant_id: 'merchant-1'
         // 缺少 app_id 和 player_id
       });

       expect(result.code).toBe(400);
     });

     it('无权限用户应该返回403错误', () => {
       const result = simulateGetPlayerItemById(mockUserWithoutPermission, '1', {
         merchant_id: 'merchant-1',
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(403);
     });

     it('访问其他商户数据应该返回403错误', () => {
       const result = simulateGetPlayerItemById(mockMerchantUser, '1', {
         merchant_id: 'merchant-2', // 不同的商户ID
         app_id: 'app-1',
         player_id: 'player-1'
       });

       expect(result.code).toBe(403);
     });
  });

  describe('发放道具给玩家', () => {
    it('商户用户应该成功发放道具给玩家', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10,
          remark: '测试发放'
        },
        'test-idempotency-key-1'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem).toMatchObject({
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        item_id: 'item-001',
        amount: 10,
        status: 'normal',
        remark: '测试发放'
      });
      expect(result.data.playerItem.id).toBeDefined();
      expect(result.data.playerItem.obtain_time).toBeDefined();
      expect(result.data.itemRecord).toBeDefined();
    });

    it('商户用户不提供merchant_id时应该使用自身关联的merchant_id', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          // 不提供 merchant_id
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-merchant-auto'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem.merchant_id).toBe('merchant-1'); // 自动使用商户用户的merchant_id
    });

    it('超级管理员必须提供merchant_id', () => {
      const result = simulateGrantPlayerItem(
        mockSuperAdmin,
        {
          // 不提供 merchant_id
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-admin-no-merchant'
      );

      expect(result.code).toBe(403);
      expect(result.message).toContain('超级管理员必须指定merchant_id参数');
    });

    it('超级管理员提供merchant_id时应该成功发放', () => {
      const result = simulateGrantPlayerItem(
        mockSuperAdmin,
        {
          merchant_id: 'merchant-2',
          app_id: 'app-3', // app-3 属于 merchant-2
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-admin-with-merchant'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem.merchant_id).toBe('merchant-2');
    });

    it('应用不属于指定商户时应该返回400错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-3', // app-3 属于 merchant-2，不属于 merchant-1
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-wrong-app'
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('应用不存在或已禁用');
    });

    it('商户用户尝试访问其他商户数据应该返回403错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-2', // 尝试访问其他商户
          app_id: 'app-3',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-wrong-merchant'
      );

      expect(result.code).toBe(403);
      expect(result.message).toContain('无权限访问其他商户的数据');
    });

    it('应该支持带过期时间的道具发放', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24小时后
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-002',
          amount: 5
        },
        'test-idempotency-key-2'
      );

      expect(result.code).toBe(200);
    });

    it('缺少幂等性键应该返回400错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        }
        // 缺少幂等性键
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('X-Idempotency-Key');
    });

    it('缺少必填参数应该返回400错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1'
          // 缺少 player_id, item_id, amount
        },
        'test-idempotency-key-3'
      );

      expect(result.code).toBe(400);
    });

    it('无效的数量参数应该返回400错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: -1 // 无效数量
        },
        'test-idempotency-key-4'
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('amount');
    });

    it('正常发放道具应该返回200成功', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-5'
      );

      expect(result.code).toBe(200);
    });

    it('未登录用户应该返回400错误', () => {
      const result = simulateGrantPlayerItem(
        null,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-6'
      );

      expect(result.code).toBe(400);
    });

    it('无权限用户应该返回403错误', () => {
      const result = simulateGrantPlayerItem(
        mockUserWithoutPermission,
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-7'
      );

      expect(result.code).toBe(403);
    });

    it('访问其他商户数据应该返回403错误', () => {
      const result = simulateGrantPlayerItem(
        mockMerchantUser,
        {
          merchant_id: 'merchant-2', // 不同的商户ID
          app_id: 'app-1',
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-8'
      );

      expect(result.code).toBe(403);
    });

    it('超级管理员应该可以为任何商户发放道具', () => {
      const result = simulateGrantPlayerItem(
        mockSuperAdmin,
        {
          merchant_id: 'merchant-2',
          app_id: 'app-3', // app-3 属于 merchant-2
          player_id: 'player-1',
          item_id: 'item-001',
          amount: 10
        },
        'test-idempotency-key-9'
      );

      expect(result.code).toBe(200);
    });
  });

  describe('消费玩家道具', () => {
    it('商户用户应该成功消费玩家道具', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1', // 使用第一个mock道具的ID
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 5,
          remark: '测试消费'
        },
        'test-consume-idempotency-key-1'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem).toMatchObject({
        merchant_id: 'merchant-1',
        app_id: 'app-1',
        player_id: 'player-1',
        amount: 95, // 原来100，消费5后剩余95
        status: 'normal',
        remark: '测试消费'
      });
      expect(result.data.itemRecord).toMatchObject({
        operation_type: 'consume',
        amount: 5
      });
    });

    it('消费全部数量后道具状态应该变为consumed', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 100, // 消费全部数量
          remark: '全部消费'
        },
        'test-consume-idempotency-key-2'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem.amount).toBe(0);
      expect(result.data.playerItem.status).toBe('consumed');
    });

    it('商户用户不提供merchant_id时应该使用自身关联的merchant_id', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          // 不提供 merchant_id
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-3'
      );

      expect(result.code).toBe(200);
      expect(result.data.playerItem.merchant_id).toBe('merchant-1');
    });

    it('超级管理员必须提供merchant_id', () => {
      const result = simulateConsumePlayerItem(
        mockSuperAdmin,
        '1',
        {
          // 不提供 merchant_id
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-4'
      );

      expect(result.code).toBe(403);
      expect(result.message).toContain('超级管理员必须指定merchant_id参数');
    });

    it('道具数量不足时应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 200 // 超过现有数量100
        },
        'test-consume-idempotency-key-5'
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('道具数量不足');
    });

    it('道具不存在时应该返回404错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '999', // 不存在的道具ID
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-6'
      );

      expect(result.code).toBe(404);
      expect(result.message).toContain('道具不存在');
    });

    it('缺少幂等性键应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        }
        // 缺少幂等性键
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('X-Idempotency-Key');
    });

    it('缺少必填参数应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1'
          // 缺少 app_id, player_id, amount
        },
        'test-consume-idempotency-key-7'
      );

      expect(result.code).toBe(400);
    });

    it('无效的数量参数应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: -1 // 无效数量
        },
        'test-consume-idempotency-key-8'
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('amount');
    });

    it('未登录用户应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        null,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-9'
      );

      expect(result.code).toBe(400);
    });

    it('无权限用户应该返回403错误', () => {
      const result = simulateConsumePlayerItem(
        mockUserWithoutPermission,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-10'
      );

      expect(result.code).toBe(403);
      expect(result.message).toContain('需要道具消费权限');
    });

    it('商户用户尝试访问其他商户数据应该返回403错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-2', // 尝试访问其他商户
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-11'
      );

      expect(result.code).toBe(403);
      expect(result.message).toContain('无权限访问其他商户的数据');
    });

    it('应用不属于指定商户时应该返回400错误', () => {
      const result = simulateConsumePlayerItem(
        mockMerchantUser,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-3', // app-3 属于 merchant-2，不属于 merchant-1
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-12'
      );

      expect(result.code).toBe(400);
      expect(result.message).toContain('应用不存在或已禁用');
    });

    it('超级管理员应该可以消费任何商户的道具', () => {
      const result = simulateConsumePlayerItem(
        mockSuperAdmin,
        '1',
        {
          merchant_id: 'merchant-1',
          app_id: 'app-1',
          player_id: 'player-1',
          amount: 10
        },
        'test-consume-idempotency-key-13'
      );

      expect(result.code).toBe(200);
    });
  });
});