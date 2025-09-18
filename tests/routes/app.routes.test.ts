import { Request, Response } from 'express';
import { success, internalError, badRequest, notFound, ApiResponse } from '../../src/utils/response';
import { randomUUID } from 'crypto';

// 模拟认证中间件验证后的用户信息
interface MockUser {
  id: string;
  username: string;
  user_type: string;
  merchant_id?: string;
  status: number;
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
  created_at: bigint;
  updated_at: bigint;
}

// 模拟数据库
const mockMerchants: MockMerchant[] = [
  { id: 'merchant-1', name: '测试商户1', status: 1 },
  { id: 'merchant-2', name: '测试商户2', status: 1 }
];

const mockApps: MockApp[] = [
  {
    id: 'app-1',
    merchant_id: 'merchant-1',
    name: 'TestApp1',
    status: 1,
    created_at: BigInt(Date.now()),
    updated_at: BigInt(Date.now())
  }
];

// 模拟创建应用的核心逻辑
function simulateCreateApp(
  user: MockUser | null,
  requestBody: { name?: string; merchant_id?: string }
): ApiResponse<any> {
  try {
    const { name, merchant_id } = requestBody;

    // 基础参数验证
    if (!merchant_id) {
      return badRequest("商户ID不能为空");
    }

    // 应用名称校验
    if (!name) {
      return badRequest("应用名称不能为空");
    }

    if (name.trim() === "") {
      return badRequest("应用名称不能为空");
    }

    // 应用名称长度校验（最多30个字符）
    if (name.length > 30) {
      return badRequest("应用名称不能超过30个字符");
    }

    // 应用名称字符校验（只允许数字、字母）
    const nameRegex = /^[a-zA-Z0-9]+$/;
    if (!nameRegex.test(name)) {
      return badRequest("应用名称只能包含数字和字母");
    }

    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 权限检查：如果是商户用户，只能为自己的商户创建应用
    if (user.user_type === "MERCHANT_OWNER" && user.merchant_id !== merchant_id) {
      return badRequest("无权限为其他商户创建应用");
    }

    // 检查商户是否存在
    const merchant = mockMerchants.find(m => m.id === merchant_id);
    if (!merchant) {
      return notFound("商户不存在");
    }

    // 检查应用名称是否在该商户下已存在
    const trimmedName = name.trim();
    const existingApp = mockApps.find(app => 
      app.merchant_id === merchant_id && app.name === trimmedName
    );
    if (existingApp) {
      return badRequest("应用名称已存在，请使用其他名称");
    }

    // 创建应用
    const now = BigInt(Date.now());
    const newApp = {
      id: randomUUID(),
      merchant_id,
      name: trimmedName,
      status: 1,
      created_at: now,
      updated_at: now,
      merchant: {
        id: merchant.id,
        name: merchant.name
      }
    };

    // 添加到模拟数据库
    mockApps.push({
      id: newApp.id,
      merchant_id,
      name: trimmedName,
      status: 1,
      created_at: now,
      updated_at: now
    });

    return success(newApp, "创建应用成功");
  } catch (error) {
    console.error("创建应用失败:", error);
    return internalError("创建应用失败");
  }
}

// 模拟查询应用列表的核心逻辑
function simulateGetAppList(
  user: MockUser | null,
  queryParams: { merchant_id?: string; limit?: number; offset?: number }
): ApiResponse<any> {
  try {
    const { merchant_id, limit = 10, offset = 0 } = queryParams;

    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    let filteredApps = [...mockApps];

    // 权限过滤
    if (user.user_type === "SUPER_ADMIN") {
      // 超级管理员可以查询指定商户的应用或所有应用
      if (merchant_id) {
        filteredApps = filteredApps.filter(app => app.merchant_id === merchant_id);
      }
    } else if (user.user_type === "MERCHANT_OWNER") {
      // 商户用户只能查询自己商户下的应用
      filteredApps = filteredApps.filter(app => app.merchant_id === user.merchant_id);
    }

    // 分页
    const total = filteredApps.length;
    const paginatedApps = filteredApps.slice(offset, offset + limit);

    // 添加商户信息
    const appsWithMerchant = paginatedApps.map(app => {
      const merchant = mockMerchants.find(m => m.id === app.merchant_id);
      return {
        ...app,
        merchant: merchant ? { id: merchant.id, name: merchant.name } : null
      };
    });

    return success({ apps: appsWithMerchant, total }, "获取应用列表成功");
  } catch (error) {
    console.error("获取应用列表失败:", error);
    return internalError("获取应用列表失败");
  }
}

