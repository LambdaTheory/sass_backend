// 简单的API测试脚本，验证item_id筛选功能
const http = require('http');

const testData = {
  hostname: 'localhost',
  port: 3389,
  path: '/api/player-items/list?app_id=c5353c4f-7aaf-407e-90fa-d2daf942a96a&merchant_id=d82f4ab7-cb0f-4a7c-b25d-19c2a81a810b&current=1&pageSize=10&player_id=12&item_id=tpl_1758177487378_7snzzkyte',
  method: 'GET',
  headers: {
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Origin': 'http://localhost:3000',
    'Referer': 'http://localhost:3000/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhOWJjNjIxNy0wYzU1LTRkODgtYWZjMS02MmY1MTI4MjM5MGEiLCJ1c2VybmFtZSI6ImFkbWluIiwidXNlclR5cGUiOiJTVVBFUl9BRE1JTiIsInJvbGUiOiJTVVBFUl9BRE1JTiIsImlhdCI6MTc1ODE2MzU1MiwiZXhwIjoxNzU4MjQ5OTUyfQ.4Q78BzpmtcC26ykNuAMLDvntnsEsWKy3vAvJV8vJ8fY',
    'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"'
  }
};

console.log('测试API接口: /api/player-items/list');
console.log('测试参数包含 item_id 筛选:', testData.path.includes('item_id='));
console.log('\n发送请求...');

const req = http.request(testData, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log(`响应头:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);
      console.log('\n响应结果:');
      console.log('成功:', jsonData.success);
      console.log('消息:', jsonData.message);
      
      if (jsonData.data && jsonData.data.items) {
        console.log('道具数量:', jsonData.data.items.length);
        if (jsonData.data.items.length > 0) {
          console.log('第一个道具的item_id:', jsonData.data.items[0].item_id);
          console.log('筛选是否生效:', jsonData.data.items.every(item => 
            item.item_id === 'tpl_1758177487378_7snzzkyte'
          ));
        }
        console.log('分页信息:', jsonData.data.pagination);
      }
    } catch (error) {
      console.log('\n原始响应:', data);
      console.log('解析错误:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('请求错误:', error);
});

req.end();