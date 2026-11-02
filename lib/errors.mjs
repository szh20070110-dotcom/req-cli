export const EXIT = {
  OK: 0,
  INTERNAL: 1,
  USAGE: 2,
  CLOUD: 3,
  NETWORK: 4,
  CONFIG: 5,
};

const KIND_BY_EXIT = {
  [EXIT.OK]: 'ok',
  [EXIT.INTERNAL]: 'internal',
  [EXIT.USAGE]: 'usage',
  [EXIT.CLOUD]: 'cloud',
  [EXIT.NETWORK]: 'network',
  [EXIT.CONFIG]: 'config',
};

export class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? EXIT.USAGE;
    this.hint = options.hint;
    this.details = options.details;
    if (options.cause) this.cause = options.cause;
  }

  get kind() {
    return KIND_BY_EXIT[this.exitCode] ?? 'internal';
  }

  toJSON() {
    const payload = { kind: this.kind, exitCode: this.exitCode, message: this.message };
    if (this.hint) payload.hint = this.hint;
    if (this.details) payload.details = this.details;
    return payload;
  }
}

export function usageError(message, hint) {
  return new CliError(message, { exitCode: EXIT.USAGE, hint });
}

export function configError(message, hint) {
  return new CliError(message, { exitCode: EXIT.CONFIG, hint });
}

export function cloudError(message, options = {}) {
  const details = {};
  if (options.status !== undefined) details.status = options.status;
  if (options.code !== undefined) details.code = options.code;
  if (options.requestId !== undefined) details.requestId = options.requestId;
  if (options.details) Object.assign(details, options.details);

  return new CliError(message, {
    exitCode: EXIT.CLOUD,
    hint: options.hint,
    details: Object.keys(details).length > 0 ? details : undefined,
  });
}

export function networkError(message, options = {}) {
  const details = {};
  if (options.code !== undefined) details.code = options.code;
  if (options.details) Object.assign(details, options.details);

  return new CliError(message, {
    exitCode: EXIT.NETWORK,
    hint: options.hint,
    details: Object.keys(details).length > 0 ? details : undefined,
  });
}

export function asCliError(error) {
  if (error instanceof CliError) return error;
  const message = error?.message ?? String(error);
  return new CliError(`未预期的内部错误: ${message}`, {
    exitCode: EXIT.INTERNAL,
    hint: '请携带上述信息反馈问题，或用 --help 检查用法',
    cause: error,
  });
}