import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(ROOT, 'bin', 'req-cli.mjs');
const PROJECT_ID = '8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d';
const TEST_AK = 'test-ak';
const TEST_SK = 'test-sk';
const TEST_ENDPOINT_HEADER = 'https://projectman.cn-north-4.myhuaweicloud.com';

const BASE_ENV = (() => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('CODEARTS_REQ_')) delete env[key];
  }
  return env;
})();

function runCli(args, envOverrides = {}) {
  return new Promise((resolve) => {
    const env = { ...BASE_ENV };
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === null) delete env[key];
      else env[key] = String(value);
    }

    const child = spawn(process.execPath, [CLI, ...args], { cwd: ROOT, env, windowsHide: true });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      resolve({ code: -1, stdout: '', stderr: String(error) });
    });
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

async function withServer(handler, fn) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const record = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(record);
      handler(record, res);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn({ endpoint: `http://127.0.0.1:${port}`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonReply(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json;charset=utf-8' });
  res.end(text);
}

function encodeRfc(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// 独立实现华为云 SDK-HMAC-SHA256 验签，用于校验 CLI 发出的真实请求头。
function verifySignature(request, sk) {
  const authorization = request.headers.authorization ?? '';
  const match = /^SDK-HMAC-SHA256 Access=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(authorization);
  if (!match) return { ok: false, reason: `Authorization 格式不符: ${authorization}` };

  const [, accessKey, signedHeaderList, actualSignature] = match;
  const signedHeaders = signedHeaderList.split(';');
  if (!signedHeaders.includes('host') || !signedHeaders.includes('x-sdk-date')) {
    return { ok: false, reason: `SignedHeaders 缺少 host/x-sdk-date: ${signedHeaderList}` };
  }

  const headersText = signedHeaders
    .map((name) => {
      const raw = name === 'host' ? request.headers.host : request.headers[name];
      return `${name}:${String(raw ?? '').trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');

  const url = new URL(request.url, 'http://placeholder');
  const canonicalUri = url.pathname
    .split('/')
    .map((segment) => encodeRfc(decodeURIComponent(segment)))
    .join('/');

  const queryPairs = [...url.searchParams.entries()].map(([key, value]) => [encodeRfc(key), encodeRfc(value)]);
  queryPairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  const canonicalQuery = queryPairs.map(([key, value]) => `${key}=${value}`).join('&');

  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    headersText,
    signedHeaders.join(';'),
    crypto.createHash('sha256').update(request.body ?? '', 'utf8').digest('hex'),
  ].join('\n');

  const stringToSign = [
    'SDK-HMAC-SHA256',
    request.headers['x-sdk-date'],
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  const expected = crypto.createHmac('sha256', sk).update(stringToSign, 'utf8').digest('hex');
  if (expected !== actualSignature) return { ok: false, reason: '签名值与重算结果不一致' };
  if (accessKey !== TEST_AK) return { ok: false, reason: `Access 应为 ${TEST_AK}，实际 ${accessKey}` };
  return { ok: true };
}

const createArgs = (extra = []) => [
  'issue',
  'create',
  '登录页偶发白屏',
  '--project-id',
  PROJECT_ID,
  '--tracker',
  '2',
  '--priority',
  '2',
  ...extra,
];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('总帮助有内容且退出码为 0', async () => {
  const result = await runCli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /用法/);
  assert.match(result.stdout, /issue create/);
  assert.match(result.stdout, /退出码/);
  assert.equal(result.stderr, '');
});

test('issue create --help 含用法、参数与示例', async () => {
  const result = await runCli(['issue', 'create', '--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--project-id/);
  assert.match(result.stdout, /--tracker/);
  assert.match(result.stdout, /--priority/);
  assert.match(result.stdout, /示例/);
});

test('issue list --help 含分页与过滤参数', async () => {
  const result = await runCli(['issue', 'list', '--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--limit/);
  assert.match(result.stdout, /默认 20/);
  assert.match(result.stdout, /示例/);
});

test('无任何参数时退出码 2 且错误写入 stderr', async () => {
  const result = await runCli([]);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /用法/);
});

test('未知子命令退出码 2', async () => {
  const result = await runCli(['issue', 'remove']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /未知子命令/);
});

test('缺必填标志 --project-id 退出码 2 并写 stderr', async () => {
  const result = await runCli([
    'issue', 'create', '无项目', '--tracker', '2', '--priority', '1',
  ], { CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /project-id/);
  assert.equal(result.stdout, '');
});

test('tracker 非法（4）退出码 2', async () => {
  const result = await runCli([
    'issue', 'create', '类型错误', '--project-id', PROJECT_ID, '--tracker', '4', '--priority', '1',
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--tracker/);
  assert.match(result.stderr, /Task/);
});

test('priority 非法（9）退出码 2', async () => {
  const result = await runCli([
    'issue', 'create', '优先级错误', '--project-id', PROJECT_ID, '--tracker', '2', '--priority', '9',
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--priority/);
});

test('project-id 非 32 位 UUID 时退出码 2', async () => {
  const result = await runCli([
    'issue', 'create', '项目格式错误', '--project-id', 'not-a-uuid', '--tracker', '2', '--priority', '1',
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /32 位 UUID/);
});

test('日期格式非法退出码 2', async () => {
  const result = await runCli(createArgs(['--begin', '2026-13-40']));
  assert.equal(result.code, 2);
  assert.match(result.stderr, /begin/);
});

test('未知标志退出码 2', async () => {
  const result = await runCli(createArgs(['--nope', 'x']));
  assert.equal(result.code, 2);
  assert.match(result.stderr, /未知标志 --nope/);
});

test('创建工作项成功：退出码 0，结果写 stdout', async () => {
  await withServer((request, res) => {
    jsonReply(res, 200, {
      issue: { id: 1001, subject: '登录页偶发白屏', tracker_id: 2, priority_id: 2, status: { id: 1, name: '新建' } },
    });
  }, async ({ endpoint }) => {
    const result = await runCli(createArgs(), {
      CODEARTS_REQ_AK: TEST_AK,
      CODEARTS_REQ_SK: TEST_SK,
      CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /已创建工作项/);
    assert.match(result.stdout, /1001/);
    assert.match(result.stdout, /登录页偶发白屏/);
    assert.equal(result.stderr, '');
  });
});

test('--json 成功输出可被 JSON.parse，且字段完整', async () => {
  await withServer((request, res) => {
    jsonReply(res, 200, { issue: { id: 1002, subject: '登录页偶发白屏', tracker_id: 2, priority_id: 2 } });
  }, async ({ endpoint }) => {
    const result = await runCli(createArgs(['--json']), {
      CODEARTS_REQ_AK: TEST_AK,
      CODEARTS_REQ_SK: TEST_SK,
      CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.action, 'issue.create');
    assert.equal(payload.issue.id, 1002);
    assert.equal(payload.issue.tracker, 'Task');
    assert.equal(payload.issue.priority, '中');
  });
});

test('请求体按 CodeArts 字段映射且签名头可被独立验签', async () => {
  let verification = null;
  await withServer((request, res) => {
    verification = verifySignature(request, TEST_SK);
    jsonReply(res, 200, { issue: { id: 1003, subject: '登录页偶发白屏' } });
  }, async ({ endpoint, requests }) => {
    const result = await runCli(
      createArgs(['--description', '弱网下首次进入', '--severity', '2', '--status-id', '1', '--assigned-to', '10086']),
      { CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK, CODEARTS_REQ_ENDPOINT: endpoint },
    );
    assert.equal(result.code, 0, result.stderr);

    const request = requests[0];
    const body = JSON.parse(request.body);
    assert.equal(body.tracker_id, 2);
    assert.equal(body.priority_id, 2);
    assert.equal(body.subject, '登录页偶发白屏');
    assert.equal(body.description, '弱网下首次进入');
    assert.equal(body.severity_id, 2);
    assert.equal(body.status_id, 1);
    assert.equal(body.assigned_id, '10086');
    assert.equal(request.method, 'POST');
    assert.match(request.url, new RegExp(`^/v4/projects/${PROJECT_ID}/issues$`));

    const authorization = request.headers.authorization;
    assert.match(authorization, /^SDK-HMAC-SHA256 Access=test-ak, SignedHeaders=[a-z;-]+, Signature=[0-9a-f]{64}$/);
    assert.match(request.headers['x-sdk-date'], /^\d{8}T\d{6}Z$/);
    assert.equal(verification.ok, true, verification.reason);
  });
});

test('云端 4xx/5xx 退出码 3 且错误写 stderr', async () => {
  await withServer((request, res) => {
    jsonReply(res, 400, { error_code: 'PM.0001', error_msg: '项目不存在' });
  }, async ({ endpoint }) => {
    const result = await runCli(createArgs(), {
      CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK, CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 3);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /项目不存在/);
  });
});

test('--json 模式下云端错误也输出可解析 JSON 到 stderr', async () => {
  await withServer((request, res) => {
    jsonReply(res, 500, { error_code: 'PM.9999', error_msg: '服务内部错误' });
  }, async ({ endpoint }) => {
    const result = await runCli(createArgs(['--json']), {
      CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK, CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 3);
    assert.equal(result.stdout, '');
    const payload = JSON.parse(result.stderr);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.exitCode, 3);
    assert.equal(payload.error.kind, 'cloud');
  });
});

test('缺少 AK/SK 时退出码 5', async () => {
  const result = await runCli(createArgs(), {
    CODEARTS_REQ_AK: null,
    CODEARTS_REQ_SK: null,
    CODEARTS_REQ_ENDPOINT: TEST_ENDPOINT_HEADER,
  });
  assert.equal(result.code, 5);
  assert.match(result.stderr, /AK\/SK/);
  assert.equal(result.stdout, '');
});

test('网络不可达退出码 4', async () => {
  const probe = http.createServer(() => {});
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));

  const result = await runCli(createArgs(), {
    CODEARTS_REQ_AK: TEST_AK,
    CODEARTS_REQ_SK: TEST_SK,
    CODEARTS_REQ_ENDPOINT: `http://127.0.0.1:${port}`,
    CODEARTS_REQ_TIMEOUT_MS: '2000',
  });
  assert.equal(result.code, 4);
  assert.match(result.stderr, /网络请求失败/);
});

test('hcloud 降级模式拼出 ProjectMan 命令并返回成功', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-cli-hcloud-'));
  const fakeScript = path.join(tempDir, 'fake-hcloud.mjs');
  const logFile = path.join(tempDir, 'argv.json');

  fs.writeFileSync(fakeScript, [
    "import fs from 'node:fs';",
    'fs.writeFileSync(process.env.FAKE_HCLOUD_LOG, JSON.stringify(process.argv.slice(2)));',
    "process.stdout.write(JSON.stringify({ issue: { id: 778, subject: '降级创建', tracker_id: 2, priority_id: 3 } }));",
  ].join('\n'), 'utf8');

  try {
    const result = await runCli(createArgs(['--priority', '3', '--iteration', '12']), {
      CODEARTS_REQ_AUTH: 'hcloud',
      CODEARTS_REQ_HCLOUD_BIN: JSON.stringify([process.execPath, fakeScript]),
      CODEARTS_REQ_ENDPOINT: 'https://projectman.cn-north-4.myhuaweicloud.com',
      FAKE_HCLOUD_LOG: logFile,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /778/);

    const argv = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    assert.equal(argv[0], 'ProjectMan');
    assert.equal(argv[1], 'CreateIssueV4');
    assert.ok(argv.includes(`--project_id=${PROJECT_ID}`));
    assert.ok(argv.includes('--tracker_id=2'));
    assert.ok(argv.includes('--priority_id=3'));
    assert.ok(argv.includes('--iteration_id=12'));
    assert.ok(argv.includes('--subject=登录页偶发白屏'));
    assert.ok(argv.includes('--cli-region=cn-north-4'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hcloud 未安装时退出码 5', async () => {
  const result = await runCli(createArgs(), {
    CODEARTS_REQ_AUTH: 'hcloud',
    CODEARTS_REQ_HCLOUD_BIN: path.join(os.tmpdir(), 'definitely-missing-hcloud-binary'),
  });
  assert.equal(result.code, 5);
  assert.match(result.stderr, /未找到 hcloud CLI/);
});

test('issue list 默认分页 limit=20&offset=0', async () => {
  await withServer((request, res) => {
    jsonReply(res, 200, {
      total: 42,
      issues: [
        { id: 1, subject: '任务一', tracker_id: 2, priority_id: 1, status: { name: '新建' } },
        { id: 2, subject: '任务二', tracker_id: 3, priority_id: 3, status: { name: '处理中' } },
      ],
    });
  }, async ({ endpoint, requests }) => {
    const result = await runCli(['issue', 'list', '--project-id', PROJECT_ID], {
      CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK, CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 0, result.stderr);

    const url = new URL(requests[0].url, 'http://placeholder');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(url.searchParams.get('offset'), '0');
    assert.equal(requests[0].method, 'GET');
    assert.match(result.stdout, /任务一/);
    assert.match(result.stdout, /共 42 条/);
  });
});

test('issue list --json 给出分页信息与条目', async () => {
  await withServer((request, res) => {
    jsonReply(res, 200, { total: 3, issues: [{ id: 7, subject: '分页项', tracker_id: 6, priority_id: 2 }] });
  }, async ({ endpoint }) => {
    const result = await runCli(['issue', 'list', '--project-id', PROJECT_ID, '--limit', '10', '--offset', '5', '--json'], {
      CODEARTS_REQ_AK: TEST_AK, CODEARTS_REQ_SK: TEST_SK, CODEARTS_REQ_ENDPOINT: endpoint,
    });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.page.limit, 10);
    assert.equal(payload.page.offset, 5);
    assert.equal(payload.page.total, 3);
    assert.equal(payload.items[0].id, 7);
    assert.equal(payload.items[0].tracker, 'Feature');
  });
});

test('endpoint 缺失协议时退出码 5', async () => {
  const result = await runCli(createArgs(), {
    CODEARTS_REQ_AK: TEST_AK,
    CODEARTS_REQ_SK: TEST_SK,
    CODEARTS_REQ_ENDPOINT: 'projectman.example.com',
  });
  assert.equal(result.code, 5);
  assert.match(result.stderr, /CODEARTS_REQ_ENDPOINT/);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(`  ${String(error?.message ?? error).split('\n').join('\n  ')}`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exitCode = failed === 0 ? 0 : 1;