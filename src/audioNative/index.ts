// src/audioNative/index.ts
// 扩展协议统一入口：当 VITE_*_API_BASE = 'extension' 时，传输层经此路由到 WebView 内实现。

import { handleNeteaseEndpoint } from './netease';
import { handleKugouEndpoint } from './kugou';
import { handleBodianRequest } from './bodian-impl';
import { handleQqEndpoint } from './qq';
import { bridgeRequest, extensionUnsupported, isNativeBridgeAvailable, jsonResponse, simpleResponse } from './core';
import { subscribeQrEvents } from './qqMqtt';
import { installReferenceChromeShim } from './referenceChromeShim';
import { callReferenceApi } from './referenceBridge';
import { readProviderSessionValue, writeProviderSessionValue } from '../services/onlineMusic/providerStorage';
import { exchangeCredential, sealSession } from './qq';

// ---- QQ 音乐三码通用登录（App 码 + MQTT 事件，照参考桌面版逐字节实现）----
interface AppQrState { qid: string; qrimg: string; events: Record<string, any>; socket?: WebSocket }

const deviceComm = () => {
  const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return {
    ct: 11, cv: 14090008, v: 14090008, chid: '10003505', tmeAppID: 'qqmusic',
    QIMEI: '', QIMEI36: '',
    OpenUDID: hex(16), udid: hex(16), OpenUDID2: hex(16),
    aid: hex(16), os_ver: '10', phonetype: 'MI 6', devicelevel: '29', newdevicelevel: '29',
    rom: 'Xiaomi/MI 6/Android 10',
  } as Record<string, unknown>;
};

const musicuPost = async (method: string, param: Record<string, unknown>, commOverride: Record<string, unknown> = {}) => {
  const body = JSON.stringify({
    comm: { ...deviceComm(), ...commOverride },
    req: { module: 'music.login.LoginServer', method, param },
  });
  const res = await bridgeRequest({
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg', method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://y.qq.com/' }, body, timeoutMs: 20_000,
  });
  try { return JSON.parse(res.body ?? '{}')?.req ?? null; } catch { return null; }
};

let activeQrState: AppQrState | null = null;

const createAppQr = async (): Promise<AppQrState | null> => {
  // 只保留一条 MQTT 连接：新建二维码前关掉上一条
  try { activeQrState?.socket?.close(); } catch { /* noop */ }
  activeQrState = null;
  const req = await musicuPost('CreateQRCode', { tmeAppID: 'qqmusic', ct: 11, cv: 14090008 });
  const data = req?.data ?? {};
  const qid = String(data.qrcodeID ?? '');
  const qrimg = String(data.qrcode ?? '');
  if (!qid || !qrimg.startsWith('data:image')) return null;
  const state: AppQrState = { qid, qrimg, events: {} };
  // 订阅扫码事件（cookies=授权成功，canceled/timeout=失败）
  subscribeQrEvents(qid, (evt) => {
    console.log('[QQ-mqtt] event', evt.type, JSON.stringify(evt.payload ?? {}).slice(0, 900));
    if (evt.type) state.events[evt.type] = evt.payload;
    // 授权成功：立刻换长期凭据并直接写入会话（不等轮询，避免限流丢 803）
    if (evt.type === 'cookies') {
      void finalizeAppLogin(state).catch((e) => console.log('[QQ-finalize] failed', String(e).slice(0, 120)));
    }
  })
    .then((ws) => { state.socket = ws; activeQrState = state; console.log('[QQ-mqtt] subscribed', qid.slice(0, 8)); })
    .catch((e) => console.log('[QQ-mqtt] connect failed', String(e).slice(0, 80)));
  return state;
};

