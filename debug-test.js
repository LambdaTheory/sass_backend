// 简单的调试脚本来验证mock调用次数
const mockTx = {
  $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  $queryRawUnsafe: jest.fn()
    .mockResolvedValueOnce([]) // 第一次调用：幂等性检查
    .mockResolvedValueOnce([{ total: 0 }]) // 第二次调用：持有上限检查
    .mockResolvedValueOnce([{ grand_total: 0 }]) // 第三次调用：总量检查
    .mockResolvedValueOnce([{ total: 2 }]) // 第四次调用：每日限制检查
    .mockResolvedValue([{ id: 1, amount: 2 }]), // 其他查询
};

console.log('Mock设置完成，预期调用次数：4次');
console.log('实际调用次数将在测试运行时显示');