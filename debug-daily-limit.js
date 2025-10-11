// 简单测试每日限制逻辑
const todayGranted = 2;
const amount = 2;
const dailyLimit = 3;

console.log('今日已发放:', todayGranted);
console.log('本次发放:', amount);
console.log('每日限制:', dailyLimit);
console.log('总计:', todayGranted + amount);
console.log('是否超限:', todayGranted + amount > dailyLimit);

if (todayGranted + amount > dailyLimit) {
  console.log('应该返回失败');
} else {
  console.log('应该返回成功');
}