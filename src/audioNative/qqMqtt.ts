// QQ 音乐扫码登录 MQTT（纯 JS，照参考实现：含 0x9c/0x9d 重定向）
const MQTT_HOST = 'mu.y.qq.com';
const MQTT_PATH = '/ws/handshake';
const enc = new TextEncoder();

const varint = (n: number): number[] => { const out: number[] = []; let v = n; do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; out.push(b); } while (v > 0); return out; };
const u16 = (n: number): number[] => [n >> 8, n & 0xff];
const utf8 = (s: string): number[] => { const b = Array.from(enc.encode(s)); return [...u16(b.length), ...b]; };
const flat = (arrs: number[][]): number[] => arrs.reduce((a, b) => a.concat(b), []);

const buildProps = (auth: string | null, pairs: [string, string][]): number[] => {
  const chunks: number[][] = [];
  if (auth) chunks.push([0x15], utf8(auth));
  for (const [k, v] of pairs) chunks.push([0x26], utf8(k), utf8(v));
  const body = flat(chunks);
  return [...varint(body.length), ...body];
};

export const buildConnect = (clientId: string, qrcodeId: string): Uint8Array => {
  const body = flat([
    utf8('MQTT'), [0x05, 0x02], [0, 45],
    buildProps('pass', [['tmeAppID', 'qqmusic'], ['business', 'management'], ['hashTag', qrcodeId], ['clientTag', 'management.user'], ['userID', qrcodeId]]),
    utf8(clientId),
  ]);
  return new Uint8Array([0x10, ...varint(body.length), ...body]);
};

export const buildSubscribe = (qrcodeId: string): Uint8Array => {
  const body = flat([[0, 1], buildProps(null, [['authorization', 'tmelogin'], ['pubsub', 'unicast']]), utf8(`management.qrcode_login/${qrcodeId}`), [0x00]]);
  return new Uint8Array([0x82, ...varint(body.length), ...body]);
};

const readVarint = (buf: Uint8Array, at: number): { value: number; bytes: number } | null => {
  let value = 0, mult = 1, i = at;
  while (i < buf.length && i - at < 4) {
    const b = buf[i]; value += (b & 0x7f) * mult; i += 1;
    if ((b & 0x80) === 0) return { value, bytes: i - at };
    mult *= 128;
  }
  return null;
};
const readStr = (buf: Uint8Array, at: number): { value: string; next: number } => {
  const len = (buf[at] << 8) | buf[at + 1];
  return { value: new TextDecoder().decode(buf.subarray(at + 2, at + 2 + len)), next: at + 2 + len };
};

const parsePublish = (p: Uint8Array, bodyStart: number): { type: string; payload: any } => {
  let cursor = readStr(p, bodyStart).next;
  const qos = (p[0] >> 1) & 0x03;
  if (qos > 0) cursor += 2;
  const plen = readVarint(p, cursor);
  if (!plen) return { type: '', payload: null };
  let c = cursor + plen.bytes;
  const pend = c + plen.value;
  let type = '';
  while (c < pend) {
    const id = p[c]; c += 1;
    if (id === 0x26) {
      const k = readStr(p, c); const v = readStr(p, k.next); c = v.next;
      if (k.value === 'type') type = v.value;
    } else if ([0x1c, 0x1f, 0x03, 0x08, 0x12, 0x15, 0x1a].includes(id)) { c = readStr(p, c).next; }
    else if ([0x13, 0x21, 0x22, 0x23].includes(id)) { c += 2; }
    else if ([0x02, 0x11, 0x18, 0x27].includes(id)) { c += 4; }
    else if ([0x01, 0x17, 0x19].includes(id)) { c += 1; }
    else break;
  }
  const raw = new TextDecoder().decode(p.subarray(pend)).trim();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  return { type, payload };
};

const parseConnack = (packet: Uint8Array, bodyStart: number): { reason: number; reference: string } => {
  const reason = packet[bodyStart + 1] ?? 0xff;
  let c = bodyStart + 2;
  let reference = '';
  const plen = readVarint(packet, c);
  if (plen) {
    const end = c + plen.bytes + plen.value;
    c += plen.bytes;
    while (c < end) {
      const id = packet[c]; c += 1;
      if (id === 0x1c) { const v = readStr(packet, c); reference = v.value; c = v.next; }
      else if (id === 0x26) { const k = readStr(packet, c); const v = readStr(packet, k.next); c = v.next; }
      else if ([0x03, 0x08, 0x12, 0x15, 0x1a, 0x1f].includes(id)) { c = readStr(packet, c).next; }
      else if ([0x13, 0x21, 0x22, 0x23].includes(id)) { c += 2; }
      else if ([0x02, 0x11, 0x18, 0x27].includes(id)) { c += 4; }
      else if ([0x01, 0x17, 0x19].includes(id)) { c += 1; }
      else break;
    }
  }
  return { reason, reference };
};

const redirectPath = (path: string, reference: string): string => {
  const parts = path.split('/');
  parts[parts.length - 1] = reference;
  return parts.join('/');
};

export const subscribeQrEvents = async (
  qrcodeId: string,
  onEvent: (evt: { type: string; payload: any }) => void,
): Promise<WebSocket> => {
  let path = MQTT_PATH;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const result = await new Promise<{ ws?: WebSocket; reference?: string; reject?: Error }>((resolve) => {
      const ws = new WebSocket(`wss://${MQTT_HOST}${path}`, 'mqtt');
      ws.binaryType = 'arraybuffer';
      let buf = new Uint8Array(0);
      let subscribed = false;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch { /* noop */ } resolve({ reject: new Error('mqtt timeout') }); } }, 15_000);
      ws.onopen = () => ws.send(buildConnect(`${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`, qrcodeId));
      ws.onmessage = (event) => {
        const chunk = new Uint8Array(event.data as ArrayBuffer);
        buf = new Uint8Array([...Array.from(buf), ...Array.from(chunk)]);
        let cursor = 0;
        while (cursor < buf.length) {
          const r = readVarint(buf, cursor + 1);
          if (!r) break;
          const end = cursor + 1 + r.bytes + r.value;
          if (end > buf.length) break;
          const packet = buf.subarray(cursor, end);
          cursor = end;
          const kind = packet[0] >> 4;
          if (kind === 2 && !done) {
            const { reason, reference } = parseConnack(packet, 1 + r.bytes);
            done = true;
            clearTimeout(timer);
            if (reason === 0) { ws.send(buildSubscribe(qrcodeId)); subscribed = true; resolve({ ws }); }
            else if ((reason === 0x9c || reason === 0x9d) && reference) { try { ws.close(); } catch { /* noop */ } resolve({ reference }); }
            else { try { ws.close(); } catch { /* noop */ } resolve({ reject: new Error(`mqtt connack 0x${reason.toString(16)}`) }); }
          } else if (kind === 3 && subscribed) {
            try { onEvent(parsePublish(packet, 1 + r.bytes)); } catch { /* ignore */ }
          }
        }
        buf = buf.subarray(cursor);
      };
      ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); resolve({ reject: new Error('mqtt ws error') }); } };
      ws.onclose = () => { if (!done) { done = true; clearTimeout(timer); resolve({ reject: new Error('mqtt closed') }); } };
    });
    if (result.ws) return result.ws;
    if (result.reference) { path = redirectPath(path, result.reference); continue; }
    throw result.reject ?? new Error('mqtt failed');
  }
  throw new Error('mqtt redirect limit');
};
