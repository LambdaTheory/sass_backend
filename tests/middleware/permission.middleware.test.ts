import { Request, Response, NextFunction } from 'express';
import { 
  requirePermission, 
  requireRole, 
  requireMerchantAccess,
  hasPermission 
} from '../../src/middleware/permission.middleware';
import { AuthRequest, UserInfo } from '../../src/types';
import { UserType } from '@prisma/client';

// Mock response对象
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock next函数
const mockNext = jest.fn() as NextFunction;

// Mock AuthRequest对象
const mockAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest => ({
  ...({} as Request),
  ...overrides
} as AuthRequest);

// 创建测试用户数据
const createTestUser = (overrides: Partial<UserInfo> = {}): UserInfo => ({
  id: 'test-user-id',
  username: 'testuser',
  user_type: UserType.MERCHANT_OWNER,
  role: 'MERCHANT_OWNER',
  merchant_id: 'test-merchant-id',
  status: 1,
  permissions: ['item_create', 'item_read'],
  ...overrides
});

describe('Permission Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requirePermission', () => {
    it('应该拒绝未登录用户', () => {
      const req = {} as AuthRequest;
      const res = mockResponse();
      const middleware = requirePermission({ resource: 'item', action: 'create' });

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户未登录',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该拒绝被禁用的用户', () => {
      const req = {
        user: createTestUser({ status: 0 }) // 被禁用的用户
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requirePermission({ resource: 'item', action: 'create' });

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户已被禁用',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该允许超级管理员访问所有资源', () => {
      const req = {
        user: createTestUser({ 
          role: 'SUPER_ADMIN',
          user_type: UserType.SUPER_ADMIN,
          permissions: []
        })
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requirePermission({ resource: 'item', action: 'create' });

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('应该允许有权限的用户访问', () => {
      const req = {
        user: createTestUser({ permissions: ['item_create'] })
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requirePermission({ resource: 'item', action: 'create' });

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('应该拒绝没有权限的用户', () => {
      const req = {
        user: createTestUser({ permissions: ['item_read'] }) // 只有读权限
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requirePermission({ resource: 'item', action: 'create' });

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: '权限不足',
        code: 403,
        data: {
          required: 'item_create',
          message: '需要 item 的 create 权限'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('应该拒绝未登录用户', () => {
      const req = {} as AuthRequest;
      const res = mockResponse();
      const middleware = requireRole('MERCHANT_OWNER');

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户未登录',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该拒绝被禁用的用户', () => {
      const req = {
        user: createTestUser({ status: 0 }) // 被禁用的用户
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requireRole('MERCHANT_OWNER');

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户已被禁用',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该允许匹配角色的用户', () => {
      const req = {
        user: createTestUser({ role: 'MERCHANT_OWNER' })
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requireRole('MERCHANT_OWNER');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('应该拒绝不匹配角色的用户', () => {
      const req = {
        user: createTestUser({ role: 'MERCHANT_OWNER' })
      } as AuthRequest;
      const res = mockResponse();
      const middleware = requireRole('SUPER_ADMIN');

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: '角色权限不足',
        code: 403,
        data: {
          required: ['SUPER_ADMIN'],
          current: 'MERCHANT_OWNER',
          message: '需要以下角色之一: SUPER_ADMIN'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireMerchantAccess', () => {
    const getMerchantId = (req: AuthRequest) => req.params?.merchantId;

    it('应该拒绝未登录用户', () => {
      const req = mockAuthRequest({ params: { merchantId: 'test-merchant-id' } });
      const res = mockResponse();
      const middleware = requireMerchantAccess(getMerchantId);

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户未登录',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该拒绝被禁用的用户', () => {
      const req = mockAuthRequest({
        user: createTestUser({ status: 0 }), // 被禁用的用户
        params: { merchantId: 'test-merchant-id' }
      });
      const res = mockResponse();
      const middleware = requireMerchantAccess(getMerchantId);

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: '用户已被禁用',
        code: 401,
        data: undefined
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该允许超级管理员访问任何商户资源', () => {
      const req = mockAuthRequest({
        user: createTestUser({ 
          role: 'SUPER_ADMIN',
          user_type: UserType.SUPER_ADMIN,
          merchant_id: 'different-merchant-id'
        }),
        params: { merchantId: 'test-merchant-id' }
      });
      const res = mockResponse();
      const middleware = requireMerchantAccess(getMerchantId);

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('应该允许用户访问自己商户的资源', () => {
      const req = mockAuthRequest({
        user: createTestUser({ merchant_id: 'test-merchant-id' }),
        params: { merchantId: 'test-merchant-id' }
      });
      const res = mockResponse();
      const middleware = requireMerchantAccess(getMerchantId);

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('应该拒绝用户访问其他商户的资源', () => {
      const req = mockAuthRequest({
        user: createTestUser({ merchant_id: 'user-merchant-id' }),
        params: { merchantId: 'other-merchant-id' }
      });
      const res = mockResponse();
      const middleware = requireMerchantAccess(getMerchantId);

      middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: '无权访问其他商户的资源',
        code: 403,
        data: {
          message: '只能访问自己商户的资源'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('hasPermission', () => {
    it('应该为超级管理员返回true', () => {
      const user = { role: 'SUPER_ADMIN', permissions: [] };
      const result = hasPermission(user, 'item', 'create');
      expect(result).toBe(true);
    });

    it('应该为有权限的用户返回true', () => {
      const user = { role: 'MERCHANT_OWNER', permissions: ['item_create'] };
      const result = hasPermission(user, 'item', 'create');
      expect(result).toBe(true);
    });

    it('应该为没有权限的用户返回false', () => {
      const user = { role: 'MERCHANT_OWNER', permissions: ['item_read'] };
      const result = hasPermission(user, 'item', 'create');
      expect(result).toBe(false);
    });
  });
});