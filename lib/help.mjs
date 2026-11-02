export const MAIN_HELP = `req-cli — 华为云 CodeArts 需求管理工作项命令行工具

用法:
  req-cli <命令> [子命令] [标志...]
  req-cli --help

命令:
  issue create <title>    创建一个工作项
  issue list              查询工作项列表

全局标志:
  -h, --help              显示帮助，可放在任意命令后（如 req-cli issue create --help）
  --json                  输出机器可读 JSON（错误同样以 JSON 写入 stderr）

示例:
  req-cli issue create "登录页偶发白屏" --project-id <uuid> --tracker 2 --priority 2
  req-cli issue list --project-id <uuid> --limit 10 --json

退出码:
  0 成功   2 参数非法   3 云端报错   4 网络错误   5 缺少配置

环境变量:
  CODEARTS_REQ_AK         访问密钥 AK（AK/SK 签名必填）
  CODEARTS_REQ_SK         访问密钥 SK（AK/SK 签名必填）
  CODEARTS_REQ_ENDPOINT   服务地址，默认 https://projectman.cn-north-4.myhuaweicloud.com
  CODEARTS_REQ_AUTH       鉴权模式：ak（默认）或 hcloud（降级调用本机 hcloud CLI）
  CODEARTS_REQ_REGION     hcloud 降级时使用的区域，默认从 endpoint 推断

运行 "req-cli issue create --help" 查看创建工作项的完整参数与示例。`;

export const ISSUE_HELP = `req-cli issue — 工作项相关操作

用法:
  req-cli issue create <title> [标志...]
  req-cli issue list [标志...]

子命令:
  create   创建工作项（Task/Bug/Epic/Feature/Story）
  list     分页查询工作项列表

示例:
  req-cli issue create "首页加载超过 3 秒" --project-id <uuid> --tracker 2 --priority 2
  req-cli issue list --project-id <uuid>

运行 "req-cli issue create --help" 或 "req-cli issue list --help" 查看详细用法。`;

export const CREATE_HELP = `req-cli issue create — 创建工作项

用法:
  req-cli issue create <title> --project-id <uuid> --tracker <id> --priority <id> [标志...]

位置参数:
  <title>                    工作项标题（必填；含空格时请用引号包裹）

必填标志:
  --project-id <uuid>        项目 ID，32 位 UUID（也接受 8-4-4-4-12 带连字符形式）
  --tracker <id>             工作项类型：2=Task  3=Bug  5=Epic  6=Feature  7=Story
  --priority <id>            优先级：1=低  2=中  3=高

可选标志:
  --description <text>       详细描述
  --status-id <id>           状态 ID（正整数）
  --severity <id>            严重程度 ID（正整数）
  --assigned-to <user>       处理人（用户 ID 或名称）
  --parent-issue <id>        父工作项 ID（正整数）
  --iteration <id>           迭代 ID（正整数）
  --begin <YYYY-MM-DD>       计划开始日期
  --end <YYYY-MM-DD>         计划完成日期（不能早于 --begin）
  --json                     以机器可读 JSON 输出到 stdout

示例:
  # 1) 创建一个 Task
  req-cli issue create "登录页偶发白屏" \\
    --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d \\
    --tracker 2 --priority 2 --description "复现步骤：弱网下首次进入登录页"

  # 2) 创建一个高优 Bug 并输出 JSON 供脚本消费
  req-cli issue create "移动端启动崩溃" --project-id <uuid> \\
    --tracker 3 --priority 3 --assigned-to 10086 --json

输出:
  成功时写 stdout；失败时写 stderr，且不会污染 stdout。

退出码:
  0 成功   2 参数非法   3 云端报错   4 网络错误   5 缺少配置

环境变量:
  CODEARTS_REQ_AK / CODEARTS_REQ_SK / CODEARTS_REQ_ENDPOINT
  CODEARTS_REQ_AUTH=ak|hcloud   CODEARTS_REQ_REGION`;

export const LIST_HELP = `req-cli issue list — 查询工作项列表

用法:
  req-cli issue list --project-id <uuid> [--tracker <id>] [--status-id <id>] [--limit <n>] [--offset <n>] [--json]

必填标志:
  --project-id <uuid>        项目 ID，32 位 UUID（也接受带连字符形式）

可选标志:
  --tracker <id>             按类型过滤：2=Task  3=Bug  5=Epic  6=Feature  7=Story
  --status-id <id>           按状态 ID 过滤（正整数）
  --limit <n>                每页条数，1-100，默认 20
  --offset <n>               偏移量，从 0 开始，默认 0
  --json                     以机器可读 JSON 输出到 stdout（含分页信息）

示例:
  # 1) 查询第一页（默认 20 条）
  req-cli issue list --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d

  # 2) 只查 Bug，每页 50 条，输出 JSON
  req-cli issue list --project-id <uuid> --tracker 3 --limit 50 --offset 0 --json

输出:
  文本表格（ID/类型/优先级/状态/标题）或 --json 的结构化结果；
  失败信息一律写 stderr。

退出码:
  0 成功   2 参数非法   3 云端报错   4 网络错误   5 缺少配置`;