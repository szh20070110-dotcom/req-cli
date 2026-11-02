export function writeBlock(stream, text) {
  const normalized = String(text ?? '').replace(/\s+$/, '');
  stream.write(`${normalized}\n`);
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeError(error, { json = false } = {}) {
  if (json) {
    const payload = { ok: false, error: error.toJSON() };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [`错误: ${error.message}`];
  if (error.hint) lines.push(`提示: ${error.hint}`);
  process.stderr.write(`${lines.join('\n')}\n`);
}