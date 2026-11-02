import { spawn } from 'node:child_process';
import { cloudError, configError, networkError } from './errors.mjs';

export const DEFAULT_HCLOUD_BIN = 'hcloud';
export const HCLOUD_SERVICE = 'ProjectMan';
export const HCLOUD_CREATE_OPERATION = 'CreateIssue';
export const HCLOUD_LIST_OPERATION = 'ListIssues';

export function parseBinSpec(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return [DEFAULT_HCLOUD_BIN];
  if (text.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw configError(
        'CODEARTS_REQ_HCLOUD_BIN 不是合法的 JSON 数组',
        '示例: CODEARTS_REQ_HCLOUD_BIN=\'["C:/node/node.exe","C:/scripts/fake-hcloud.mjs"]\'',
      );
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item !== 'string')) {
      throw configError('CODEARTS_REQ_HCLOUD_BIN 需要是非空的字符串数组');
    }
    return parsed;
  }
  return [text];
}

export function buildHcloudCreateArgs(form, region) {
  const args = [
    HCLOUD_SERVICE,
    HCLOUD_CREATE_OPERATION,
    `--project_id=${form.projectId}`,
    `--subject=${form.title}`,
    `--tracker_id=${form.trackerId}`,
    `--priority_id=${form.priority}`,
  ];

  if (form.description !== undefined) args.push(`--description=${form.description}`);
  if (form.statusId !== undefined) args.push(`--status_id=${form.statusId}`);
  if (form.severity !== undefined) args.push(`--severity_id=${form.severity}`);
  if (form.assignedTo !== undefined) args.push(`--assigned_id=${form.assignedTo}`);
  if (form.parentIssue !== undefined) args.push(`--parent_issue_id=${form.parentIssue}`);
  if (form.iteration !== undefined) args.push(`--iteration_id=${form.iteration}`);
  if (form.begin !== undefined) args.push(`--begin_time=${form.begin}`);
  if (form.end !== undefined) args.push(`--end_time=${form.end}`);

  args.push(`--cli-region=${region}`, '--cli-output=json');
  return args;
}

export function buildHcloudListArgs(query, region) {
  const args = [
    HCLOUD_SERVICE,
    HCLOUD_LIST_OPERATION,
    `--project_id=${query.projectId}`,
    `--limit=${query.limit}`,
    `--offset=${query.offset}`,
  ];

  if (query.trackerId !== undefined) args.push(`--tracker_id=${query.trackerId}`);
  if (query.statusId !== undefined) args.push(`--status_id=${query.statusId}`);

  args.push(`--cli-region=${region}`, '--cli-output=json');
  return args;
}

export function runHcloud(args, { env, timeoutMs = 60000 } = {}) {
  const [bin, ...prefix] = parseBinSpec(env?.CODEARTS_REQ_HCLOUD_BIN);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    let child;
    try {
      child = spawn(bin, [...prefix, ...args], {
        env: env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      finish(
        reject,
        configError(`无法启动 hcloud CLI: ${error.message}`, '请确认 CODEARTS_REQ_HCLOUD_BIN 配置正确'),
      );
      return;
    }

    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    timer = setTimeout(() => {
      child.kill();
      finish(
        reject,
        networkError(`hcloud CLI 执行超时（${timeoutMs}ms）`, {
          hint: '请检查 hcloud 的网络连通性，或用 CODEARTS_REQ_TIMEOUT_MS 调大超时',
        }),
      );
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        finish(
          reject,
          configError(`未找到 hcloud CLI（${bin}）`, '请先安装华为云 KooCLI，或改用 CODEARTS_REQ_AUTH=ak'),
        );
        return;
      }
      finish(reject, configError(`调用 hcloud CLI 失败: ${error.message}`));
    });

    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        const detail = err.trim() !== '' ? err.trim().slice(0, 500) : '无错误输出';
        finish(reject, cloudError(`hcloud 执行失败（退出码 ${code}）: ${detail}`, { code }));
        return;
      }
      try {
        finish(resolve, JSON.parse(out));
      } catch {
        finish(
          reject,
          cloudError('hcloud 输出不是合法 JSON', {
            details: { bodyPreview: out.trim().slice(0, 300) },
            hint: '请确认 hcloud 支持 --cli-output=json，且命令参数正确',
          }),
        );
      }
    });
  });
}