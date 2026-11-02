# req-cli

用 Node.js 封装华为云 CodeArts 需求管理（ProjectMan v4）的极简命令行工具：**零第三方依赖**，只使用 Node 内置模块，覆盖「创建工作项」和「查询工作项列表」两个高频操作。

> 本仓库是一次「如何将华为云服务封装成 CLI」的实践：把云 API 的参数校验、AK/SK 签名、错误分层、可脚本化的输出，收敛成一个人人可用的命令。

## 安装与入口

```bash
# 在仓库根目录，本地安装命令
npm link

# 或直接用 node 运行，无需安装
node bin/req-cli.mjs --help
```

- 入口文件：`bin/req-cli.mjs`
- `package.json` 的 `bin`：`"req-cli": "bin/req-cli.mjs"`
- 子命令：
  - `req-cli issue create <title>` — 创建工作项
  - `req-cli issue list` — 分页查询工作项列表

## 帮助（--help）

每个层级都有完整的帮助说明（用法、参数、示例）：

```bash
req-cli --help
req-cli issue --help
req-cli issue create --help
req-cli issue list --help
```

`--help`（或 `-h`）可以放在任意位置，命中后直接打印帮助并以 **0** 退出，不会发起任何网络请求。

## 参数与标志

### `issue create <title>`

| 标志 | 必填 | 说明 |
| --- | --- | --- |
| `<title>` | 是 | 工作项标题，含空格时用引号包裹 |
| `--project-id <uuid>` | 是 | 项目 ID，32 位 UUID（也接受 `8-4-4-4-12` 带连字符形式） |
| `--tracker <id>` | 是 | 类型：`2`=Task、`3`=Bug、`5`=Epic、`6`=Feature、`7`=Story |
| `--priority <id>` | 是 | 优先级：`1`=低、`2`=中、`3`=高 |
| `--description <text>` | 否 | 详细描述 |
| `--status-id <id>` | 否 | 状态 ID（正整数） |
| `--severity <id>` | 否 | 严重程度 ID（正整数） |
| `--assigned-to <user>` | 否 | 处理人（用户 ID 或名称） |
| `--parent-issue <id>` | 否 | 父工作项 ID（正整数） |
| `--iteration <id>` | 否 | 迭代 ID（正整数） |
| `--begin <YYYY-MM-DD>` | 否 | 计划开始日期 |
| `--end <YYYY-MM-DD>` | 否 | 计划完成日期，不能早于 `--begin` |
| `--json` | 否 | 输出机器可读 JSON |

### `issue list`

| 标志 | 必填 | 说明 |
| --- | --- | --- |
| `--project-id <uuid>` | 是 | 项目 ID，32 位 UUID |
| `--tracker <id>` | 否 | 按类型过滤 |
| `--status-id <id>` | 否 | 按状态 ID 过滤 |
| `--limit <n>` | 否 | 每页条数，1–100，**默认 20** |
| `--offset <n>` | 否 | 偏移量，**默认 0** |
| `--json` | 否 | 输出机器可读 JSON（含分页信息） |

标志支持 `--name value` 与 `--name=value` 两种写法。

## 退出码（分层）

| 退出码 | 含义 | 典型场景 |
| --- | --- | --- |
| `0` | 成功 | 创建/查询完成 |
| `2` | 参数非法 | 缺少必填标志、UUID 格式错误、枚举越界、未知标志 |
| `3` | 云端报错 | HTTP 4xx/5xx、响应体无法解析、hcloud 非 0 退出 |
| `4` | 网络错误 | DNS 失败、连接被拒、超时、连接重置 |
| `5` | 缺少配置 | 缺 AK/SK、endpoint 非法、找不到 hcloud CLI |
| `1` | 未预期内部错误（兜底） | 非上述分类的异常 |

退出码遵循「先参数、后配置、再网络/云端」的顺序：参数不合法时不会因为缺 AK/SK 而改报 5。

## 结构化输出（--json）

加 `--json` 后，stdout 只输出**单个可被 `JSON.parse` 的对象**，便于管道和脚本消费。

成功（创建）：

```json
{
  "ok": true,
  "action": "issue.create",
  "auth": "ak",
  "projectId": "8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d",
  "issue": {
    "id": 1001,
    "subject": "登录页偶发白屏",
    "trackerId": 2,
    "tracker": "Task",
    "priorityId": 2,
    "priority": "中",
    "status": "新建"
  }
}
```

成功（列表）：

```json
{
  "ok": true,
  "action": "issue.list",
  "projectId": "8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d",
  "page": { "limit": 20, "offset": 0, "total": 42, "count": 2 },
  "items": [{ "id": 1, "subject": "任务一", "tracker": "Task" }]
}
```

失败时同样输出 JSON，但写入 **stderr**：

```json
{
  "ok": false,
  "error": {
    "kind": "cloud",
    "exitCode": 3,
    "message": "项目不存在",
    "details": { "status": 400, "code": "PM.0001" }
  }
}
```

## stdout / stderr 分离

- **stdout**：只有成功结果（文本或 JSON）。
- **stderr**：所有错误信息（人类可读文本，或 `--json` 下的 JSON）。
- 因此在管道中可直接使用：`req-cli issue list --json | jq '.items[].id'`，错误不会污染数据流。

