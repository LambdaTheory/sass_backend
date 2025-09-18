import { Request, Response, NextFunction } from 'express';
import { merchantKeyService } from '../services/merchant-key.service';

/**
 * 扩展Request接口，添加商户信息
 */
export interface MerchantAuthRequest extends Request {
  merchant?: {
    id: string;
  };
}

/**
 * 商户签名认证中间件
 * 验证请求头中的签名，确认商户身份
 */
export const merchantAuthMiddleware = async (
  req: MerchantAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 获取请求头
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    // 验证必需的请求头
    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing X-Signature header'
      });
      return;
    }

    if (!timestamp) {
      res.status(401).json({
        success: false,
        error: 'Missing X-Timestamp header'
      });
      return;
    }

    // 验证时间戳格式
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      res.status(401).json({
        success: false,
        error: 'Invalid timestamp format'
      });
      return;
    }

    // 获取请求信息
    const method = req.method;
    const path = req.path;
    const body = req.body;

    // 验证签名
    const verificationResult = await merchantKeyService.verifySignature(
      signature,
      timestampNum,
      method,
      path,
      body
    );

    if (!verificationResult.success) {
      res.status(401).json({
        success: false,
        error: verificationResult.error || 'Signature verification failed'
      });
      return;
    }

    // 将商户信息添加到请求对象
    req.merchant = {
      id: verificationResult.merchantId!
    };

    next();
  } catch (error) {
    console.error('商户认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during authentication'
    });
  }
};

/**
 * 可选的商户认证中间件
 * 如果提供了签名则验证，否则继续执行
 */
export const optionalMerchantAuthMiddleware = async (
  req: MerchantAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    // 如果没有提供签名，则跳过验证
    if (!signature || !timestamp) {
      next();
      return;
    }

    // 如果提供了签名，则进行验证
    await merchantAuthMiddleware(req, res, next);
  } catch (error) {
    console.error('可选商户认证中间件错误:', error);
    next();
  }
};

/**
 * 验证商户是否有权限访问指定的应用
 * @param appId 应用ID
 */
export const validateMerchantAppAccess = (appId?: string) => {
  return async (
    req: MerchantAuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.merchant) {
        res.status(401).json({
          success: false,
          error: 'Merchant authentication required'
        });
        return;
      }

      // 如果没有指定appId，从请求参数或body中获取
      const targetAppId = appId || 
        req.query.app_id as string || 
        req.body?.app_id as string;

      if (!targetAppId) {
        res.status(400).json({
          success: false,
          error: 'app_id is required'
        });
        return;
      }

      // 这里可以添加验证商户是否有权限访问指定应用的逻辑
      // 目前简化处理，后续可以扩展
      
      next();
    } catch (error) {
      console.error('商户应用权限验证错误:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during app access validation'
      });
    }
  };
};