const finalizeAppLogin = async (state: AppQrState): Promise<void> => {
  const bag: Record<string, string> = {};
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, entry] of Object.entries<any>(node)) {
      if (entry && typeof entry === 'object' && typeof entry.value === 'string') {
        const name = String(entry.name ?? key);
        if (entry.value) bag[name] = entry.value;
      } else if (entry && typeof entry === 'object') walk(entry);
    }
  };
  walk(state.events.cookies);
  const musickey = bag.qqmusic_key || bag.qm_keyst || '';
  const uid = String(bag.qqmusic_uin || bag.uin || '').replace(/^o/, '');
  if (!musickey || !uid) return;
  const qid2 = bag.qrcode_id || state.qid;
  const exchanged = await musicuPost('Login', { musicid: Number(uid), qrCodeID: qid2, token: musickey }, { tmeLoginType: 6 });
  const ex = exchanged?.data ?? null;
  const finalKey = String(ex?.musickey || musickey);
  const credential: any = {
    musicid: String(ex?.musicid ?? uid),
    musickey: finalKey,
    encryptUin: String(ex?.encryptUin ?? bag.euin ?? '').replace(/\*+$/, ''),
    encryptUin: String(ex?.encryptUin ?? bag.euin ?? '').replace(/\*+$/, ''),
    openid: String(ex?.openid ?? ''),
    refresh_token: String(ex?.refresh_token ?? ''),
    refresh_key: String(ex?.refresh_key ?? ''),
    unionid: String(ex?.unionid ?? ''),
    loginType: Number(ex?.loginType ?? 6) || 6,
  };
  const token = sealSession(credential);
  writeProviderSessionValue('qq', 'cookie', `qqmusic_session=${token}`);
  state.events.ready = true;
  console.log('[QQ-finalize] stored cookieLen', token.length, 'musicid', credential.musicid, 'keyLen', finalKey.length);
};

const exchangeAppCredential = async (qid: string, evt: any): Promise<any> => {
  const musicid = evt?.musicid ?? evt?.musicId ?? evt?.userid ?? 0;
  const token = evt?.token ?? evt?.musickey ?? evt?.key ?? '';
  if (!musicid || !token) return null;
  const req = await musicuPost('Login', { musicid: Number(musicid), qrCodeID: qid, token, tmeLoginType: 6 });
  const data = req?.data ?? null;
  return data && data.musickey ? data : null;
};

const QQ_QR_STATE: Record<string, AppQrState> = {};
const QR_QR_STATE: Record<string, string> = QQ_QR_STATE as any;
import type { SimpleResponse } from './core';

export const EXTENSION_API_BASE = 'extension';

export const isExtensionBase = (base: string | null | undefined): boolean => base === EXTENSION_API_BASE;

export { handleNeteaseEndpoint, handleKugouEndpoint, handleQqEndpoint };
export { isNativeBridgeAvailable, simpleResponse, jsonResponse, extensionUnsupported };
export type { SimpleResponse };

/** 网易云传输层入口（保持 fetchWithCreds 的 JSON 返回契约） */
export const extensionNeteaseRequest = async (
  endpoint: string,
  limit?: 'sign-in' | 'online',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const response = await handleNeteaseEndpoint(endpoint, limit);
  return response.json();
};

/** QQ 传输层入口（保持 requestQq 的 {status, body} 契约） */
/** QQ 登录链路走参考项目原函数 */
const QQ_REFERENCE_PATHS: Record<string, string> = {
  'login_qr_key': '/api/qq/login/qr/key',
  'login_qr_create': '/api/qq/login/qr/create',
  'login_qr_check': '/api/qq/login/qr/check',
  'login_status': '/api/qq/login/status',
};

export const extensionQqRequest = async (
  operation: string,
  endpoint: { path: string; query: URLSearchParams },
  payload?: Record<string, unknown>,
  cookie?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ status: number; body: any }> => {
  // transport 传的是普通对象，直调方可能传 URLSearchParams 或字符串——全部兼容
  const rawQuery: any = endpoint.query;
  const queryPairs: [string, string][] = rawQuery && typeof rawQuery.entries === 'function'
    ? Array.from(rawQuery.entries())
    : typeof rawQuery === 'string'
      ? Array.from(new URLSearchParams(rawQuery).entries())
      : Object.entries(rawQuery ?? {});
  const params = Object.fromEntries(queryPairs);
  if (operation === 'login_qr_key' || operation === 'login_qr_create' || operation === 'login_qr_check') {
    if (operation === 'login_qr_key') {
      const state = await createAppQr();
      if (!state) return { status: 200, body: { code: 800, message: '二维码生成失败' } };
      QQ_QR_STATE[state.qid] = state;
      return { status: 200, body: { code: 200, data: { unikey: state.qid } } };
    }
    if (operation === 'login_qr_create') {
      const key = String(params.key ?? '');
      const state = QQ_QR_STATE[key];
      if (!state) return { status: 200, body: { code: 800, message: '二维码会话不存在' } };
      return { status: 200, body: { code: 200, data: { qrimg: state.qrimg } } };
    }
    const key = String(params.key ?? '');
    const state = QQ_QR_STATE[key];
    if (!state) return { status: 200, body: { code: 800, message: '二维码会话不存在' } };
    const evts = state.events;
    // 事件 → UI 状态：scanned=已扫描(802)、cookies=已确认(换证中)、ready=完成(803)
    if (evts.ready) {
      const ck = readProviderSessionValue('qq', 'cookie') || '';
      return { status: 200, body: { code: ck ? 803 : 801, message: 'confirmed', cookie: ck } };
    }
    if (evts.scanned && !evts.cookies) {
      return { status: 200, body: { code: 802, message: '已扫描，等待手机确认' } };
    }
    if (evts.cookies) {
      return { status: 200, body: { code: 802, message: '已授权，正在读取账号', retryable: true } };
    }
    if (evts.canceled || evts.loginFailed) return { status: 200, body: { code: 800, message: '已取消或登录失败' } };
    if (evts.timeout) return { status: 200, body: { code: 800, message: '二维码已过期' } };
    return { status: 200, body: { code: 801, message: '等待扫码' } };
  }
  const response = await handleQqEndpoint(operation, endpoint.path, params, payload, cookie);
  return { status: response.status, body: await response.json() };
};

