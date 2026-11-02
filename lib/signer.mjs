import crypto from 'node:crypto';

export const ALGORITHM = 'SDK-HMAC-SHA256';

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function hmacHex(key, text) {
  return crypto.createHmac('sha256', key).update(text, 'utf8').digest('hex');
}

export function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalUri(pathname) {
  return String(pathname)
    .split('/')
    .map((segment) => {
      try {
        return encodeRfc3986(decodeURIComponent(segment));
      } catch {
        return encodeRfc3986(segment);
      }
    })
    .join('/');
}

export function canonicalQueryString(query) {
  const entries = query instanceof URLSearchParams
    ? [...query.entries()]
    : Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== null);

  const pairs = entries.map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)]);
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

export function formatXsdDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

export function buildCanonicalRequest({ method, pathname, query, headers, signedHeaders, payload }) {
  return [
    method.toUpperCase(),
    canonicalUri(pathname),
    canonicalQueryString(query),
    signedHeaders.map((name) => `${name}:${normalizeHeaderValue(headers[name])}\n`).join(''),
    signedHeaders.join(';'),
    sha256Hex(payload ?? ''),
  ].join('\n');
}

export function signRequest({ method, url, headers = {}, payload = '', ak, sk, date = new Date() }) {
  const xSdkDate = headers['X-Sdk-Date'] ?? formatXsdDate(date);

  const signable = {
    host: url.host,
    'x-sdk-date': xSdkDate,
  };
  if (headers['Content-Type']) signable['content-type'] = headers['Content-Type'];

  const signedHeaders = Object.keys(signable).sort();
  const canonicalRequest = buildCanonicalRequest({
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: signable,
    signedHeaders,
    payload,
  });

  const stringToSign = [ALGORITHM, xSdkDate, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmacHex(sk, stringToSign);

  return {
    ...headers,
    Host: url.host,
    'X-Sdk-Date': xSdkDate,
    Authorization:
      `${ALGORITHM} Access=${ak}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
  };
}