/**
 * 统一响应格式工具函数
 */

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 成功响应
 * @param data 响应数据
 * @param message 响应消息
 * @param code 响应码，默认200
 */
export const success = <T>(data?: T, message: string = '操作成功', code: number = 200): ApiResponse<T> => {
  return {
    code,
    message,
    data
  };
};

/**
 * 错误响应
 * @param message 错误消息
 * @param code 错误码，默认500
 * @param data 错误数据（可选）
 */
export const error = <T>(message: string, code: number = 500, data?: T): ApiResponse<T> => {
  return {
    code,
    message,
    data
  };
};

/**
 * 参数错误响应
 * @param message 错误消息
 * @param data 错误数据（可选）
 */
export const badRequest = <T>(message: string = '参数错误', data?: T): ApiResponse<T> => {
  return error(message, 400, data);
};

/**
 * 未授权响应
 * @param message 错误消息
 * @param data 错误数据（可选）
 */
export const unauthorized = <T>(message: string = '未授权', data?: T): ApiResponse<T> => {
  return error(message, 401, data);
};

/**
 * 禁止访问响应
 * @param message 错误消息
 * @param data 错误数据（可选）
 */
export const forbidden = <T>(message: string = '禁止访问', data?: T): ApiResponse<T> => {
  return error(message, 403, data);
};

/**
 * 资源未找到响应
 * @param message 错误消息
 * @param data 错误数据（可选）
 */
export const notFound = <T>(message: string = '资源未找到', data?: T): ApiResponse<T> => {
  return error(message, 404, data);
};

/**
 * 服务器内部错误响应
 * @param message 错误消息
 * @param data 错误数据（可选）
 */
export const internalError = <T>(message: string = '服务器内部错误', data?: T): ApiResponse<T> => {
  return error(message, 500, data);
};