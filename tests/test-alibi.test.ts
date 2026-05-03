import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChangedLines, parseLcov, runScan } from '../src/index.js';
import { exitCodeFor } from '../src/report.js';

function repo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-alibi-'));
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Human']);
  git(dir, ['config', 'user.email', 'human@example.com']);
  write(dir, 'src/a.ts', 'export function a() {\n  return 1;\n}\n');
  commit(dir, 'initial');
  return dir;
}
function git(cwd: string, args: string[]): string { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function write(cwd: string, file: string, content: string): void { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), content); }
function commit(cwd: string, msg: string): void { git(cwd, ['add', '.']); git(cwd, ['commit', '-m', msg]); }

describe('test-alibi', () => {
  it('parses LCOV fixtures', () => {
    const coverage = parseLcov('SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n');
    expect(coverage.get('src/a.ts')?.get(1)).toBe(1);
    expect(coverage.get('src/a.ts')?.get(2)).toBe(0);
  });

  it('parses changed executable lines from unified-zero diffs', () => {
    const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,0 +2,2 @@\n+const a = 1;\n+// comment\n';
    const changed = parseChangedLines(diff);
    expect(changed.get('src/a.ts')?.get(2)).toBe('const a = 1;');
    expect(changed.get('src/a.ts')?.get(3)).toBe('// comment');
  });

  it('computes covered and uncovered changed lines', async () => {
    const cwd = repo();
    const base = git(cwd, ['rev-parse', 'HEAD']);
    write(cwd, 'src/a.ts', 'export function a() {\n  const value = 2;\n  return value;\n}\n');
    commit(cwd, 'change a');
    write(cwd, 'coverage/lcov.info', 'SF:src/a.ts\nDA:2,1\nDA:3,0\nend_of_record\n');
    const result = await runScan({ base, head: 'HEAD', cwd, coverage: 'coverage/lcov.info', configOverrides: { min_file_changed_line_coverage: 0.75, min_changed_line_coverage: 0.75 } });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]?.message).toContain('src/a.ts');
  });

  it('ignores configured paths and preserves fail/warn behavior', async () => {
    const cwd = repo();
    const base = git(cwd, ['rev-parse', 'HEAD']);
    write(cwd, 'src/a.test.ts', 'expect(true).toBe(true);\n');
    commit(cwd, 'test only');
    const result = await runScan({ base, head: 'HEAD', cwd, mode: 'fail' });
    expect(result.findings).toHaveLength(0);
    expect(exitCodeFor(result)).toBe(0);
  });
});
