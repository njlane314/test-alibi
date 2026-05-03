import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

export const TOOL_NAME = 'test-alibi';
export const VERSION = '0.1.2';
export const DEFAULT_CONFIG_PATH = '.github/test-alibi.yml';

export const ConfigSchema = z.object({
  mode: z.enum(['warn', 'fail']).default('warn'),
  coverage: z.array(z.string()).default(['coverage/lcov.info']),
  min_changed_line_coverage: z.number().min(0).max(1).default(0.6),
  min_file_changed_line_coverage: z.number().min(0).max(1).default(0.5),
  ignore_paths: z.array(z.string()).default(['**/*.test.ts', '**/*.spec.ts', '**/*.stories.tsx', 'generated/**', 'dist/**']),
  executable_extensions: z.array(z.string()).default(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']),
  max_findings: z.number().int().min(1).default(20)
});

export type TestAlibiConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath = DEFAULT_CONFIG_PATH, cwd = process.cwd(), overrides: Partial<TestAlibiConfig> = {}): TestAlibiConfig {
  const resolved = path.resolve(cwd, configPath);
  let section: unknown = {};
  if (fs.existsSync(resolved)) {
    const parsed = parse(fs.readFileSync(resolved, 'utf8')) ?? {};
    section = typeof parsed === 'object' && parsed !== null && 'test_alibi' in parsed ? (parsed as { test_alibi?: unknown }).test_alibi ?? {} : parsed;
  }
  return ConfigSchema.parse({ ...(section as object), ...compact(overrides) });
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
