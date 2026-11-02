import http from 'node:http';
import https from 'node:https';
import { cloudError, networkError } from './errors.mjs';
import { canonicalQueryString, signRequest } from './signer.mjs';

const NETWORK_HINTS = {
  ENOTFOUND: '域名无法解析，请检查 CODEARTS_REQ_ENDPOINT 以及本机 DNS/网络',
  EAI_AGAIN: 'DNS 解析暂时失败，请稍后重试',
  ECONNREFUSED: '目标拒绝连接，请确认 endpoint 地址与端口是否正确',
  ECONNRESET: '连接被对端重置，请稍后重试',
  ETIMEDOUT: '请求超时，请检查网络或用 CODEARTS_REQ_TIMEOUT_MS 调大超时',
  CERT_HAS_EXPIRED: 'TLS 证书已过期，请检查 endpoint',
  DEPTH_ZERO_SELF_SIGNED_CERT: '证书为自签名，当前环境不受信任',
};

export function buildRequestPath(endpoint, pathname, query) {
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const search = canonicalQueryString(query);
  return `${basePath}${pathname}${search ? `?${search}` : ''}`;
}

function extractErrorMessage(parsed, text, status) {
  const candidates = [
    parsed?.error_msg,
    parsed?.message,
    parsed?.error?.message,
    parsed?.errorMsg,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  const preview = String(text ?? '').trim().slice(0, 300);
  return preview !== '' ? preview : `云端返回 HTTP ${status}`;
}

function extractErrorCode(parsed) {
  return parsed?.error_code ?? parsed?.code ?? parsed?.error?.code ?? parsed?.errorCode;
}

function toNetworkError(error) {
  const code = error?.code;
  return networkError(`网络请求失败：${error?.message ?? error}`, {
    code,
    hint: NETWORK_HINTS[code] ?? '请检查网络连通性、代理与 endpoint 配置',
  });
}

export async function requestJson({ endpoint, method, pathname, query, body, ak, sk, timeoutMs }) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const requestPath = buildRequestPath(endpoint, pathname, query);
  const url = new URL(`${endpoint.origin}${requestPath}`);

  const baseHeaders = {};
  if (payload !== '') {
    baseHeaders['Content-Type'] = 'application/json;charset=utf-8';
    baseHeaders['Content-Length'] = String(Buffer.byteLength(payload));
  }

  const headers = signRequest({ method, url, headers: baseHeaders, payload, ak, sk });

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const transport = url.protocol === 'http:' ? http : https;
    const request = transport.request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', (error) => finish(reject, toNetworkError(error)));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = response.statusCode ?? 0;
        const requestId = response.headers['x-request-id'] ?? response.headers['x-trace-id'];

        let parsed;
        let parseFailed = false;
        if (text.trim() === '') {
          parsed = null;
        } else {
          try {
            parsed = JSON.parse(text);
          } catch {
            parseFailed = true;
          }
        }

        if (status >= 400) {
          finish(
            reject,
            cloudError(extractErrorMessage(parsed, text, status), {
              status,
              code: extractErrorCode(parsed),
              requestId,
            }),
          );
          return;
        }

        if (parseFailed) {
          finish(
            reject,
            cloudError('云端返回了无法解析的响应体（不是 JSON）', {
              status,
              requestId,
              details: { bodyPreview: text.trim().slice(0, 300) },
              hint: '请确认 CODEARTS_REQ_ENDPOINT 指向的是 CodeArts 需求管理 API',
            }),
          );
          return;
        }

        finish(resolve, parsed);
      });
    });

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`请求超时（${timeoutMs}ms）`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });

    request.on('error', (error) => finish(reject, toNetworkError(error)));

    if (payload !== '') request.write(payload);
    request.end();
  });
}