## 鉴权与配置

### 默认：AK/SK 签名（SDK-HMAC-SHA256）

请求自动携带：

- `X-Sdk-Date: YYYYMMDDTHHMMSSZ`（UTC）
- `Authorization: SDK-HMAC-SHA256 Access=<AK>, SignedHeaders=<h1;h2>, Signature=<hex>`

签名流程与华为云 API 网关规范一致：对 `METHOD\nURI\nQuery\nHeaders\nSignedHeaders\nSHA256(Body)` 做 SHA256，再对 `SDK-HMAC-SHA256\n<X-Sdk-Date>\n<hash>` 用 SK 做 HMAC-SHA256。

| 环境变量 | 必填 | 说明 |
| --- | --- | --- |
| `CODEARTS_REQ_AK` | 是（ak 模式） | 访问密钥 AK |
| `CODEARTS_REQ_SK` | 是（ak 模式） | 访问密钥 SK |
| `CODEARTS_REQ_ENDPOINT` | 否 | 服务地址，默认 `https://projectman.cn-north-4.myhuaweicloud.com` |
| `CODEARTS_REQ_AUTH` | 否 | `ak`（默认）或 `hcloud` |
| `CODEARTS_REQ_REGION` | 否 | hcloud 降级时使用的区域，默认从 endpoint 推断 |
| `CODEARTS_REQ_TIMEOUT_MS` | 否 | 超时毫秒，1000–120000，默认 `15000` |
| `CODEARTS_REQ_HCLOUD_BIN` | 否 | hcloud 可执行文件；也支持 JSON 数组形式包裹命令（测试或特殊环境） |

### 降级：调用本机 hcloud CLI

当 `CODEARTS_REQ_AUTH=hcloud` 时，不再直连 API，而是拼装并执行本机 KooCLI 命令，鉴权交给 hcloud 自身配置：

```bash
export CODEARTS_REQ_AUTH=hcloud
req-cli issue create "登录页偶发白屏" --project-id <uuid> --tracker 2 --priority 2
# 实际执行:
# hcloud ProjectMan CreateIssue --project_id=<uuid> --subject=登录页偶发白屏 \
#   --tracker_id=2 --priority_id=2 --cli-region=cn-north-4 --cli-output=json

req-cli issue list --project-id <uuid>
# 实际执行:
# hcloud ProjectMan ListIssues --project_id=<uuid> --limit=20 --offset=0 \
#   --cli-region=cn-north-4 --cli-output=json
```

该模式适合本机已配置好 KooCLI 凭证的开发者；找不到 hcloud 时返回退出码 **5**。

## 使用示例

```bash
export CODEARTS_REQ_AK="<your-ak>"
export CODEARTS_REQ_SK="<your-sk>"

# 1) 创建一个 Task
req-cli issue create "登录页偶发白屏" \
  --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d \
  --tracker 2 --priority 2 \
  --description "弱网下首次进入登录页，约 3 秒白屏" \
  --begin 2026-11-03 --end 2026-11-10

# 2) 创建一个高优 Bug，输出 JSON
req-cli issue create "移动端启动崩溃" \
  --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d \
  --tracker 3 --priority 3 --assigned-to 10086 --json

# 3) 查询 Bug 列表，第二页
req-cli issue list --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d \
  --tracker 3 --limit 20 --offset 20

# 4) 脚本中只取 ID
req-cli issue list --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d --json | jq -r '.items[].id'
```

## 测试

不依赖任何测试框架，用 `child_process` 启动真实 CLI 进程，配本地 HTTP 服务断言请求、签名与退出码：

```bash
npm test
```

覆盖 23 组用例：帮助文本、必填/枚举/UUID 校验、创建成功、`--json` 可解析、云端错误 3、缺 AK/SK 5、网络错误 4、独立验签（签名头格式与算法）、hcloud 降级命令拼装、列表默认分页等。

## 目录结构

```
bin/req-cli.mjs   入口（package.json 的 bin 指向此处）
lib/args.mjs      标志解析与参数校验
lib/cli.mjs       子命令主流程
lib/config.mjs    环境变量与配置校验
lib/signer.mjs    SDK-HMAC-SHA256 签名
lib/http.mjs      HTTP 请求与错误分类
lib/hcloud.mjs    hcloud 降级命令拼装与执行
lib/format.mjs    响应归一化与文本渲染
lib/help.mjs      各级帮助文本
lib/output.mjs    stdout / stderr 输出约定
lib/errors.mjs    退出码与错误类型
test-cli.mjs      真实进程测试
```

## API 对照

| 操作 | HTTP | 路径 |
| --- | --- | --- |
| 创建工作项 | `POST` | `/v4/projects/{project_id}/issues` |
| 查询工作项列表 | `GET` | `/v4/projects/{project_id}/issues?limit&offset` |

请求体字段：`tracker_id`、`subject`、`priority_id`、`description`、`status_id`、`severity_id`、`assigned_id`、`parent_issue_id`、`iteration_id`、`begin_time`、`end_time`。