// src/audioNative/core.ts
// Folia Android 扩展协议：WebView 内的前端"后端"层。
// 所有跨域请求经 Capacitor 原生插件 FoliaBridge（OkHttp + CookieManager）发出，
// 会话 Cookie 由系统 CookieManager 原生管理，登录即浏览器级体验。

import { registerPlugin } from '@capacitor/core';

export interface FoliaBridgeRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** true 时以 base64 返回响应体（图片等二进制），否则以 UTF-8 文本返回 */
  binary?: boolean;
  /** 手动跟随重定向，每一跳的 Set-Cookie 都写入 CookieManager（浏览器级行为） */
  followRedirects?: boolean;
}

export interface FoliaBridgeResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  /** 每一跳响应的 Set-Cookie 原文（原生层已同步写入 CookieManager，这里供上层解析） */
  setCookies?: string[];
}

interface FoliaBridgePlugin {
  request(options: FoliaBridgeRequestOptions): Promise<FoliaBridgeResponse>;
}

const FoliaBridge = registerPlugin<FoliaBridgePlugin>('FoliaBridge', {
  web: {
    // Web 环境没有原生桥；extension 模式仅面向 Android 容器。
    implement: async () => {
      throw new Error('FoliaBridge is only available on the Android build');
    },
  },
});

export const isNativeBridgeAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as any).Capacitor;
  return Boolean(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform());
};

export const bridgeRequest = (options: FoliaBridgeRequestOptions): Promise<FoliaBridgeResponse> => FoliaBridge.request(options);

/** 与 fetch 兼容的轻量 Response 替身：传输层只消费 ok/status/json/text/headers.get */
/** 与 fetch 的 Response 兼容的轻量替身类型：传输层只消费 ok/status/json/text/headers.get */
export type SimpleResponse = {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
  headers: { get(name: string): string | null };
};

/**
 * 工厂函数（刻意不用 class 声明：rolldown 对动态入口 chunk 里的类声明会裁剪出
 * "引用存在、定义丢失" 的坏产物，函数 + 对象字面量没有这个问题）。
 */
export const simpleResponse = (status: number, body: any, headers: Record<string, string> = {}): SimpleResponse => {
  const payload = body;
  const rawText = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const headerMap = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (payload && typeof payload === 'object' ? payload : JSON.parse(rawText)),
    text: async () => rawText,
    headers: { get: (name: string) => headerMap[name.toLowerCase()] ?? null },
  };
};

export const jsonResponse = (body: any, status = 200): SimpleResponse => simpleResponse(status, body);

export const httpErrorJsonResponse = (status: number, body: any): SimpleResponse => simpleResponse(status, body);

/** 统一的扩展协议错误：目标端点未实现（调用方按 404 → unsupported 处理，自动回落） */
export const extensionUnsupported = (message: string): SimpleResponse => simpleResponse(404, { code: 404, message });
