// Jest测试环境设置文件
// 在所有测试运行前执行的设置代码

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';

// 模拟console方法以减少测试输出噪音
global.console = {
  ...console,
  // 保留error和warn用于调试
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// 设置测试超时时间
jest.setTimeout(10000);