/** 波点传输层入口（保持桌面桥 BodianBridgeResult 契约 {ok,data}|{ok,error}） */
export const extensionBodianRequest = async (
  operation: string,
  params: Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => handleBodianRequest(operation, params);

/** 酷狗传输层入口：登录/状态/播放走参考项目原函数（reference/*.js），其余保留旧实现 */
const KG_REFERENCE_PATHS: Record<string, string> = {
  '/login/qr/key': '/api/kg/login/qr/key',
  '/login/qr/create': '/api/kg/login/qr/create',
  '/login/qr/check': '/api/kg/login/qr/check',
  '/login/status': '/api/kg/login/status',
  '/user/detail': '/api/kg/login/status',
  '/user/vip/detail': '/api/kg/vip/detail',
  '/song/url': '/api/kg/song/url',
  '/user/playlist': '/api/kg/user/playlists',
};

export const extensionKugouRequest = async (
  endpointPath: string,
  query: URLSearchParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const refPath = KG_REFERENCE_PATHS[endpointPath];
  if (refPath) {
    installReferenceChromeShim();
    const queryObj: Record<string, string> = {};
    query.forEach((v, k) => { queryObj[k] = v; });
    const result: any = await callReferenceApi(refPath, queryObj);
    if (refPath === '/api/kg/user/playlists') {
      // 参考层返回已归一化的歌单对象，转回 provider 期望的原始形状
      const playlists = Array.isArray(result?.playlists) ? result.playlists : [];
      return {
        status: 1, error_code: 0,
        data: playlists.map((p: any) => ({
          specialid: p.id, id: p.id, global_collection_id: p.globalCollectionId || p.id,
          name: p.name, img: p.cover, pic: p.cover, cover: p.cover,
          song_count: p.trackCount, count: p.trackCount,
          list_create_userid: p.ownerId || '', userid: p.ownerId || '',
          nickname: p.creator, is_default: p.isFavorite ? 1 : 0, is_favorite: p.isFavorite ? 1 : 0,
          type: p.listType ?? 0,
        })),
      };
    }
    if (refPath === '/api/kg/user/playlists') {
      // 参考层返回已归一化的歌单对象，转回 provider 期望的原始形状
      const playlists = Array.isArray(result?.playlists) ? result.playlists : [];
      return {
        status: 1, error_code: 0,
        data: playlists.map((p: any) => ({
          specialid: p.id, id: p.id, global_collection_id: p.globalCollectionId || p.id,
          name: p.name, img: p.cover, pic: p.cover, cover: p.cover,
          song_count: p.trackCount, count: p.trackCount,
          list_create_userid: p.ownerId || '', userid: p.ownerId || '',
          nickname: p.creator, is_default: p.isFavorite ? 1 : 0, is_favorite: p.isFavorite ? 1 : 0,
          type: p.listType ?? 0,
        })),
      };
    }
    if (refPath === '/api/kg/login/status' || refPath === '/api/kg/user/detail') {
      // 适配 provider 的 user_info 形状（参考 getKGLoginStatus 是 cookie-first）
      const userid = String(result?.userId || readProviderSessionValue('kugou', 'userid') || '');
      return {
        status: 1, error_code: 0,
        data: { user_info: { userid, KugooID: userid, nickname: result?.nickname || userid, pic: result?.avatar || '' } },
      };
    }
    return result;
  }
  const response = await handleKugouEndpoint(`${endpointPath}?${query.toString()}`);
  return response.json();
};
