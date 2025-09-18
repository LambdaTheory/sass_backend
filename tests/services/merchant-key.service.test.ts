import crypto from 'crypto';
import { MerchantKeyService } from '../../src/services/merchant-key.service';
import { PrismaClient } from '@prisma/client';

// Mock crypto module
jest.mock('crypto');
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

// Mock Prisma
const mockPrisma = {
  merchant: {
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn()
  }
} as any;

describe('MerchantKeyService', () => {
  let merchantKeyService: MerchantKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    merchantKeyService = new MerchantKeyService(mockPrisma);
  });

  describe('generateHmacKey', () => {
    it('应该生成HMAC密钥', () => {
      const mockKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockBuffer = {
        toString: jest.fn().mockReturnValue(mockKey)
      } as any;

      mockCrypto.randomBytes.mockReturnValue(mockBuffer);

      const result = merchantKeyService.generateHmacKey();

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockBuffer.toString).toHaveBeenCalledWith('hex');
      expect(result).toEqual({ key: mockKey });
    });
  });

  describe('generateMerchantKeys', () => {
    it('应该为商户生成并保存密钥对', async () => {
      const merchantId = 'test-merchant-id';
      const mockKeyPair = {
        publicKey: '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----'
      };
      const mockHash = 'mock-hash';

      mockCrypto.generateKeyPairSync.mockReturnValue(mockKeyPair as any);
      mockCrypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(mockHash)
      } as any);

      jest.spyOn(Date, 'now').mockReturnValue(1234567890);

      const result = await merchantKeyService.generateMerchantKeys(merchantId);

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: merchantId },
        data: {
          public_key: mockKeyPair.publicKey,
          private_key_hash: mockHash,
          key_created_at: BigInt(1234567890),
          key_status: 1
        }
      });

      expect(result).toEqual(mockKeyPair);
    });
  });

  describe('getMerchantHmacKey', () => {
    it('应该返回有效商户的HMAC密钥', async () => {
      const merchantId = 'test-merchant-id';
      const mockHmacKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      mockPrisma.merchant.findUnique.mockResolvedValue({
        hmac_key: mockHmacKey,
        key_status: 1
      } as any);

      const result = await merchantKeyService.getMerchantHmacKey(merchantId);

      expect(mockPrisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: merchantId },
        select: { hmac_key: true, key_status: true }
      });

      expect(result).toBe(mockHmacKey);
    });

    it('应该在商户不存在时返回null', async () => {
      const merchantId = 'non-existent-merchant';

      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      const result = await merchantKeyService.getMerchantHmacKey(merchantId);

      expect(result).toBeNull();
    });

    it('应该在密钥状态无效时返回null', async () => {
      const merchantId = 'test-merchant-id';

      mockPrisma.merchant.findUnique.mockResolvedValue({
        hmac_key: 'some-key',
        key_status: 0
      } as any);

      const result = await merchantKeyService.getMerchantHmacKey(merchantId);

      expect(result).toBeNull();
    });
  });

  describe('createSignaturePayload', () => {
    it('应该创建正确的签名payload', () => {
      const merchantId = 'test-merchant';
      const timestamp = 1234567890;
      const method = 'post';
      const path = '/api/test';
      const body = { test: 'data' };
      const mockBodyHash = 'mock-body-hash';

      mockCrypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(mockBodyHash)
      } as any);

      const result = merchantKeyService.createSignaturePayload(
        merchantId,
        timestamp,
        method,
        path,
        body
      );

      expect(result).toEqual({
        merchant_id: merchantId,
        timestamp,
        method: 'POST',
        path,
        body_hash: mockBodyHash
      });
    });
  });

  describe('signPayload', () => {
    it('应该使用私钥对payload进行签名', () => {
      const payload = {
        merchant_id: 'test-merchant',
        timestamp: 1234567890,
        method: 'POST',
        path: '/api/test',
        body_hash: 'hash'
      };
      const privateKey = 'private-key';
      const mockSignature = Buffer.from('mock-signature');

      mockCrypto.sign.mockReturnValue(mockSignature as any);

      const result = merchantKeyService.signPayload(payload, privateKey);

      expect(mockCrypto.sign).toHaveBeenCalledWith(
        'sha256',
        Buffer.from(JSON.stringify(payload)),
        privateKey
      );

      expect(result).toBe(mockSignature.toString('base64'));
    });
  });

  describe('verifySignature', () => {
    it('应该在时间戳过期时返回失败', async () => {
      const signature = 'test-signature';
      const timestamp = Date.now() - 400000; // 超过5分钟
      const method = 'POST';
      const path = '/api/test';
      const body = {};

      const result = await merchantKeyService.verifySignature(
        signature,
        timestamp,
        method,
        path,
        body
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('请求已过期');
    });

    it('应该在找到有效签名时返回成功', async () => {
      const signature = 'test-signature';
      const timestamp = Date.now();
      const method = 'POST';
      const path = '/api/test';
      const body = {};
      const merchantId = 'test-merchant';

      mockPrisma.merchant.findMany.mockResolvedValue([
        {
          id: merchantId,
          public_key: 'public-key'
        }
      ] as any);

      mockCrypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('body-hash')
      } as any);

      mockCrypto.verify.mockReturnValue(true as any);

      const result = await merchantKeyService.verifySignature(
        signature,
        timestamp,
        method,
        path,
        body
      );

      expect(result.success).toBe(true);
      expect(result.merchantId).toBe(merchantId);
    });

    it('应该在没有找到有效签名时返回失败', async () => {
      const signature = 'test-signature';
      const timestamp = Date.now();
      const method = 'POST';
      const path = '/api/test';
      const body = {};

      mockPrisma.merchant.findMany.mockResolvedValue([
        {
          id: 'test-merchant',
          public_key: 'public-key'
        }
      ] as any);

      mockCrypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('body-hash')
      } as any);

      mockCrypto.verify.mockReturnValue(false as any);

      const result = await merchantKeyService.verifySignature(
        signature,
        timestamp,
        method,
        path,
        body
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('签名验证失败');
    });
  });

  describe('disableMerchantKey', () => {
    it('应该禁用商户密钥', async () => {
      const merchantId = 'test-merchant';

      jest.spyOn(Date, 'now').mockReturnValue(1234567890);

      await merchantKeyService.disableMerchantKey(merchantId);

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: merchantId },
        data: {
          key_status: 0,
          updated_at: BigInt(1234567890)
        }
      });
    });
  });

  describe('rotateMerchantKeys', () => {
    it('应该轮换商户密钥', async () => {
      const merchantId = 'test-merchant';
      const mockHmacKey = {
        key: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      };

      jest.spyOn(merchantKeyService, 'generateMerchantKeys')
        .mockResolvedValue(mockHmacKey);

      const result = await merchantKeyService.rotateMerchantKeys(merchantId);

      expect(merchantKeyService.generateMerchantKeys)
        .toHaveBeenCalledWith(merchantId);
      expect(result).toEqual(mockHmacKey);
    });
  });
});