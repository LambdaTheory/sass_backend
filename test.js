const crypto = require("crypto");

// 查询玩家道具测试
function testQueryPlayerItems() {
  const requestBody = {
    app_id: "8220fd1f-8d10-4c83-8ca4-8baa909b1303",
    player_id: "1234",
  };
  const payload = {
    merchant_id: "214764ab-5848-4777-a55a-5efd3dd350ca",
    timestamp: Date.now(),
    method: "POST",
    path: "/query",
    body_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(requestBody || {}))
      .digest("hex"),
  };
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac(
      "sha256",
      "28a9c2f2cd7f7bb7d364107efce7fd4f9f7e6a7ad0d0a1570b34d60824bbdc37"
    )
    .update(payloadString)
    .digest("base64");
  
  return fetch("http://localhost:3389/api/merchant/player-items/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": payload.timestamp.toString(),
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Success! Response:', JSON.stringify(data, null, 2));
      
      // 验证是否包含latest_idempotency_key字段
      if (data.data && data.data.items && data.data.items.length > 0) {
        const firstItem = data.data.items[0];
        if (firstItem.latest_idempotency_key !== undefined) {
          console.log('✅ latest_idempotency_key字段存在:', firstItem.latest_idempotency_key);
          return firstItem.latest_idempotency_key; // 返回幂等性键供后续使用
        } else {
          console.log('❌ latest_idempotency_key字段缺失');
        }
      }
      return null;
    } else {
      const errorText = await res.text();
      console.log('Error response:', errorText);
      return null;
    }
  }).catch(err => {
    console.error('Request failed:', err.message);
    return null;
  });
}

// 发放道具给玩家测试
function testGrantPlayerItem() {
  const requestBody = {
    app_id: "8220fd1f-8d10-4c83-8ca4-8baa909b1303",
    player_id: "1234",
    item_id: "tpl_1757993934853_vykexv5y9", // 道具ID
    amount: 5,
    remark: "测试发放道具"
  };
  const payload = {
    merchant_id: "214764ab-5848-4777-a55a-5efd3dd350ca",
    timestamp: Date.now(),
    method: "POST",
    path: "/grant",
    body_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(requestBody || {}))
      .digest("hex"),
  };
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac(
      "sha256",
      "28a9c2f2cd7f7bb7d364107efce7fd4f9f7e6a7ad0d0a1570b34d60824bbdc37"
    )
    .update(payloadString)
    .digest("base64");
  
  console.log('\n=== 测试发放道具 ===');
  fetch("http://localhost:3389/api/merchant/player-items/grant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": payload.timestamp.toString(),
      "X-Idempotency-Key": `grant-test-${Date.now()}` // 添加幂等性键
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Success! Response:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await res.text();
      console.log('Error response:', errorText);
    }
  }).catch(err => {
    console.error('Request failed:', err.message);
  });
}

// 消费玩家道具测试
function testConsumePlayerItem(idempotencyKey = null) {
  const requestBody = {
    app_id: "8220fd1f-8d10-4c83-8ca4-8baa909b1303",
    player_id: "1234",
    amount: 1,
    remark: "测试消费道具"
  };
  const payload = {
    merchant_id: "214764ab-5848-4777-a55a-5efd3dd350ca",
    timestamp: Date.now(),
    method: "POST",
    path: "/tpl_1757993934853_vykexv5y9/consume", // 消费道具ID
    body_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(requestBody || {}))
      .digest("hex"),
  };
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac(
      "sha256",
      "28a9c2f2cd7f7bb7d364107efce7fd4f9f7e6a7ad0d0a1570b34d60824bbdc37"
    )
    .update(payloadString)
    .digest("base64");
  
  // 使用传入的幂等性键或生成新的
  const useIdempotencyKey = idempotencyKey || `consume-test-${Date.now()}`;
  
  console.log('\n=== 测试消费道具 ===');
  console.log('使用幂等性键:', useIdempotencyKey);
  
  return fetch("http://localhost:3389/api/merchant/player-items/tpl_1757993934853_vykexv5y9/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": payload.timestamp.toString(),
      "X-Idempotency-Key": useIdempotencyKey
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Success! Response:', JSON.stringify(data, null, 2));
      return data;
    } else {
      const errorText = await res.text();
      console.log('Error response:', errorText);
      return null;
    }
  }).catch(err => {
    console.error('Request failed:', err.message);
    return null;
  });
}

// 综合测试函数：先查询获取幂等性键，再使用该键进行消费测试
async function runComprehensiveTest() {
  console.log('\n=== 开始综合测试 ===');
  
  // 1. 先查询道具，获取最新的幂等性键
  console.log('\n步骤1: 查询玩家道具，获取最新幂等性键');
  const latestIdempotencyKey = await testQueryPlayerItems();
  
  if (latestIdempotencyKey) {
    console.log('\n步骤2: 使用获取到的幂等性键进行消费测试');
    await testConsumePlayerItem(latestIdempotencyKey);
    
    // 等待一段时间后再次查询，验证幂等性键是否更新
    console.log('\n步骤3: 等待2秒后再次查询，验证幂等性键是否更新');
    setTimeout(async () => {
      const newIdempotencyKey = await testQueryPlayerItems();
      if (newIdempotencyKey && newIdempotencyKey !== latestIdempotencyKey) {
        console.log('✅ 幂等性键已更新，功能正常');
      } else if (newIdempotencyKey === latestIdempotencyKey) {
        console.log('⚠️ 幂等性键未更新，可能消费失败或功能异常');
      }
    }, 2000);
  } else {
    console.log('❌ 未能获取到幂等性键，使用默认键进行消费测试');
    await testConsumePlayerItem();
  }
}

// 单独测试函数
function runIndividualTests() {
  console.log('\n=== 开始单独测试 ===');
  testQueryPlayerItems();
  
  // 延迟执行发放道具测试
  setTimeout(() => {
    testGrantPlayerItem();
  }, 2000);
 }
 
 // 主函数
 function main() {
  console.log('开始测试...');
  console.log('选择测试模式:');
  console.log('1. 综合测试 (推荐) - 验证完整的幂等性键流程');
  console.log('2. 单独测试 - 分别测试查询和消费接口');
  
  // 默认运行综合测试
  runComprehensiveTest();
  
  // 如果需要运行单独测试，可以注释上面一行，取消注释下面一行
  // runIndividualTests();
}

// 执行测试
main();
