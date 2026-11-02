import {
  CREATE_HELP,
  ISSUE_HELP,
  LIST_HELP,
  MAIN_HELP,
} from './help.mjs';
import {
  dateCheck,
  enumCheck,
  intCheck,
  parseArgs,
  projectIdCheck,
} from './args.mjs';
import { asCliError, EXIT, usageError } from './errors.mjs';
import { loadConfig } from './config.mjs';
import { requestJson } from './http.mjs';
import { buildHcloudCreateArgs, buildHcloudListArgs, runHcloud } from './hcloud.mjs';
import { normalizeIssue, normalizeIssueList, renderIssueText, renderListText } from './format.mjs';
import { writeBlock, writeError, writeJson } from './output.mjs';

const DEFAULT_LIMIT = 20;

const CREATE_SPEC = {
  command: 'issue create',
  synopsis: '<title> --project-id <uuid> --tracker <2|3|5|6|7> --priority <1|2|3> [标志...]',
  positionals: { min: 1, max: 1, label: '<title>' },
  flags: {
    'project-id': {
      key: 'projectId',
      type: 'string',
      required: true,
      metavar: '<uuid>',
      check: projectIdCheck('project-id'),
    },
    tracker: {
      key: 'tracker',
      type: 'string',
      required: true,
      metavar: '<id>',
      check: enumCheck('tracker', ['2', '3', '5', '6', '7'], '2=Task, 3=Bug, 5=Epic, 6=Feature, 7=Story'),
    },
    priority: {
      key: 'priority',
      type: 'string',
      required: true,
      metavar: '<id>',
      check: enumCheck('priority', ['1', '2', '3'], '1=低, 2=中, 3=高'),
    },
    description: { key: 'description', type: 'string', metavar: '<text>' },
    'status-id': { key: 'statusId', type: 'string', metavar: '<id>', check: intCheck('status-id', 1) },
    severity: { key: 'severity', type: 'string', metavar: '<id>', check: intCheck('severity', 1) },
    'assigned-to': { key: 'assignedTo', type: 'string', metavar: '<user>' },
    'parent-issue': { key: 'parentIssue', type: 'string', metavar: '<id>', check: intCheck('parent-issue', 1) },
    iteration: { key: 'iteration', type: 'string', metavar: '<id>', check: intCheck('iteration', 1) },
    begin: { key: 'begin', type: 'string', metavar: '<YYYY-MM-DD>', check: dateCheck('begin') },
    end: { key: 'end', type: 'string', metavar: '<YYYY-MM-DD>', check: dateCheck('end') },
    json: { key: 'json', type: 'boolean' },
  },
};

const LIST_SPEC = {
  command: 'issue list',
  synopsis: '--project-id <uuid> [--tracker <id>] [--status-id <id>] [--limit <n>] [--offset <n>] [--json]',
  positionals: { min: 0, max: 0 },
  flags: {
    'project-id': {
      key: 'projectId',
      type: 'string',
      required: true,
      metavar: '<uuid>',
      check: projectIdCheck('project-id'),
    },
    tracker: {
      key: 'tracker',
      type: 'string',
      metavar: '<id>',
      check: enumCheck('tracker', ['2', '3', '5', '6', '7'], '2=Task, 3=Bug, 5=Epic, 6=Feature, 7=Story'),
    },
    'status-id': { key: 'statusId', type: 'string', metavar: '<id>', check: intCheck('status-id', 1) },
    limit: { key: 'limit', type: 'string', metavar: '<n>', check: intCheck('limit', 1, 100) },
    offset: { key: 'offset', type: 'string', metavar: '<n>', check: intCheck('offset', 0) },
    json: { key: 'json', type: 'boolean' },
  },
};

function resolveHelp(argv) {
  if (argv.length === 0) return null;

  const first = argv[0];
  const wantsHelp = first === 'help' || argv.includes('--help') || argv.includes('-h');
  if (!wantsHelp) return null;

  const base = first === 'help' ? argv.slice(1) : argv;
  const words = base.filter((token) => !token.startsWith('-'));

  if (words[0] === 'issue') {
    if (words[1] === 'create') return CREATE_HELP;
    if (words[1] === 'list') return LIST_HELP;
    return ISSUE_HELP;
  }
  return MAIN_HELP;
}

