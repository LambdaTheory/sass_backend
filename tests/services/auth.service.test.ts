import jwt from 'jsonwebtoken';
import { validateToken, getUserInfo, validateTokenAndGetUserInfo } from '../../src/services/auth.service';

// Mock database utils
jest.mock('../../src/utils/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn()
    },
    superAdmin: {
      findUnique: jest.fn()
    },
    merchant: {
      findUnique: jest.fn()
    },
    userPermission: {
      findMany: jest.fn()
    }
  }
}));

// Mock jwt
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

// Get the mocked prisma instance
const { prisma: mockPrisma } = require('../../src/utils/database');

// Mock environment variables
const originalEnv = process.env;

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateToken', () => {
    it('应该在没有Authorization header时返回错误', async () => {
      const result = await validateToken(undefined);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
      expect(result.error?.message).toBe('未提供有效的认证token');
    });

    it('应该在Authorization header格式错误时返回错误', async () => {
      const result = await validateToken('InvalidHeader');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
      expect(result.error?.message).toBe('未提供有效的认证token');
    });

    it('应该在JWT_SECRET未设置时返回错误', async () => {
      delete process.env.JWT_SECRET;
      
      const result = await validateToken('Bearer valid-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(500);
      expect(result.error?.message).toBe('服务器配置错误');
    });

    it('应该在token无效时返回错误', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      const result = await validateToken('Bearer invalid-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
      expect(result.error?.message).toBe('token无效或已过期');
    });

    it('应该在用户不存在时返回错误', async () => {
      const mockDecoded = { userId: 'user-123', username: 'test' };
      mockJwt.verify.mockReturnValue(mockDecoded as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      const result = await validateToken('Bearer valid-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
      expect(result.error?.message).toBe('用户不存在或已被禁用');
    });

    it('应该在用户被禁用时返回错误', async () => {
      const mockDecoded = { userId: 'user-123', username: 'test' };
      const mockUser = { id: 'user-123', username: 'test', status: 0 };
      
      mockJwt.verify.mockReturnValue(mockDecoded as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      
      const result = await validateToken('Bearer valid-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
      expect(result.error?.message).toBe('用户不存在或已被禁用');
    });

    it('应该在token和用户都有效时返回成功', async () => {
      const mockDecoded = { userId: 'user-123', username: 'test' };
      const mockUser = { id: 'user-123', username: 'test', status: 1, user_type: 'SUPER_ADMIN' };
      
      mockJwt.verify.mockReturnValue(mockDecoded as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      
      const result = await validateToken('Bearer valid-token');
      
      expect(result.success).toBe(true);
      expect(result.decoded).toEqual(mockDecoded);
      expect(result.user).toEqual(mockUser);
    });
  });

  describe('getUserInfo', () => {
    it('应该为普通用户返回基础信息', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'test',
        user_type: 'REGULAR',
        status: 1
      };
      
      const result = await getUserInfo(mockUser);
      
      expect(result.success).toBe(true);
      expect(result.userInfo).toEqual({
        id: 'user-123',
        username: 'test',
        user_type: 'REGULAR',
        status: 1,
        permissions: []
      });
    });

    it('应该为超级管理员返回完整信息和权限', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'admin',
        user_type: 'SUPER_ADMIN',
        status: 1,
        super_admin_id: 'admin-123'
      };
      
      const mockSuperAdmin = { id: 'admin-123' };
      const mockPermissions = [
        { permission: { name: 'user_create' } },
        { permission: { name: 'user_edit' } }
      ];
      
      mockPrisma.superAdmin.findUnique.mockResolvedValue(mockSuperAdmin);
      mockPrisma.userPermission.findMany.mockResolvedValue(mockPermissions);
      
      const result = await getUserInfo(mockUser);
      
      expect(result.success).toBe(true);
      expect(result.userInfo?.role).toBe('SUPER_ADMIN');
      expect(result.userInfo?.super_admin_id).toBe('admin-123');
      expect(result.userInfo?.permissions).toEqual(['user_create', 'user_edit']);
    });

    it('应该为商户所有者返回完整信息和权限', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'merchant',
        user_type: 'MERCHANT_OWNER',
        status: 1,
        merchant_id: 'merchant-123'
      };
      
      const mockMerchant = { id: 'merchant-123' };
      const mockPermissions = [
        { permission: { name: 'item_create' } },
        { permission: { name: 'item_edit' } }
      ];
      
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.userPermission.findMany.mockResolvedValue(mockPermissions);
      
      const result = await getUserInfo(mockUser);
      
      expect(result.success).toBe(true);
      expect(result.userInfo?.role).toBe('MERCHANT_OWNER');
      expect(result.userInfo?.merchant_id).toBe('merchant-123');
      expect(result.userInfo?.permissions).toEqual(['item_create', 'item_edit']);
    });

    it('应该在数据库错误时返回错误', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'test',
        user_type: 'SUPER_ADMIN',
        status: 1,
        super_admin_id: 'admin-123'
      };
      
      mockPrisma.superAdmin.findUnique.mockRejectedValue(new Error('Database error'));
      
      const result = await getUserInfo(mockUser);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(500);
      expect(result.error?.message).toBe('获取用户信息过程中发生错误');
    });
  });

  describe('validateTokenAndGetUserInfo', () => {
    it('应该在token验证失败时返回错误', async () => {
      const result = await validateTokenAndGetUserInfo('Invalid header');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(401);
    });

    it('应该在token验证成功时返回完整用户信息', async () => {
      const mockDecoded = { userId: 'user-123', username: 'test', merchantId: 'merchant-123' };
      const mockUser = {
        id: 'user-123',
        username: 'test',
        user_type: 'REGULAR',
        status: 1
      };
      const mockMerchant = {
        id: 'merchant-123',
        name: 'Test Merchant',
        status: 1
      };
      
      mockJwt.verify.mockReturnValue(mockDecoded as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      
      const result = await validateTokenAndGetUserInfo('Bearer valid-token');
      
      expect(result.success).toBe(true);
      expect(result.userInfo?.id).toBe('user-123');
      expect(result.userInfo?.username).toBe('test');
    });
  });
});