// 参考项目 API 层接线：登录/播放走 reference/*.js 原函数，Cookie 罐与我的会话互通
import { handleApiRequest } from './reference/router';
import { referenceJarCookieHeader, referenceJarSetCookie } from './referenceChromeShim';
import { readProviderSessionValue, writeProviderSessionValue } from '../services/onlineMusic/providerStorage';

const KG_DOMAINS = ['www.kugou.com', 'kugou.com', 'login-user.kugou.com', 'userservice.kugou.com'];

export const seedReferenceJarFromSession = (): void => {
  const cookie = readProviderSessionValue('kugou', 'cookie') || '';
  if (!cookie) return;
  for (const pair of cookie.split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    referenceJarSetCookie('www.kugou.com', `${pair.slice(0, eq).trim()}=${pair.slice(eq + 1).trim()}`);
  }
};

export const syncSessionFromReferenceJar = (): void => {
  const header = referenceJarCookieHeader(KG_DOMAINS);
  if (!header) return;
  const token = (header.match(/(?:^|;)\s*(?:token|t)=([^;]+)/g) || []).map(s => s.split('=')[1]).pop() || '';
  const userid = (header.match(/userid=([^;]+)/) || [])[1] || '';
  if (token) writeProviderSessionValue('kugou', 'token', token);
  if (userid) writeProviderSessionValue('kugou', 'userid', userid);
  if (token && userid) {
    writeProviderSessionValue('kugou', 'cookie', header);
  }
};

export const callReferenceApi = async (path: string, query: Record<string, string> = {}) => {
  seedReferenceJarFromSession();
  const result = await handleApiRequest({ path, method: 'GET', query, body: {} });
  syncSessionFromReferenceJar();
  return result;
};
