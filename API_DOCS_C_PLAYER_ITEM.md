# C端商户道具接口文档

## 概述

本文档描述了C端商户专用的道具接口，使用商户签名认证方式，无需传统的JWT token。

## 认证方式

### 商户签名认证

所有接口都需要在请求头中包含以下信息：

```
X-Signature: {签名}
X-Timestamp: {时间戳}
Content-Type: application/json
```

**签名生成规则：**

签名使用HMAC-SHA256算法，具体步骤如下：

1. **创建签名载荷（Payload）**：
   ```json
   {
     "merchant_id": "your_merchant_id",
     "timestamp": 1640995200,
     "method": "POST",
     "path": "/merchant/player-items/query",
     "body_hash": "sha256_hash_of_request_body"
   }
   ```

2. **计算请求体哈希**：
   ```go
   import (
       "crypto/sha256"
       "encoding/json"
       "fmt"
   )
   
   var bodyBytes []byte
   if requestBody != nil {
       bodyBytes, _ = json.Marshal(requestBody)
   } else {
       bodyBytes = []byte("{}")
   }
   bodyHash := fmt.Sprintf("%x", sha256.Sum256(bodyBytes))
   ```

3. **生成签名**：
   ```go
   import (
       "crypto/hmac"
       "crypto/sha256"
       "encoding/base64"
       "encoding/json"
   )
   
   payloadBytes, _ := json.Marshal(payload)
   h := hmac.New(sha256.New, []byte(hmacKey))
   h.Write(payloadBytes)
   signature := base64.StdEncoding.EncodeToString(h.Sum(nil))
   ```

**完整签名示例（Go）**：
```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

type Payload struct {
	MerchantID string `json:"merchant_id"`
	Timestamp  int64  `json:"timestamp"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	BodyHash   string `json:"body_hash"`
}

func generateSignature(merchantID, hmacKey, method, path string, body interface{}, timestamp int64) (string, error) {
	// 1. 计算请求体哈希
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return "", fmt.Errorf("marshal body: %w", err)
		}
	} else {
		bodyBytes = []byte("{}")
	}
	bodyHash := fmt.Sprintf("%x", sha256.Sum256(bodyBytes))
	
	// 2. 创建签名载荷
	payload := Payload{
		MerchantID: merchantID,
		Timestamp:  timestamp,
		Method:     method,
		Path:       path,
		BodyHash:   bodyHash,
	}
	
	// 3. 生成签名
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}
	
	h := hmac.New(sha256.New, []byte(hmacKey))
	h.Write(payloadBytes)
	signature := base64.StdEncoding.EncodeToString(h.Sum(nil))
	
	return signature, nil
}

