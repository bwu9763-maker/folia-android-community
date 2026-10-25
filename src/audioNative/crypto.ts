// src/audioNative/crypto.ts
// 浏览器环境（Android WebView）下的网易云 / 酷狗协议加密原语。
// 参考 NeteaseCloudMusicApi util/crypto.js 与 KuGouMusicApi util/helper.js 的公开算法自实现。

import md5 from 'blueimp-md5';
import { AES, Base64, CBC, CipherParams, ECB, Hex, Pkcs7, Utf8 } from 'crypto-es';

const encUtf8 = Utf8;
const encHex = Hex;
const encBase64 = Base64;
const MODE_CBC = CBC;
const MODE_ECB = ECB;
const PAD_PKCS7 = Pkcs7;

export { md5 };

/** 生成 n 位随机十六进制字符串 */
export const randomHex = (length: number): string => {
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) out += (bytes[i]! & 0xf).toString(16);
  return out;
};

const BASE62_FULL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 网易云 weapi 用的 16 位随机 base62 密钥 */
export const randomBase62 = (length = 16): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += BASE62_FULL[Math.floor(Math.random() * BASE62_FULL.length)];
  return out;
};

export const randomString = (length: number, charset: string = BASE62_FULL): string => {
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) out += charset[bytes[i]! % charset.length];
  return out;
};

export const uuidv4 = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b!.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// ---------------------------------------------------------------------------
// AES（crypto-es，纯 JS，WebView 可用）

/** AES-128-CBC + PKCS7 → base64（weapi 两层加密用） */
export const aesCbcEncryptBase64 = (text: string, key: string, iv: string): string => (
  AES.encrypt(encUtf8.parse(text), encUtf8.parse(key), {
    iv: encUtf8.parse(iv),
    mode: MODE_CBC,
    padding: PAD_PKCS7,
  }).toString()
);

/** AES-128-ECB + PKCS7 → 大写 hex（eapi / linuxapi 用） */
export const aesEcbEncryptUpperHex = (text: string, key: string): string => (
  encHex.stringify(
    AES.encrypt(encUtf8.parse(text), encUtf8.parse(key), {
      mode: MODE_ECB,
      padding: PAD_PKCS7,
    }).ciphertext,
  ).toUpperCase()
);

/** AES-128-ECB hex 密文 → UTF-8 明文（eapi 响应解密用） */
export const aesEcbDecryptHex = (cipherHex: string, key: string): string => (
  encUtf8.stringify(
    AES.decrypt(
      CipherParams.create({ ciphertext: encHex.parse(cipherHex) }),
      encUtf8.parse(key),
      { mode: MODE_ECB, padding: PAD_PKCS7 },
    ),
  )
);

/** AES-128-CBC + PKCS7，Base64；key/iv 由任意字符串经 md5 派生（酷狗设备注册 / 云盘用） */
export const aesCbcEncryptDerived = (text: string, secret: string): { key: string; iv: string; data: string } => {
  const digest = md5(secret);
  return { key: digest.slice(0, 16), iv: digest.slice(16, 32), data: aesCbcEncryptBase64(text, digest.slice(0, 16), digest.slice(16, 32)) };
};

export const aesCbcDecryptDerived = (dataB64: string, secret: string): string => {
  const digest = md5(secret);
  return encUtf8.stringify(
    AES.decrypt(
      CipherParams.create({ ciphertext: encBase64.parse(dataB64) }),
      encUtf8.parse(digest.slice(0, 16)),
      { iv: encUtf8.parse(digest.slice(16, 32)), mode: MODE_CBC, padding: PAD_PKCS7 },
    ),
  );
};

// ---------------------------------------------------------------------------
// RSA（BigInt 自实现：1024 位一次模幂）

const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte!);
  return value;
};

