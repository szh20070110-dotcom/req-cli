#!/usr/bin/env node
import { run } from '../lib/cli.mjs';

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`错误: ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}