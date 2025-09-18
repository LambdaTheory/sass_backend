import { Request, Response, NextFunction } from 'express';
import { merchantAuthMiddleware, optionalMerchantAuthMiddleware, validateMerchantAppAccess, MerchantAuthRequest } from '../../src/middleware/merchant-auth.middleware';
import { merchantKeyService } from '../../src/services/merchant-key.service';

// Mock merchant key service
jest.mock('../../src/services/merchant-key.service');
const mockMerchantKeyService = merchantKeyService as jest.Mocked<typeof merchantKeyService>;

describe('Merchant Auth Middleware', () => {
  let mockRequest: Partial<MerchantAuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      headers: {},
      method: 'POST',
      path: '/api/test',
      body: { test: 'data' }
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  describe('merchantAuthMiddleware', () => {
    it('应该在缺少X-Signature请求头时返回401错误', async () => {
      mockRequest.headers = {
        'x-timestamp': '1234567890'
      };

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing X-Signature header'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在缺少X-Timestamp请求头时返回401错误', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature'
      };

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing X-Timestamp header'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在时间戳格式无效时返回401错误', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': 'invalid-timestamp'
      };

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid timestamp format'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在签名验证失败时返回401错误', async () => {
      mockRequest.headers = {
        'x-signature': 'invalid-signature',
        'x-timestamp': '1234567890'
      };

      mockMerchantKeyService.verifySignature.mockResolvedValue({
        success: false,
        error: 'Signature verification failed'
      });

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockMerchantKeyService.verifySignature).toHaveBeenCalledWith(
        'invalid-signature',
        1234567890,
        'POST',
        '/api/test',
        { test: 'data' }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Signature verification failed'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在签名验证成功时设置商户信息并继续', async () => {
      const merchantId = 'test-merchant-id';
      mockRequest.headers = {
        'x-signature': 'valid-signature',
        'x-timestamp': '1234567890'
      };

      mockMerchantKeyService.verifySignature.mockResolvedValue({
        success: true,
        merchantId
      });

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockMerchantKeyService.verifySignature).toHaveBeenCalledWith(
        'valid-signature',
        1234567890,
        'POST',
        '/api/test',
        { test: 'data' }
      );

      expect(mockRequest.merchant).toEqual({ id: merchantId });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('应该在发生异常时返回500错误', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': '1234567890'
      };

      mockMerchantKeyService.verifySignature.mockRejectedValue(
        new Error('Database error')
      );

      await merchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during authentication'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalMerchantAuthMiddleware', () => {
    it('应该在没有签名时直接继续', async () => {
      mockRequest.headers = {};

      await optionalMerchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('应该在只有签名没有时间戳时直接继续', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature'
      };

      await optionalMerchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('应该在提供了完整签名信息时进行验证', async () => {
      const merchantId = 'test-merchant-id';
      mockRequest.headers = {
        'x-signature': 'valid-signature',
        'x-timestamp': '1234567890'
      };

      mockMerchantKeyService.verifySignature.mockResolvedValue({
        success: true,
        merchantId
      });

      await optionalMerchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockMerchantKeyService.verifySignature).toHaveBeenCalled();
      expect(mockRequest.merchant).toEqual({ id: merchantId });
      expect(mockNext).toHaveBeenCalled();
    });

    it('应该在验证过程中发生异常时返回500错误', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': '1234567890'
      };

      mockMerchantKeyService.verifySignature.mockRejectedValue(
        new Error('Verification error')
      );

      // 重置mock以避免之前调用的影响
      (mockNext as jest.Mock).mockClear();
      (mockResponse.status as jest.Mock).mockClear();

      await optionalMerchantAuthMiddleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateMerchantAppAccess', () => {
    it('应该在没有商户认证时返回401错误', async () => {
      const middleware = validateMerchantAppAccess();
      
      await middleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Merchant authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在缺少app_id时返回400错误', async () => {
      mockRequest.merchant = { id: 'test-merchant' };
      mockRequest.query = {};
      mockRequest.body = {};
      
      const middleware = validateMerchantAppAccess();
      
      await middleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'app_id is required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在提供app_id时继续执行', async () => {
      mockRequest.merchant = { id: 'test-merchant' };
      mockRequest.query = { app_id: 'test-app' };
      
      const middleware = validateMerchantAppAccess();
      
      await middleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('应该使用指定的appId', async () => {
      mockRequest.merchant = { id: 'test-merchant' };
      
      const middleware = validateMerchantAppAccess('specified-app-id');
      
      await middleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('应该在发生异常时返回500错误', async () => {
      mockRequest.merchant = { id: 'test-merchant' };
      mockRequest.query = { app_id: 'test-app' };
      
      // 模拟异常
      const middleware = validateMerchantAppAccess();
      
      // 重写next函数以抛出异常
      const errorNext = jest.fn(() => {
        throw new Error('Test error');
      });
      
      await middleware(
        mockRequest as MerchantAuthRequest,
        mockResponse as Response,
        errorNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during app access validation'
      });
    });
  });
});