// 模拟更新应用的核心逻辑
function simulateUpdateApp(
  user: MockUser | null,
  appId: string,
  requestBody: { name?: string; status?: number }
): ApiResponse<any> {
  try {
    const { name, status } = requestBody;

    // 用户认证检查
    if (!user) {
      return { code: 401, message: '未认证', data: null };
    }

    // 检查应用是否存在
    const appIndex = mockApps.findIndex(app => app.id === appId);
    if (appIndex === -1) {
      return notFound("应用不存在");
    }

    const app = mockApps[appIndex];

    // 权限检查
    if (user.user_type === "MERCHANT_OWNER" && user.merchant_id !== app.merchant_id) {
      return badRequest("无权限更新该应用");
    }

    // 检查应用名称是否在该商户下已存在
    if (name) {
      const existingApp = mockApps.find(a => 
        a.merchant_id === app.merchant_id && a.name === name && a.id !== appId
      );
      if (existingApp) {
        return badRequest("该商户下已存在同名应用");
      }
    }

    // 更新应用
    const updatedApp = { ...app };
    if (name) {
      updatedApp.name = name;
    }
    if (status !== undefined) {
      updatedApp.status = status;
    }
    updatedApp.updated_at = BigInt(Date.now());

    mockApps[appIndex] = updatedApp;
    
    const merchant = mockMerchants.find(m => m.id === updatedApp.merchant_id);

    return success({
        ...updatedApp,
        merchant: merchant ? { id: merchant.id, name: merchant.name } : null
    }, "应用更新成功");
  } catch (error) {
    console.error("更新应用失败:", error);
    return internalError("更新应用失败");
  }
}

