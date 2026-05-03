import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { normalizeRepoPath, runGit } from './git.js';
import { TOOL_NAME, VERSION, loadConfig, type TestAlibiConfig } from './config.js';
import { createResult, type Finding, type Mode, type ScanResult } from './report.js';

export interface ScanOptions {
  base: string;
  head: string;
  cwd?: string;
  configPath?: string;
  configOverrides?: Partial<TestAlibiConfig>;
  mode?: Mode;
  coverage?: string;
  eventPath?: string;
  modelPath?: string;
  since?: string;
}

export type CoverageMap = Map<string, Map<number, number>>;
export type ChangedLineMap = Map<string, Map<number, string>>;

export async function runScan(options: ScanOptions): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const coverageOverride = options.coverage ? { coverage: options.coverage.split(',').map((item) => item.trim()).filter(Boolean) } : undefined;
  const config = loadConfig(options.configPath, cwd, { ...options.configOverrides, ...coverageOverride });
  const mode = options.mode ?? config.mode;
  const diff = runGit(['diff', '--unified=0', options.base + '...' + options.head], cwd);
  const changed = parseChangedLines(diff);
  const coverage = readCoverage(config.coverage, cwd);
  const findings: Finding[] = [];
  let totalChanged = 0;
  let totalCovered = 0;

  for (const [file, lines] of [...changed.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (matchesAny(file, config.ignore_paths)) continue;
    if (!config.executable_extensions.includes(path.extname(file))) continue;
    const executableLines = [...lines.entries()].filter(([, text]) => isExecutableLine(text));
    if (executableLines.length === 0) continue;
    totalChanged += executableLines.length;
    const fileCoverage = coverage.get(file);
    if (!fileCoverage) {
      findings.push(finding('absent', file, executableLines.length, 0, config.min_file_changed_line_coverage));
      continue;
    }
    const covered = executableLines.filter(([line]) => (fileCoverage.get(line) ?? 0) > 0).length;
    totalCovered += covered;
    const ratio = covered / executableLines.length;
    if (covered === 0) {
      findings.push(finding('zero', file, executableLines.length, covered, config.min_file_changed_line_coverage));
    } else if (ratio < config.min_file_changed_line_coverage) {
      findings.push(finding('low-file', file, executableLines.length, covered, config.min_file_changed_line_coverage));
    }
    if (findings.length >= config.max_findings) break;
  }

  if (totalChanged > 0) {
    const ratio = totalCovered / totalChanged;
    if (ratio < config.min_changed_line_coverage && findings.length < config.max_findings) {
      findings.push({
        id: 'test-alibi:' + stableHash('overall'),
        severity: 'error',
        title: 'Changed-line coverage below threshold',
        message: 'Overall changed-line coverage is ' + percent(ratio) + '; required: ' + percent(config.min_changed_line_coverage) + '.',
        evidence: { changed_lines: totalChanged, covered_lines: totalCovered, required: config.min_changed_line_coverage, summary: totalCovered + ' of ' + totalChanged + ' changed executable lines were covered' },
        recommendation: 'Add tests that execute the changed lines or adjust the configured threshold.'
      });
    }
  }

  return createResult({ tool: TOOL_NAME, version: VERSION, base: options.base, head: options.head, mode, findings: findings.slice(0, config.max_findings) });
}

export function parseLcov(text: string, cwd = process.cwd()): CoverageMap {
  const coverage: CoverageMap = new Map();
  let current: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      current = normalizeRepoPath(line.slice(3).trim(), cwd);
      coverage.set(current, coverage.get(current) ?? new Map());
    } else if (line.startsWith('DA:') && current) {
      const [lineNo = Number.NaN, hits = Number.NaN] = line.slice(3).split(',').map((value) => Number.parseInt(value, 10));
      if (Number.isFinite(lineNo) && Number.isFinite(hits)) coverage.get(current)?.set(lineNo, hits);
    } else if (line === 'end_of_record') {
      current = undefined;
    }
  }
  return coverage;
}

export function parseChangedLines(diff: string): ChangedLineMap {
  const files: ChangedLineMap = new Map();
  let current: string | undefined;
  let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      current = line.slice(6);
      files.set(current, files.get(current) ?? new Map());
      continue;
    }
    if (line.startsWith('+++ /dev/null')) { current = undefined; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) { newLine = Number.parseInt(hunk[1] ?? '0', 10); continue; }
    if (!current || line.length === 0) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      files.get(current)?.set(newLine, line.slice(1));
      newLine += 1;
    } else if (line.startsWith('-')) {
      continue;
    } else if (!line.startsWith('diff --git') && !line.startsWith('index ') && !line.startsWith('--- ')) {
      newLine += 1;
    }
  }
  return files;
}

function readCoverage(files: string[], cwd: string): CoverageMap {
  const merged: CoverageMap = new Map();
  for (const file of files) {
    const resolved = path.resolve(cwd, file);
    if (!fs.existsSync(resolved)) continue;
    for (const [source, lines] of parseLcov(fs.readFileSync(resolved, 'utf8'), cwd)) {
      const target = merged.get(source) ?? new Map<number, number>();
      for (const [line, hits] of lines) target.set(line, Math.max(target.get(line) ?? 0, hits));
      merged.set(source, target);
    }
  }
  return merged;
}

function isExecutableLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && trimmed !== '*/';
}

function finding(kind: string, file: string, changed: number, covered: number, required: number): Finding {
  const ratio = changed === 0 ? 1 : covered / changed;
  const message = file + ' has ' + changed + ' changed executable lines, but only ' + covered + ' were covered by tests. Changed-line coverage: ' + percent(ratio) + '; required: ' + percent(required) + '.';
  return {
    id: 'test-alibi:' + stableHash(kind + ':' + file),
    severity: 'error',
    title: 'Changed lines not covered',
    message,
    evidence: { path: file, changed_lines: changed, covered_lines: covered, coverage: round(ratio), required, summary: covered + ' of ' + changed + ' changed executable lines were covered' },
    recommendation: 'Add tests that execute the changed lines or ignore this path in test-alibi config if coverage is not meaningful.'
  };
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.length > 0 && picomatch(patterns, { dot: true })(file);
}

function percent(value: number): string { return (value * 100).toFixed(1) + '%'; }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
function stableHash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12); }
