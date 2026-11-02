export const TRACKER_NAMES = {
  2: 'Task',
  3: 'Bug',
  5: 'Epic',
  6: 'Feature',
  7: 'Story',
};

export const PRIORITY_NAMES = {
  1: '低',
  2: '中',
  3: '高',
};

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
}

export function normalizeIssue(raw) {
  const source = raw ?? {};
  const trackerId = toNumber(source.tracker?.id ?? source.tracker_id);
  const priorityId = toNumber(source.priority?.id ?? source.priority_id);

  const issue = {
    id: source.id ?? source.issue_id ?? source.issueId,
    subject: source.subject ?? source.title,
  };

  if (source.description !== undefined) issue.description = source.description;
  if (trackerId !== undefined) {
    issue.trackerId = trackerId;
    issue.tracker = TRACKER_NAMES[trackerId] ?? source.tracker?.name;
  } else if (source.tracker?.name) {
    issue.tracker = source.tracker.name;
  }

  if (priorityId !== undefined) {
    issue.priorityId = priorityId;
    issue.priority = PRIORITY_NAMES[priorityId] ?? source.priority?.name;
  } else if (source.priority?.name) {
    issue.priority = source.priority.name;
  }

  const statusId = toNumber(source.status?.id ?? source.status_id);
  if (statusId !== undefined) issue.statusId = statusId;
  const statusName = source.status?.name ?? (typeof source.status === 'string' ? source.status : undefined);
  if (statusName !== undefined) issue.status = statusName;

  const assigned = source.assigned_to ?? source.assigned_user;
  if (assigned !== undefined && assigned !== null) {
    issue.assignedTo = typeof assigned === 'object' ? assigned.name ?? assigned.id : assigned;
  }

  if (source.created_time !== undefined) issue.createdTime = source.created_time;
  if (source.updated_time !== undefined) issue.updatedTime = source.updated_time;
  if (source.issue_url !== undefined) issue.url = source.issue_url;

  return issue;
}

export function normalizeIssueList(response) {
  const source = response ?? {};
  const rawItems = Array.isArray(source)
    ? source
    : source.issues ?? source.work_items ?? source.records ?? source.data ?? [];
  const items = Array.isArray(rawItems) ? rawItems.map(normalizeIssue) : [];
  const total = toNumber(source.total ?? source.total_count ?? source.count) ?? items.length;
  return { items, total };
}

function displayWidth(text) {
  let width = 0;
  for (const char of String(text ?? '')) {
    width += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char)
      ? 2
      : 1;
  }
  return width;
}

function padTo(text, width) {
  return `${text}${' '.repeat(Math.max(0, width - displayWidth(text)))}`;
}

export function renderIssueText(issue, form) {
  const rows = [];
  rows.push(['ID', String(issue.id ?? '-')]);
  rows.push(['标题', issue.subject ?? form?.title ?? '-']);
  rows.push(['项目', form?.projectId ?? '-']);
  rows.push(['类型', issue.tracker ? `${issue.tracker}（${issue.trackerId ?? form?.trackerId}）` : String(form?.trackerId ?? '-')]);
  rows.push(['优先级', issue.priority ? `${issue.priority}（${issue.priorityId ?? form?.priority}）` : String(form?.priority ?? '-')]);
  if (issue.status) rows.push(['状态', issue.status]);
  if (issue.assignedTo) rows.push(['处理人', issue.assignedTo]);
  if (issue.createdTime) rows.push(['创建时间', issue.createdTime]);
  if (issue.url) rows.push(['链接', issue.url]);

  const labelWidth = Math.max(...rows.map(([label]) => displayWidth(label)));
  const lines = ['已创建工作项', ...rows.map(([label, value]) => `  ${padTo(label, labelWidth)}  ${value}`)];
  return lines.join('\n');
}

export function renderListText(items, page) {
  const header = ['ID', '类型', '优先级', '状态', '标题'];
  const rows = items.map((issue) => [
    String(issue.id ?? '-'),
    String(issue.tracker ?? '-'),
    String(issue.priority ?? '-'),
    String(issue.status ?? '-'),
    String(issue.subject ?? '-'),
  ]);

  const widths = header.map((column, index) =>
    Math.max(displayWidth(column), ...rows.map((row) => displayWidth(row[index]))),
  );

  const lines = [
    header.map((column, index) => padTo(column, widths[index] + 2)).join('').trimEnd(),
    ...rows.map((row) => row.map((cell, index) => padTo(cell, widths[index] + 2)).join('').trimEnd()),
  ];

  if (items.length === 0) {
    lines.push('（当前页没有数据）');
  }

  const start = page.offset + 1;
  const end = page.offset + items.length;
  lines.push('');
  lines.push(`共 ${page.total} 条，当前返回 ${items.length === 0 ? 0 : start}-${end} 条（limit=${page.limit}, offset=${page.offset}）`);
  return lines.join('\n');
}