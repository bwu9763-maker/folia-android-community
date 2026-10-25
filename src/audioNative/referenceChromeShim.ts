// chrome.* 垫片：参考项目 API 层（reference/*.js）运行所需
const JAR_KEY = 'reference_cookie_jar';
type Jar = Record<string, { name: string; value: string; domain?: string }[]>;
const readJar = (): Jar => { try { return JSON.parse(localStorage.getItem(JAR_KEY) || '{}'); } catch { return {}; } };
const writeJar = (j: Jar) => localStorage.setItem(JAR_KEY, JSON.stringify(j));
const hostOf = (url: string): string => { try { return new URL(url).hostname; } catch { return ''; } };
const parseSetCookie = (entry: string) => {
  const [pair, ...attrs] = entry.split(';');
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  const out: { name: string; value: string; domain?: string } = { name, value };
  for (const a of attrs) {
    const [k, v] = a.trim().split('=');
    const kl = (k || '').toLowerCase();
    if (kl === 'domain') out.domain = (v || '').replace(/^\./, '');
  }
  return out;
};

export const installReferenceChromeShim = (): void => {
  const w = window as any;
  if (w.chrome?.__referenceShim) return;
  w.chrome = {
    __referenceShim: true,
    storage: {
      local: {
        get: async (keys: any) => {
          const out: any = {};
          const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
          for (const k of list) {
            const v = localStorage.getItem('refstore_' + k);
            if (v != null) { try { out[k] = JSON.parse(v); } catch { out[k] = v; } }
          }
          return out;
        },
        set: async (items: any) => {
          for (const [k, v] of Object.entries(items || {})) localStorage.setItem('refstore_' + k, JSON.stringify(v));
        },
        remove: async (keys: any) => {
          for (const k of (Array.isArray(keys) ? keys : [keys])) localStorage.removeItem('refstore_' + k);
        },
      },
    },
    cookies: {
      get: async (details: any) => {
        const host = hostOf(details?.url || '');
        const dom = details?.domain || host;
        const j = readJar();
        const list = [...(j[host] || []), ...(j[dom] || [])];
        return list.find((c) => c.name === details?.name) ?? null;
      },
      getAll: async (details: any) => {
        const j = readJar();
        const out: any[] = [];
        const wantDomain = details?.domain || '';
        for (const [dom, list] of Object.entries(j)) {
          if (wantDomain && dom !== wantDomain && !dom.endsWith(wantDomain.replace(/^\./, '')) && !wantDomain.replace(/^\./, '').endsWith(dom)) continue;
          for (const c of list) out.push({ ...c, domain: dom });
        }
        return details?.name ? out.filter((c) => c.name === details.name) : out;
      },
      set: async (cookie: any) => {
        const domain = (cookie?.domain || hostOf(cookie?.url || '')).replace(/^\./, '');
        if (!domain || !cookie?.name) return null;
        const j = readJar();
        const list = j[domain] || [];
        const i = list.findIndex((c) => c.name === cookie.name);
        const entry = { name: cookie.name, value: cookie.value ?? '', domain };
        if (i >= 0) list[i] = entry; else list.push(entry);
        j[domain] = list;
        writeJar(j);
        return null;
      },
      remove: async (details: any) => {
        const j = readJar();
        for (const [dom, list] of Object.entries(j)) {
          const i = list.findIndex((c) => c.name === details?.name);
          if (i >= 0) { list.splice(i, 1); j[dom] = list; }
        }
        writeJar(j);
      },
      removeBatch: async ({ entries }: any) => {
        for (const d of entries || []) {
          const dom = (d.domain || hostOf(d.url || '')).replace(/^\./, '');
          const j = readJar();
          j[dom] = (j[dom] || []).filter((c) => !(d.name ? c.name === d.name : true));
          writeJar(j);
        }
      },
    },
    declarativeNetRequest: { RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' }, updateSessionRules: async () => undefined },
    tabs: { create: async () => ({}), query: async () => [], onRemoved: { addListener: () => undefined }, onUpdated: { addListener: () => undefined } },
  };
};

export const referenceJarSetCookie = (domain: string, entry: string): void => {
  const cookie = parseSetCookie(entry);
  const dom = (cookie.domain || domain).replace(/^\./, '');
  if (!dom || !cookie.name) return;
  const j = readJar();
  const list = j[dom] || [];
  const i = list.findIndex((c) => c.name === cookie.name);
  const merged = { ...cookie, domain: dom };
  if (i >= 0) list[i] = merged; else list.push(merged);
  j[dom] = list;
  writeJar(j);
};

export const referenceJarCookieHeader = (domains: string[]): string => {
  const j = readJar();
  const parts: string[] = [];
  for (const dom of domains) for (const c of (j[dom] || [])) parts.push(`${c.name}=${c.value}`);
  return parts.join('; ');
};