function buildCreateBody(form) {
  const body = {
    tracker_id: form.trackerId,
    subject: form.title,
    priority_id: form.priority,
  };
  if (form.description !== undefined) body.description = form.description;
  if (form.statusId !== undefined) body.status_id = form.statusId;
  if (form.severity !== undefined) body.severity_id = form.severity;
  if (form.assignedTo !== undefined) body.assigned_id = form.assignedTo;
  if (form.parentIssue !== undefined) body.parent_issue_id = form.parentIssue;
  if (form.iteration !== undefined) body.iteration_id = form.iteration;
  if (form.begin !== undefined) body.begin_time = form.begin;
  if (form.end !== undefined) body.end_time = form.end;
  return body;
}

async function runCreate(argv, env) {
  const { values, positionals } = parseArgs(argv, CREATE_SPEC);
  const title = String(positionals[0]).trim();
  if (title === '') {
    throw usageError('工作项标题不能为空', '示例: req-cli issue create "登录页偶发白屏" --project-id <uuid> --tracker 2 --priority 2');
  }
  if (values.begin !== undefined && values.end !== undefined && values.end < values.begin) {
    throw usageError(`--end (${values.end}) 不能早于 --begin (${values.begin})`);
  }

  const config = loadConfig(env);
  const form = {
    projectId: values.projectId,
    title,
    trackerId: values.tracker,
    priority: values.priority,
    description: values.description,
    statusId: values.statusId,
    severity: values.severity,
    assignedTo: values.assignedTo,
    parentIssue: values.parentIssue,
    iteration: values.iteration,
    begin: values.begin,
    end: values.end,
  };

  const response = config.auth === 'hcloud'
    ? await runHcloud(buildHcloudCreateArgs(form, config.region), { env, timeoutMs: config.timeoutMs })
    : await requestJson({
      endpoint: config.endpoint,
      method: 'POST',
      pathname: `/v4/projects/${form.projectId}/issues`,
      body: buildCreateBody(form),
      ak: config.ak,
      sk: config.sk,
      timeoutMs: config.timeoutMs,
    });

  const issue = normalizeIssue(response?.issue ?? response);

  if (values.json) {
    writeJson({ ok: true, action: 'issue.create', auth: config.auth, projectId: form.projectId, issue });
  } else {
    writeBlock(process.stdout, `${renderIssueText(issue, form)}\n`);
  }
  return EXIT.OK;
}

async function runList(argv, env) {
  const { values } = parseArgs(argv, LIST_SPEC);
  const config = loadConfig(env);

  const limit = values.limit ?? DEFAULT_LIMIT;
  const offset = values.offset ?? 0;
  const page = { limit, offset };

  let response;
  if (config.auth === 'hcloud') {
    response = await runHcloud(
      buildHcloudListArgs(
        { projectId: values.projectId, limit, offset, trackerId: values.tracker, statusId: values.statusId },
        config.region,
      ),
      { env, timeoutMs: config.timeoutMs },
    );
  } else {
    const query = { limit, offset };
    if (values.tracker !== undefined) query.tracker_id = values.tracker;
    if (values.statusId !== undefined) query.status_id = values.statusId;

    response = await requestJson({
      endpoint: config.endpoint,
      method: 'GET',
      pathname: `/v4/projects/${values.projectId}/issues`,
      query,
      ak: config.ak,
      sk: config.sk,
      timeoutMs: config.timeoutMs,
    });
  }

  const { items, total } = normalizeIssueList(response);
  const pageInfo = { ...page, total, count: items.length };

  if (values.json) {
    writeJson({ ok: true, action: 'issue.list', auth: config.auth, projectId: values.projectId, page: pageInfo, items });
  } else {
    writeBlock(process.stdout, `${renderListText(items, pageInfo)}\n`);
  }
  return EXIT.OK;
}

export async function run(argv, env = process.env) {
  const jsonRequested = argv.includes('--json');

  try {
    const helpText = resolveHelp(argv);
    if (helpText !== null) {
      writeBlock(process.stdout, helpText);
      return EXIT.OK;
    }

    if (argv.length === 0) {
      writeBlock(process.stderr, MAIN_HELP);
      return EXIT.USAGE;
    }

    const [command, ...rest] = argv;
    if (command !== 'issue') {
      throw usageError(`未知命令 "${command}"`, '可用命令: issue（运行 req-cli --help 查看完整用法）');
    }

    const [subCommand, ...subArgs] = rest;
    if (subCommand === undefined) {
      writeBlock(process.stderr, ISSUE_HELP);
      return EXIT.USAGE;
    }

    if (subCommand === 'create') return await runCreate(subArgs, env);
    if (subCommand === 'list') return await runList(subArgs, env);

    throw usageError(`未知子命令 "issue ${subCommand}"`, '可用子命令: create, list');
  } catch (error) {
    const cliError = asCliError(error);
    writeError(cliError, { json: jsonRequested });
    return cliError.exitCode;
  }
}