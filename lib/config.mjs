import { configError } from './errors.mjs';

export const DEFAULT_ENDPOINT = 'https://projectman.cn-north-4.myhuaweicloud.com';
export const DEFAULT_REGION = 'cn-north-4';
export const DEFAULT_TIMEOUT_MS = 15000;

function guessRegion(hostname) {
  const match = /(?:^|\.)projectman[^.]*\.([a-z0-9-]+)\.myhuaweicloud\.com$/i.exec(hostname);
  return match ? match[1] : DEFAULT_REGION;
}

function parseTimeout(raw) {
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_TIMEOUT_MS;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw configError(`CODEARTS_REQ_TIMEOUT_MS 需要正整数，收到 "${raw}"`, `默认 ${DEFAULT_TIMEOUT_MS} 毫秒`);
  }
  const value = Number(text);
  if (value < 1000 || value > 120000) {
    throw configError(`CODEARTS_REQ_TIMEOUT_MS 超出范围 1000-120000，收到 ${value}`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const endpointText = String(env.CODEARTS_REQ_ENDPOINT ?? DEFAULT_ENDPOINT).trim();
  let endpoint;
  try {
    endpoint = new URL(endpointText);
  } catch {
    throw configError(
      `CODEARTS_REQ_ENDPOINT 不是合法 URL: "${endpointText}"`,
      `示例: ${DEFAULT_ENDPOINT}`,
    );
  }
  if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
    throw configError(`CODEARTS_REQ_ENDPOINT 只支持 http/https，收到 "${endpoint.protocol}"`);
  }

  const auth = String(env.CODEARTS_REQ_AUTH ?? 'ak').trim().toLowerCase();
  if (auth !== 'ak' && auth !== 'hcloud') {
    throw configError(
      `CODEARTS_REQ_AUTH 只能是 ak 或 hcloud，收到 "${env.CODEARTS_REQ_AUTH}"`,
      'ak: 使用 AK/SK 直接调用 API；hcloud: 降级调用本机 hcloud CLI',
    );
  }

  const ak = String(env.CODEARTS_REQ_AK ?? '').trim();
  const sk = String(env.CODEARTS_REQ_SK ?? '').trim();
  if (auth === 'ak' && (!ak || !sk)) {
    throw configError(
      '缺少 AK/SK 配置，无法生成签名请求',
      '请设置 CODEARTS_REQ_AK 与 CODEARTS_REQ_SK；或设置 CODEARTS_REQ_AUTH=hcloud 使用本机 hcloud CLI',
    );
  }

  const region = String(env.CODEARTS_REQ_REGION ?? '').trim() || guessRegion(endpoint.hostname);

  return {
    endpoint,
    auth,
    ak,
    sk,
    region,
    timeoutMs: parseTimeout(env.CODEARTS_REQ_TIMEOUT_MS),
    hcloudBin: env.CODEARTS_REQ_HCLOUD_BIN ?? '',
    env,
  };
}