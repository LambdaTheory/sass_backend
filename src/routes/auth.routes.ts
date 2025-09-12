import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { LoginRequest, JWTPayload } from '../types';
import { prisma } from '../utils/database';
import { success, badRequest, unauthorized, internalError } from '../utils/response';

const router = Router();

/**
 * 用户登录
 * POST /auth/login
 */
router.post('/login', async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { username, password } = req.body;

    // 输入验证
    if (!username || !password) {
      const errorResponse = badRequest('用户名和密码不能为空');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 清理和验证用户名
    const cleanUsername = username.toString().trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 100) {
      const errorResponse = badRequest('用户名长度必须在3-100个字符之间');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 用户名格式验证（支持传统用户名和邮箱格式）
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const usernameRegex = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
    
    if (!emailRegex.test(cleanUsername) && !usernameRegex.test(cleanUsername)) {
      const errorResponse = badRequest('用户名格式不正确，请使用有效的用户名或邮箱地址');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 密码长度验证
    if (password.length < 6 || password.length > 128) {
      const errorResponse = badRequest('密码长度必须在6-128个字符之间');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (!user || user.status !== 1) {
      const errorResponse = unauthorized('商户已被禁用');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 验证密码（现在密码统一存储在User表中）
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const errorResponse = unauthorized('用户名或密码错误');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    // 根据用户类型获取角色和商户信息
    let userRole: string;
    let merchantId: string | undefined;

    if (user.user_type === 'SUPER_ADMIN') {
      // 验证超管记录是否存在且有效
      if (!user.super_admin_id) {
        const errorResponse = unauthorized('用户名或密码错误');
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: user.super_admin_id }
      });
      if (!superAdmin) {
        const errorResponse = unauthorized('用户名或密码错误');
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
      userRole = 'SUPER_ADMIN';
    } else if (user.user_type === 'MERCHANT_OWNER') {
      // 商户所有者登录
      if (user.merchant_id) {
        const merchant = await prisma.merchant.findUnique({
          where: { id: user.merchant_id }
        });
        if (!merchant || merchant.status !== 1) {
          const errorResponse = unauthorized('商户已被禁用');
          res.status(errorResponse.code).json(errorResponse);
          return;
        }
        userRole = 'MERCHANT_OWNER';
        merchantId = merchant.id;
      } else {
        const errorResponse = unauthorized('用户名或密码错误');
        res.status(errorResponse.code).json(errorResponse);
        return;
      }
    } else {
       const errorResponse = unauthorized('用户名或密码错误');
       res.status(errorResponse.code).json(errorResponse);
       return;
     }

    // 生成JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET 环境变量未设置');
      const errorResponse = internalError('服务器配置错误');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      userType: user.user_type,
      role: userRole as any,
      merchantId
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

    res.json(success({
      token,
      user: {
        id: user.id,
        username: user.username,
        merchantId
      }
    }, '登录成功'));

  } catch (error) {
    console.error('登录错误:', error);
    const errorResponse = internalError('登录过程中发生错误');
    res.status(errorResponse.code).json(errorResponse);
  }
});

/**
 * 验证token有效性
 * GET /auth/verify
 */
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const errorResponse = unauthorized('未提供有效的认证token');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      const errorResponse = internalError('服务器配置错误');
      res.status(errorResponse.code).json(errorResponse);
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      
      // 检查用户是否仍然存在且有效
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || user.status !== 1) {
        const errorResponse = unauthorized('用户不存在或已被禁用');
        res.status(errorResponse.code).json(errorResponse);
        return;
      }

      res.json(success({
        valid: true,
        user: {
          id: decoded.userId,
          username: decoded.username,
          userType: decoded.userType,
          role: decoded.role,
          merchantId: decoded.merchantId
        }
      }, 'token验证成功'));
    } catch (jwtError) {
      const errorResponse = unauthorized('token无效或已过期');
      res.status(errorResponse.code).json(errorResponse);
    }
  } catch (error) {
    console.error('token验证错误:', error);
    const errorResponse = internalError('验证过程中发生错误');
    res.status(errorResponse.code).json(errorResponse);
  }
});


/**
 * 用户登出（可选实现，主要用于清理客户端token）
 * POST /auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  // 由于JWT是无状态的，服务端登出主要是告知客户端清理token
  // 如果需要实现token黑名单，可以在这里添加相关逻辑
  res.json(success(null, '登出成功'));
});

export default router;