// 使用示例
func main() {
	merchantID := "your_merchant_id"
	hmacKey := "your_hmac_key"
	method := "POST"
	path := "/merchant/player-items/query"
	body := map[string]string{
		"app_id":    "app_123",
		"player_id": "player_456",
	}
	timestamp := time.Now().Unix()
	
	signature, err := generateSignature(merchantID, hmacKey, method, path, body, timestamp)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	fmt.Printf("Signature: %s\n", signature)
}
```

**时间戳要求：**
- 必须为Unix时间戳（毫秒级，13位数字）
- 请求时间不能偏差服务器时间过多（5分钟内有效）
- 生成方式：`time.Now().UnixMilli()`

**重要注意事项：**
1. **JSON序列化**：请求体必须使用 `JSON.stringify()` 进行序列化，空请求体使用 `{}`
2. **HTTP方法**：必须大写（如 POST、GET）
3. **请求路径**：使用完整路径，不包含域名和查询参数
4. **字符编码**：所有字符串使用UTF-8编码
5. **签名有效期**：签名在5分钟内有效，超时需重新生成

## 接口列表

### 1. 获取玩家道具列表

**接口地址：** `POST /api/merchant/player-items/query`

**请求方式：** POST

**认证方式：** 商户签名

**用途说明：** 用于获取某个玩家的所有道具列表，支持分页和多种筛选条件，适用于展示玩家背包、道具库存等场景。可以按时间范围、道具ID等条件筛选，返回分页信息。

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| merchant_id | string | 否 | 商户ID（如果提供，必须与认证商户一致） |
| app_id | string | 是 | 应用ID |
| player_id | string | 是 | 玩家ID |
| item_id | string | 否 | 道具模板ID（用于筛选特定道具） |
| start_time | number | 否 | 开始时间戳 |
| end_time | number | 否 | 结束时间戳 |
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |

**请求示例：**

```json
{
  "app_id": "app_123",
  "player_id": "player_456",
  "item_id": "item_789",
  "page": 1,
  "pageSize": 20
}
```

**响应参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.items | array | 道具列表 |
| data.items[].id | number | 道具记录ID |
| data.items[].merchant_id | string | 商户ID |
| data.items[].app_id | string | 应用ID |
| data.items[].player_id | string | 玩家ID |
| data.items[].item_id | string | 道具模板ID |
| data.items[].item_name | string | 道具名称 |
| data.items[].amount | number | 道具数量 |
| data.items[].expire_time | number\|null | 过期时间戳（null表示永不过期） |
| data.items[].obtain_time | number | 获得时间戳 |
| data.items[].status | string | 道具状态（USABLE/UNUSABLE） |
| data.items[].latest_idempotency_key | string | 最新操作的幂等性键 |
| data.pagination | object | 分页信息 |
| data.pagination.page | number | 当前页码 |
| data.pagination.pageSize | number | 每页数量 |
| data.pagination.total | number | 总记录数 |
| data.pagination.totalPages | number | 总页数 |
| data.pagination.hasNext | boolean | 是否有下一页 |
| data.pagination.hasPrev | boolean | 是否有上一页 |
| message | string | 响应消息 |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "merchant_id": "merchant_123",
        "app_id": "app_123",
        "player_id": "player_456",
        "item_id": "item_789",
        "item_name": "金币",
        "amount": 100,
        "expire_time": null,
        "obtain_time": 1640995200,
        "status": "USABLE",
        "latest_idempotency_key": "key_123"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  },
  "message": "获取玩家背包道具列表成功"
}
```

### 2. 发放道具给玩家

**接口地址：** `POST /api/merchant/player-items/grant`

**请求方式：** POST

**认证方式：** 商户签名

**用途说明：** 用于向指定玩家发放道具，适用于游戏奖励、活动赠送、充值购买等场景。支持幂等性操作，确保同一请求不会重复发放道具。

**请求头：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| X-Idempotency-Key | string | 是 | 幂等性键，防止重复操作 |

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| app_id | string | 是 | 应用ID |
| player_id | string | 是 | 玩家ID |
| item_id | string | 是 | 道具模板ID |
| amount | number | 是 | 发放数量（正整数） |
| remark | string | 否 | 备注信息 |

**请求示例：**

```json
{
  "app_id": "app_123",
  "player_id": "player_456",
  "item_id": "item_789",
  "amount": 50,
  "remark": "活动奖励"
}
```

**响应参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.playerItem | object | 玩家道具信息 |
| data.itemRecord | object | 道具流水记录 |
| message | string | 响应消息 |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "playerItem": {
      "id": 1,
      "merchant_id": "merchant_123",
      "app_id": "app_123",
      "player_id": "player_456",
      "item_id": "item_789",
      "amount": 150,
      "status": "USABLE"
    },
    "itemRecord": {
      "id": 1,
      "record_type": "GRANT",
      "amount": 50,
      "remark": "活动奖励"
    }
  },
  "message": "道具发放成功"
}
```

### 3. 获取单个玩家道具详情

**接口地址：** `GET /api/merchant/player-items/{id}`

**请求方式：** GET

**认证方式：** 商户签名

**用途说明：** 用于查询单个特定道具记录的详细信息，适用于道具详情页展示、消费前检查道具状态等场景。通过道具记录ID直接获取单个道具的完整信息。

**路径参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 道具记录ID |

**查询参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| merchant_id | string | 否 | 商户ID |
| app_id | string | 是 | 应用ID |
| player_id | string | 是 | 玩家ID |

**请求示例：**

```
GET /merchant/player-items/1?app_id=app_123&player_id=player_456
```

**响应参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.item | object | 道具详情 |
| message | string | 响应消息 |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "item": {
      "id": 1,
      "merchant_id": "merchant_123",
      "app_id": "app_123",
      "player_id": "player_456",
      "item_id": "item_789",
      "item_name": "金币",
      "amount": 100,
      "expire_time": null,
      "obtain_time": 1640995200,
      "status": "USABLE",
      "latest_idempotency_key": "key_123"
    }
  },
  "message": "获取玩家道具详情成功"
}
```