const bigIntToFixedBytes = (value: bigint, length: number): Uint8Array => {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

const modPow = (base: bigint, exponent: bigint, modulus: bigint): bigint => {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
};

interface RsaPublicKey {
  modulus: bigint;
  exponent: bigint;
  byteLength: number;
}

const decodeBase64 = (text: string): Uint8Array => {
  const binary = atob(text.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

// 最小 DER 读取：只需在 SPKI/PKCS1 结构里找到 modulus 与 exponent 两个 INTEGER
const readDerInteger = (bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } => {
  if (bytes[offset] !== 0x02) throw new Error('RSA key parse: expected INTEGER');
  let length = bytes[offset + 1]!;
  let cursor = offset + 2;
  if (length & 0x80) {
    const sizeBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < sizeBytes; i += 1) length = (length << 8) | bytes[cursor + i]!;
    cursor += sizeBytes;
  }
  let start = cursor;
  const end = cursor + length;
  // 跳过前导 0x00（正数符号填充）
  while (start < end && bytes[start] === 0x00) start += 1;
  return { value: bytes.slice(start, end), next: end };
};

const publicKeyCache = new Map<string, RsaPublicKey>();

/** 解析 PEM（SPKI 或 PKCS#1）公钥，提取 modulus / exponent */
export const parseRsaPublicKey = (pem: string): RsaPublicKey => {
  const cached = publicKeyCache.get(pem);
  if (cached) return cached;
  const bytes = decodeBase64(pem);
  const readTag = (offset: number): { tag: number; contentStart: number; contentLength: number; next: number } => {
    const tag = bytes[offset]!;
    let length = bytes[offset + 1]!;
    let cursor = offset + 2;
    if (length & 0x80) {
      const sizeBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < sizeBytes; i += 1) length = (length << 8) | bytes[cursor + i]!;
      cursor += sizeBytes;
    }
    return { tag, contentStart: cursor, contentLength: length, next: cursor + length };
  };

  const root = readTag(0);
  // PKCS#1 直接是 SEQ{INT, INT}；SPKI 是 SEQ{SEQ{OID...}, BITSTRING{SEQ{INT, INT}}}
  let integerArea: number;
  if (bytes[root.contentStart] === 0x30) {
    const algSeq = readTag(root.contentStart);        // AlgorithmIdentifier SEQ{OID, NULL}
    const bitString = readTag(algSeq.next);            // BITSTRING
    const innerSeq = readTag(bitString.contentStart + 1); // 跳过未用位数(0)后是 RSAPublicKey SEQ
    integerArea = innerSeq.contentStart;
  } else {
    integerArea = root.contentStart;
  }
  const modulus = readDerInteger(bytes, integerArea);
  const exponent = readDerInteger(bytes, modulus.next);
  const key: RsaPublicKey = {
    modulus: bytesToBigInt(modulus.value),
    exponent: bytesToBigInt(exponent.value),
    byteLength: modulus.value.length,
  };
  publicKeyCache.set(pem, key);
  return key;
};

/** RSA no-padding：消息字节左对齐放入密钥长度块，直接模幂（网易云 encSecKey / 酷狗 pk 用） */
export const rsaEncryptNoPadding = (message: Uint8Array, pem: string): string => {
  const key = parseRsaPublicKey(pem);
  const block = new Uint8Array(key.byteLength);
  block.set(message.slice(0, key.byteLength), 0);
  const cipher = modPow(bytesToBigInt(block), key.exponent, key.modulus);
  return Array.from(bigIntToFixedBytes(cipher, key.byteLength), b => b!.toString(16).padStart(2, '0')).join('');
};

/** RSA PKCS#1 v1.5 加密（酷狗 rsaEncrypt2 用） */
export const rsaEncryptPkcs1v15 = (message: Uint8Array, pem: string): string => {
  const key = parseRsaPublicKey(pem);
  const padLength = key.byteLength - message.length - 3;
  if (padLength < 8) throw new Error('RSA PKCS#1 v1.5: message too long');
  const block = new Uint8Array(key.byteLength);
  block[0] = 0x00;
  block[1] = 0x02;
  const noise = new Uint8Array(padLength);
  crypto.getRandomValues(noise);
  for (let i = 0; i < padLength; i += 1) noise[i] = (noise[i]! % 254) + 1;
  block.set(noise, 2);
  block[2 + padLength] = 0x00;
  block.set(message, 3 + padLength);
  const cipher = modPow(bytesToBigInt(block), key.exponent, key.modulus);
  return Array.from(bigIntToFixedBytes(cipher, key.byteLength), b => b!.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------------------
// Cookie 工具

export const parseCookieString = (cookie: string | undefined | null): Map<string, string> => {
  const map = new Map<string, string>();
  if (!cookie) return map;
  for (const entry of cookie.split(';')) {
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;
    map.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
  }
  return map;
};

export const serializeCookieMap = (map: Map<string, string>): string => (
  Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
);

export const base64EncodeUtf8 = (text: string): string => encUtf8.parse(text).toString(encBase64);


export const toQueryString = (data: Record<string, string>): string => new URLSearchParams(data).toString();
