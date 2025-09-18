import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/database';

/**
 * HMAC密钥接口
 */
export interface HmacKey {
  key: string;
}

/**
 * 签名验证结果接口
 */
export interface SignatureVerificationResult {
  success: boolean;
  merchantId?: string;
  error?: string;
}

/**
 * 签名payload接口
 */
export interface SignaturePayload {
  merchant_id: string;
  timestamp: number;
  method: string;
  path: string;
  body_hash: string;
}

/**
 * 商户密钥管理服务
 * 负责密钥的生成、验证和管理
 */
export class MerchantKeyService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  /**
   * 生成HMAC密钥
   * @returns HMAC密钥
   */
  generateHmacKey(): HmacKey {
    const key = crypto.randomBytes(32).toString('hex');
    return { key };
  }

  /**
   * 为商户生成并保存HMAC密钥
   * @param merchantId 商户ID
   * @returns 生成的HMAC密钥
   */
  async generateMerchantKeys(merchantId: string): Promise<HmacKey> {
    const hmacKey = this.generateHmacKey();

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        hmac_key: hmacKey.key,
        key_created_at: BigInt(Date.now()),
        key_status: 1
      }
    });

    return hmacKey;
  }

  /**
   * 获取商户的HMAC密钥
   * @param merchantId 商户ID
   * @returns HMAC密钥字符串
   */
  async getMerchantHmacKey(merchantId: string): Promise<string | null> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { hmac_key: true, key_status: true }
    });

    if (!merchant || merchant.key_status !== 1 || !merchant.hmac_key) {
      return null;
    }

    return merchant.hmac_key;
  }

  /**
   * 创建签名payload
   * @param merchantId 商户ID
   * @param timestamp 时间戳
   * @param method HTTP方法
   * @param path 请求路径
   * @param body 请求体
   * @returns 签名payload
   */
  createSignaturePayload(
    merchantId: string,
    timestamp: number,
    method: string,
    path: string,
    body: any
  ): SignaturePayload {
    const bodyHash = crypto.createHash('sha256')
      .update(JSON.stringify(body || {}))
      .digest('hex');

    return {
      merchant_id: merchantId,
      timestamp,
      method: method.toUpperCase(),
      path,
      body_hash: bodyHash
    };
  }

  /**
   * 使用HMAC密钥对payload进行签名
   * @param payload 签名payload
   * @param hmacKey HMAC密钥
   * @returns base64编码的签名
   */
  signPayload(payload: SignaturePayload, hmacKey: string): string {
    const payloadString = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', hmacKey)
      .update(payloadString)
      .digest('base64');
    
    return signature;
  }

  /**
   * 验证签名并提取商户ID
   * @param signature base64编码的签名
   * @param timestamp 时间戳
   * @param method HTTP方法
   * @param path 请求路径
   * @param body 请求体
   * @returns 验证结果
   */
  async verifySignature(
    signature: string,
    timestamp: number,
    method: string,
    path: string,
    body: any
  ): Promise<SignatureVerificationResult> {
    try {
      // 验证时间戳（5分钟内有效）
      const now = Date.now();
      if (Math.abs(now - timestamp) > 300000) {
        return { success: false, error: '请求已过期' };
      }

      // 获取所有有效的商户HMAC密钥
      const merchants = await this.prisma.merchant.findMany({
        where: {
          key_status: 1,
          hmac_key: { not: null }
        },
        select: {
          id: true,
          hmac_key: true
        }
      });

      // 尝试用每个商户的HMAC密钥验证签名
      for (const merchant of merchants) {
        if (!merchant.hmac_key) continue;

        try {
          const payload = this.createSignaturePayload(
            merchant.id,
            timestamp,
            method,
            path,
            body
          );

          const expectedSignature = this.signPayload(payload, merchant.hmac_key);

          if (expectedSignature === signature) {
            return {
              success: true,
              merchantId: merchant.id
            };
          }
        } catch (error) {
          // 继续尝试下一个商户
          continue;
        }
      }

      return { success: false, error: '签名验证失败' };
    } catch (error) {
      console.error('签名验证错误:', error);
      return { success: false, error: '签名验证过程中发生错误' };
    }
  }

  /**
   * 禁用商户密钥
   * @param merchantId 商户ID
   */
  async disableMerchantKey(merchantId: string): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        key_status: 0,
        updated_at: BigInt(Date.now())
      }
    });
  }

  /**
   * 轮换商户密钥
   * @param merchantId 商户ID
   * @returns 新的HMAC密钥
   */
  async rotateMerchantKeys(merchantId: string): Promise<HmacKey> {
    return await this.generateMerchantKeys(merchantId);
  }
}

export const merchantKeyService = new MerchantKeyService();