### 4. 消费玩家道具

**接口地址：** `POST /api/merchant/player-items/{id}/consume`

**请求方式：** POST

**认证方式：** 商户签名

**用途说明：** 用于消费玩家已拥有的道具，适用于道具使用、物品兑换、功能解锁等场景。支持幂等性操作，确保同一消费请求不会重复执行。

**路径参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 道具记录ID |

**请求头：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| X-Idempotency-Key | string | 是 | 幂等性键，防止重复操作 |

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| app_id | string | 是 | 应用ID |
| player_id | string | 是 | 玩家ID |
| amount | number | 是 | 消费数量（正整数） |
| player_item_id | number | 否 | 指定消费的道具记录ID |
| remark | string | 否 | 备注信息 |

**请求示例：**

```json
{
  "app_id": "app_123",
  "player_id": "player_456",
  "amount": 10,
  "remark": "购买商品"
}
```

**响应参数：**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 请求是否成功 |
| data.playerItem | object | 更新后的玩家道具信息 |
| data.itemRecord | object | 道具流水记录 |
| message | string | 响应消息 |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "playerItem": {
      "id": 1,
      "merchant_id": "merchant_123",
      "app_id": "app_123",
      "player_id": "player_456",
      "item_id": "item_789",
      "amount": 90,
      "status": "USABLE"
    },
    "itemRecord": {
      "id": 2,
      "record_type": "CONSUME",
      "amount": 10,
      "remark": "购买商品"
    }
  },
  "message": "道具消费成功"
}
```

## 错误码说明

| HTTP状态码 | 错误类型 | 说明 |
|------------|----------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 认证失败（签名错误、时间戳无效等） |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

**错误响应格式：**

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

## 注意事项

1. **幂等性键（X-Idempotency-Key）**：
   - 发放和消费道具接口必须提供幂等性键
   - 相同的幂等性键重复请求会返回相同结果，不会重复执行
   - 建议使用UUID或其他唯一标识符

2. **时间戳验证**：
   - 请求时间戳不能偏差服务器时间过多
   - 建议在发送请求前同步服务器时间

3. **签名安全**：
   - 商户密钥需要妥善保管，不要泄露
   - 建议定期更换密钥

4. **分页限制**：
   - 查询接口最大每页100条记录
   - 建议合理设置分页大小以获得最佳性能

5. **道具状态**：
   - USABLE：可用状态
   - UNUSABLE：不可用状态（如已过期）

## 路径说明

在签名生成的 `payload` 中，`path` 字段需要根据不同的接口设置：

- **查询玩家道具列表**: `"/query"`
- **发放道具给玩家**: `"/grant"`  
- **获取单个玩家道具详情**: `"/{item_record_id}"` (其中 `{item_record_id}` 替换为实际的道具记录ID)
- **消费玩家道具**: `"/{item_id}/consume"` (其中 `{item_id}` 替换为实际的道具模板ID)

**注意**: 路径不包含 `/api/merchant/player-items` 前缀，只需要相对路径部分。实际请求URL为 `baseURL + "/api/merchant/player-items" + path`。

## 签名验证完整示例

### Go 示例

```go
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

type MerchantAPIClient struct {
	MerchantID string
	SecretKey  string
	BaseURL    string
}

type SignatureData struct {
	Signature string
	Timestamp int64
}

