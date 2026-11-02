import { usageError } from './errors.mjs';

const UUID_PLAIN = /^[0-9a-f]{32}$/i;
const UUID_DASHED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectIdCheck(name = 'project-id') {
  return (raw) => {
    const value = String(raw).trim();
    if (!UUID_PLAIN.test(value) && !UUID_DASHED.test(value)) {
      throw usageError(
        `--${name} 需要 32 位 UUID，收到 "${raw}"`,
        '示例: --project-id 8a4b6c1e2d3f4a5b8c9d0e1f2a3b4c5d',
      );
    }
    return value.replace(/-/g, '').toLowerCase();
  };
}

export function enumCheck(name, allowed, description) {
  const list = allowed.map(String);
  return (raw) => {
    const value = String(raw).trim();
    if (!list.includes(value)) {
      throw usageError(`--${name} 取值非法: "${raw}"`, `可选值: ${description}`);
    }
    return Number(value);
  };
}

export function intCheck(name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return (raw) => {
    const value = String(raw).trim();
    if (!/^\d+$/.test(value)) {
      throw usageError(`--${name} 需要非负整数，收到 "${raw}"`);
    }
    const number = Number(value);
    if (number < min || number > max) {
      throw usageError(`--${name} 超出取值范围 ${min}-${max}，收到 ${number}`);
    }
    return number;
  };
}

export function dateCheck(name) {
  return (raw) => {
    const value = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw usageError(`--${name} 需要 YYYY-MM-DD 格式，收到 "${raw}"`);
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw usageError(`--${name} 不是合法日期: "${raw}"`, '示例: --begin 2026-11-03');
    }
    return value;
  };
}

export function parseArgs(argv, spec) {
  const values = Object.create(null);
  const positionals = [];
  const flags = spec.flags ?? {};
  let flagsEnded = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!flagsEnded && token === '--') {
      flagsEnded = true;
      continue;
    }

    if (!flagsEnded && token.startsWith('--')) {
      const equalIndex = token.indexOf('=');
      const name = equalIndex === -1 ? token.slice(2) : token.slice(2, equalIndex);
      const inline = equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
      const def = flags[name];

      if (!def) {
        throw usageError(
          `未知标志 --${name}`,
          `运行 "req-cli ${spec.command} --help" 查看可用标志`,
        );
      }

      if (def.type === 'boolean') {
        if (inline !== undefined) {
          throw usageError(`开关标志 --${name} 不接受取值`);
        }
        values[def.key] = true;
        continue;
      }

      let raw = inline;
      if (raw === undefined) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('--')) {
          throw usageError(
            `标志 --${name} 缺少取值`,
            `用法: --${name} ${def.metavar ?? '<value>'}`,
          );
        }
        raw = next;
        index += 1;
      }

      values[def.key] = def.check ? def.check(raw) : raw;
      continue;
    }

    if (!flagsEnded && token.startsWith('-') && token !== '-') {
      throw usageError(
        `未知短标志 ${token}`,
        '目前只内置 -h/--help，其余请使用长标志（--name value 或 --name=value）',
      );
    }

    positionals.push(token);
  }

  for (const [name, def] of Object.entries(flags)) {
    if (def.required && values[def.key] === undefined) {
      throw usageError(
        `缺少必填标志 --${name}`,
        `用法: req-cli ${spec.command} ${spec.synopsis}`,
      );
    }
  }

  const min = spec.positionals?.min ?? 0;
  const max = spec.positionals?.max ?? Number.POSITIVE_INFINITY;
  if (positionals.length < min) {
    throw usageError(
      `缺少位置参数 ${spec.positionals?.label ?? ''}`,
      `用法: req-cli ${spec.command} ${spec.synopsis}`,
    );
  }
  if (positionals.length > max) {
    throw usageError(
      `多余的位置参数: ${positionals.slice(max).join(' ')}`,
      `用法: req-cli ${spec.command} ${spec.synopsis}`,
    );
  }

  return { values, positionals };
}