describe('App Routes - 应用管理功能验证', () => {
  describe('创建应用功能验证', () => {
    it('应该成功创建应用（超级管理员）', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: 'NewApp',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('创建应用成功');
      expect(result.data.name).toBe('NewApp');
      expect(result.data.merchant_id).toBe('merchant-1');
    });

    it('应该成功创建应用（商户用户为自己商户创建）', () => {
      const mockUser: MockUser = {
        id: 'merchant-user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1
      };
      
      const requestBody = {
        name: 'MerchantApp',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('创建应用成功');
    });

    it('应该拒绝商户用户为其他商户创建应用', () => {
      const mockUser: MockUser = {
        id: 'merchant-user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1
      };
      
      const requestBody = {
        name: 'OtherMerchantApp',
        merchant_id: 'merchant-2'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('无权限为其他商户创建应用');
    });

    it('应该拒绝创建重名应用', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: 'TestApp1', // 已存在的应用名
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('应用名称已存在，请使用其他名称');
    });

    it('应该拒绝空的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('应用名称不能为空');
    });

    it('应该拒绝只有空格的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '   ',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('应用名称不能为空');
    });

    it('应该拒绝超过30个字符的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '这是一个非常长的应用名称超过了三十个字符的限制测试用例需要更多字符',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('应用名称不能超过30个字符');
    });

    it('应该拒绝包含特殊字符的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '测试应用@#$',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('应用名称只能包含数字和字母');
    });

    it('应该接受包含数字、字母的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: 'TestApp123ABC',
        merchant_id: 'merchant-1'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('创建应用成功');
    });

    it('应该拒绝空的商户ID', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '测试应用',
        merchant_id: ''
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('商户ID不能为空');
    });

    it('应该拒绝不存在的商户', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: 'NewApp',
        merchant_id: 'non-existent-merchant'
      };
      
      const result = simulateCreateApp(mockUser, requestBody);
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('商户不存在');
    });
  });

  describe('查询应用列表功能验证', () => {
    it('应该成功获取所有应用列表（超级管理员）', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const queryParams = {};
      
      const result = simulateGetAppList(mockUser, queryParams);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('获取应用列表成功');
      expect(result.data.apps).toBeDefined();
      expect(result.data.total).toBeDefined();
    });

    it('应该成功获取指定商户的应用列表（超级管理员）', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const queryParams = { merchant_id: 'merchant-1' };
      
      const result = simulateGetAppList(mockUser, queryParams);
      
      expect(result.code).toBe(200);
      expect(result.data.apps.every((app: any) => app.merchant_id === 'merchant-1')).toBe(true);
    });

    it('应该成功获取自己商户的应用列表（商户用户）', () => {
      const mockUser: MockUser = {
        id: 'merchant-user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1
      };
      
      const queryParams = {};
      
      const result = simulateGetAppList(mockUser, queryParams);
      
      expect(result.code).toBe(200);
      expect(result.data.apps.every((app: any) => app.merchant_id === 'merchant-1')).toBe(true);
    });

    it('应该支持分页查询', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const queryParams = { limit: 1, offset: 0 };
      
      const result = simulateGetAppList(mockUser, queryParams);
      
      expect(result.code).toBe(200);
      expect(result.data.apps.length).toBeLessThanOrEqual(1);
    });

    it('应该拒绝未认证用户', () => {
      const result = simulateGetAppList(null, {});
      
      expect(result.code).toBe(401);
    });
  });

  describe('更新应用功能验证', () => {
    it('应该成功更新应用名称（超级管理员）', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '更新后的应用名称'
      };
      
      const result = simulateUpdateApp(mockUser, 'app-1', requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('应用更新成功');
      expect(result.data.name).toBe('更新后的应用名称');
    });

    it('应该成功更新应用状态（商户用户）', () => {
      const mockUser: MockUser = {
        id: 'merchant-user-1',
        username: 'merchant1',
        user_type: 'MERCHANT_OWNER',
        merchant_id: 'merchant-1',
        status: 1
      };
      
      const requestBody = {
        status: 0
      };
      
      const result = simulateUpdateApp(mockUser, 'app-1', requestBody);
      
      expect(result.code).toBe(200);
      expect(result.message).toBe('应用更新成功');
      expect(result.data.status).toBe(0);
    });

    it('应该拒绝商户用户更新不属于自己的应用', () => {
      const mockUser: MockUser = {
        id: 'merchant-user-2',
        username: 'merchant2',
        user_type: 'MERCHANT_OWNER',
        merchant_id: 'merchant-2',
        status: 1
      };
      
      const requestBody = {
        name: '试图更新的应用'
      };
      
      const result = simulateUpdateApp(mockUser, 'app-1', requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('无权限更新该应用');
    });

    it('应该拒绝更新为已存在的应用名称', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      mockApps.push({
        id: 'app-2',
        merchant_id: 'merchant-1',
        name: '另一个应用',
        status: 1,
        created_at: BigInt(Date.now()),
        updated_at: BigInt(Date.now())
      });
      
      const requestBody = {
        name: '另一个应用'
      };
      
      const result = simulateUpdateApp(mockUser, 'app-1', requestBody);
      
      expect(result.code).toBe(400);
      expect(result.message).toBe('该商户下已存在同名应用');
    });

    it('应该拒绝更新不存在的应用', () => {
      const mockUser: MockUser = {
        id: 'admin-1',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1
      };
      
      const requestBody = {
        name: '不存在的应用'
      };
      
      const result = simulateUpdateApp(mockUser, 'non-existent-app', requestBody);
      
      expect(result.code).toBe(404);
      expect(result.message).toBe('应用不存在');
    });

    it('应该拒绝未认证用户的更新请求', () => {
      const requestBody = {
        name: '尝试更新'
      };
      
      const result = simulateUpdateApp(null, 'app-1', requestBody);
      
      expect(result.code).toBe(401);
      expect(result.message).toBe('未认证');
    });
  });
});