type Payload struct {
	MerchantID string `json:"merchant_id"`
	Timestamp  int64  `json:"timestamp"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	BodyHash   string `json:"body_hash"`
}

// NewMerchantAPIClient 创建新的API客户端
func NewMerchantAPIClient(merchantID, secretKey, baseURL string) *MerchantAPIClient {
	return &MerchantAPIClient{
		MerchantID: merchantID,
		SecretKey:  secretKey,
		BaseURL:    baseURL,
	}
}

// generateSignature 生成签名
func (c *MerchantAPIClient) generateSignature(method, path string, requestBody interface{}) (*SignatureData, error) {
	timestamp := time.Now().UnixMilli()
	
	// 计算请求体哈希
	var bodyBytes []byte
	if requestBody != nil {
		var err error
		bodyBytes, err = json.Marshal(requestBody)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
	} else {
		bodyBytes = []byte("{}")
	}
	
	bodyHash := fmt.Sprintf("%x", sha256.Sum256(bodyBytes))
	
	// 创建载荷
	payload := Payload{
		MerchantID: c.MerchantID,
		Timestamp:  timestamp,
		Method:     method,
		Path:       path,
		BodyHash:   bodyHash,
	}
	
	// 序列化载荷
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}
	
	// 生成HMAC签名
	h := hmac.New(sha256.New, []byte(c.SecretKey))
	h.Write(payloadBytes)
	signature := base64.StdEncoding.EncodeToString(h.Sum(nil))
	
	return &SignatureData{
		Signature: signature,
		Timestamp: timestamp,
	}, nil
}

// request 发送HTTP请求
func (c *MerchantAPIClient) request(method, path string, requestBody interface{}, idempotencyKey string) (map[string]interface{}, error) {
	// 生成签名
	sigData, err := c.generateSignature(method, path, requestBody)
	if err != nil {
		return nil, fmt.Errorf("generate signature: %w", err)
	}
	
	// 准备请求体
	var bodyReader io.Reader
	if requestBody != nil {
		bodyBytes, err := json.Marshal(requestBody)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}
	
	// 创建请求
 	req, err := http.NewRequest(method, c.BaseURL+"/api/merchant/player-items"+path, bodyReader)
 	if err != nil {
 		return nil, fmt.Errorf("create request: %w", err)
 	}
	
	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", sigData.Signature)
	req.Header.Set("X-Timestamp", strconv.FormatInt(sigData.Timestamp, 10))
	
	if idempotencyKey != "" {
		req.Header.Set("X-Idempotency-Key", idempotencyKey)
	}
	
	// 发送请求
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()
	
	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	
	return result, nil
}

// GetPlayerItems 获取玩家道具列表
 func (c *MerchantAPIClient) GetPlayerItems(appID, playerID string) (map[string]interface{}, error) {
 	requestBody := map[string]string{
 		"app_id":    appID,
 		"player_id": playerID,
 	}
 	return c.request("POST", "/query", requestBody, "")
 }
 
 // GrantPlayerItem 发放道具给玩家
 func (c *MerchantAPIClient) GrantPlayerItem(appID, playerID, itemID string, amount int, remark, idempotencyKey string) (map[string]interface{}, error) {
 	requestBody := map[string]interface{}{
 		"app_id":    appID,
 		"player_id": playerID,
 		"item_id":   itemID,
 		"amount":    amount,
 		"remark":    remark,
 	}
 	return c.request("POST", "/grant", requestBody, idempotencyKey)
 }
 
 // GetPlayerItemByID 获取单个玩家道具详情
 func (c *MerchantAPIClient) GetPlayerItemByID(itemRecordID, appID, playerID string) (map[string]interface{}, error) {
 	requestBody := map[string]string{
 		"app_id":    appID,
 		"player_id": playerID,
 		"item_id":   itemRecordID,
 	}
 	path := fmt.Sprintf("/%s", itemRecordID)
 	return c.request("POST", path, requestBody, "")
 }
 
 // ConsumePlayerItem 消费玩家道具
 func (c *MerchantAPIClient) ConsumePlayerItem(itemID, appID, playerID string, amount int, remark, idempotencyKey string) (map[string]interface{}, error) {
 	requestBody := map[string]interface{}{
 		"app_id":    appID,
 		"player_id": playerID,
 		"amount":    amount,
 		"remark":    remark,
 	}
 	path := fmt.Sprintf("/%s/consume", itemID)
 	return c.request("POST", path, requestBody, idempotencyKey)
 }

// 使用示例
func main() {
	// 创建客户端
	client := NewMerchantAPIClient(
		"your_merchant_id",
		"your_hmac_key",
		"https://api.example.com",
	)
	
	// 获取玩家道具列表
	result, err := client.GetPlayerItems("app_123", "player_456")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	fmt.Printf("Player items: %+v\n", result)
	
	// 发放道具
	result, err = client.GrantPlayerItem(
		"app_123",
		"player_456",
		"item_789",
		100,
		"活动奖励",
		"unique_key_123",
	)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	fmt.Printf("Grant result: %+v\n", result)
	
	// 消费道具
	result, err = client.ConsumePlayerItem(
		"item_789",
		"app_123",
		"player_456",
		10,
		"购买商品",
		"consume_key_456",
	)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	fmt.Printf("Consume result: %+v\n", result)
}
```

## 联系方式

如有技术问题或需要获取商户密钥，请联系技术支持。