# 道具背包流水导出接口文档

## 接口概述

本接口提供B端商户导出道具背包流水的功能，支持按多种条件筛选并导出为Excel格式(.xlsx)。

## 接口信息

- **接口路径**: `POST /merchant/player-items/export`
- **认证方式**: 商户签名认证
- **返回格式**: Excel文件流(.xlsx)

## 请求参数

### 请求体参数 (JSON)

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| merchant_id | string | 否 | 商户ID，默认使用认证商户ID |
| app_id | string | 是 | 应用ID |
| player_id | string | 否 | 玩家ID，用于筛选特定玩家的流水 |
| item_id | string | 否 | 道具ID，用于筛选特定道具的流水 |
| start_time | number | 否 | 开始时间戳（秒），筛选此时间之后的流水 |
| end_time | number | 否 | 结束时间戳（秒），筛选此时间之前的流水 |
| record_type | string | 否 | 操作类型，可选值：GRANT（发放）、CONSUME（消费）、EXPIRE（过期） |

### 请求示例

```bash
curl -X POST "https://your-domain.com/merchant/player-items/export" \
  -H "Content-Type: application/json" \
  -H "X-Merchant-ID: your-merchant-id" \
  -H "X-Timestamp: 1640995200" \
  -H "X-Signature: your-signature" \
  -d '{
    "app_id": "app-123",
    "player_id": "player-456",
    "start_time": 1640995200,
    "end_time": 1641081600,
    "record_type": "GRANT"
  }'
```

## 响应说明

### 成功响应

- **状态码**: 200
- **Content-Type**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition**: `attachment; filename="道具背包流水_商户ID_应用ID_时间戳.xlsx"`
- **响应体**: Excel文件的二进制数据

### 错误响应

| 状态码 | 错误信息 | 说明 |
|--------|----------|------|
| 400 | app_id 是必填参数 | 缺少必填的应用ID |
| 400 | 无权限访问指定商户的数据 | merchant_id与认证商户不匹配 |
| 400 | start_time 参数格式错误 | 时间戳格式不正确 |
| 400 | end_time 参数格式错误 | 时间戳格式不正确 |
| 400 | 开始时间不能大于结束时间 | 时间范围设置错误 |
| 400 | record_type 参数值无效 | 操作类型值不在允许范围内 |
| 401 | 认证失败 | 商户签名验证失败 |
| 500 | 导出失败 | 服务器内部错误 |

## Excel文件格式

### 文件结构

导出的Excel文件包含以下信息：

1. **文件信息区域**（前8行）：
   - 标题：道具背包流水导出
   - 商户ID和应用ID
   - 时间范围（如果指定）
   - 道具ID（如果指定）
   - 玩家ID（如果指定）
   - 总记录数
   - 导出时间

2. **数据表格区域**（第9行开始）：
   - 表头行
   - 数据行

### 表格列说明

| 列名 | 说明 | 示例 |
|------|------|------|
| 流水ID | 流水记录的唯一标识 | 12345 |
| 商户ID | 商户标识 | merchant-123 |
| 应用ID | 应用标识 | app-456 |
| 玩家ID | 玩家标识 | player-789 |
| 道具ID | 道具模板标识 | item-001 |
| 道具名称 | 道具的显示名称 | 金币 |
| 数量 | 操作的道具数量（正数为增加，负数为减少） | 100 |
| 操作类型 | 操作类型的中文描述 | 发放/消费/过期 |
| 操作后余额 | 操作完成后的道具余额 | 1000 |
| 系统备注 | 系统生成的备注信息 | idempotency:key123 |
| 用户备注 | 用户自定义的备注信息 | 每日签到奖励 |
| 创建时间 | 流水记录的创建时间 | 2022/1/1 12:00:00 |

### 行颜色说明

- **淡绿色**：发放操作（GRANT）
- **淡橙色**：消费操作（CONSUME）
- **淡灰色**：过期操作（EXPIRE）

## 使用场景

1. **财务对账**：导出指定时间范围内的所有流水进行财务核对
2. **玩家查询**：导出特定玩家的道具变动历史
3. **道具分析**：导出特定道具的发放和消费情况
4. **运营报表**：定期导出数据用于运营分析

## 注意事项

1. **数据量限制**：建议单次导出不超过10万条记录，避免超时
2. **时间范围**：建议设置合理的时间范围，避免查询过大的数据集
3. **文件大小**：大量数据可能导致Excel文件较大，请注意下载时间
4. **编码格式**：文件名使用UTF-8编码，支持中文显示
5. **缓存策略**：相同查询条件的导出结果可能会有短暂缓存

## 商户签名认证

请参考商户认证文档，确保正确设置以下请求头：

- `X-Merchant-ID`: 商户ID
- `X-Timestamp`: 当前时间戳
- `X-Signature`: 使用HMAC-SHA256生成的签名

## 错误处理建议

1. **参数验证**：在发送请求前验证所有参数的格式和范围
2. **超时处理**：设置合理的请求超时时间（建议60秒以上）
3. **重试机制**：对于网络错误可以实现重试机制
4. **错误日志**：记录导出失败的详细信息用于问题排查

## 示例代码

### JavaScript/Node.js

```javascript
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

async function exportPlayerItemRecords(params) {
  const merchantId = 'your-merchant-id';
  const secretKey = 'your-secret-key';
  const timestamp = Math.floor(Date.now() / 1000);
  
  // 生成签名
  const signData = `${merchantId}${timestamp}${JSON.stringify(params)}`;
  const signature = crypto.createHmac('sha256', secretKey).update(signData).digest('hex');
  
  try {
    const response = await axios.post('https://your-domain.com/merchant/player-items/export', params, {
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-ID': merchantId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      responseType: 'arraybuffer'
    });
    
    // 保存文件
    const filename = `export_${Date.now()}.xlsx`;
    fs.writeFileSync(filename, response.data);
    console.log(`导出成功：${filename}`);
    
  } catch (error) {
    console.error('导出失败：', error.response?.data || error.message);
  }
}

// 使用示例
exportPlayerItemRecords({
  app_id: 'app-123',
  start_time: 1640995200,
  end_time: 1641081600
});
```

### Python

```python
import requests
import hashlib
import hmac
import json
import time

def export_player_item_records(params):
    merchant_id = 'your-merchant-id'
    secret_key = 'your-secret-key'
    timestamp = int(time.time())
    
    # 生成签名
    sign_data = f"{merchant_id}{timestamp}{json.dumps(params, separators=(',', ':'))}"
    signature = hmac.new(
        secret_key.encode('utf-8'),
        sign_data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        'Content-Type': 'application/json',
        'X-Merchant-ID': merchant_id,
        'X-Timestamp': str(timestamp),
        'X-Signature': signature
    }
    
    try:
        response = requests.post(
            'https://your-domain.com/merchant/player-items/export',
            json=params,
            headers=headers,
            timeout=60
        )
        
        if response.status_code == 200:
            filename = f"export_{int(time.time())}.xlsx"
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"导出成功：{filename}")
        else:
            print(f"导出失败：{response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"导出失败：{str(e)}")

# 使用示例
export_player_item_records({
    'app_id': 'app-123',
    'start_time': 1640995200,
    'end_time': 1641081600
})
```

## 更新日志

- **v1.0.0** (2024-01-01): 初始版本发布
  - 支持基本的流水导出功能
  - 支持多种筛选条件
  - 支持Excel格式导出
  - 包含完整的单元测试