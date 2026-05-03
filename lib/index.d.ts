import { type TestAlibiConfig } from './config.js';
import { type Mode, type ScanResult } from './report.js';
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
export declare function runScan(options: ScanOptions): Promise<ScanResult>;
export declare function parseLcov(text: string, cwd?: string): CoverageMap;
export declare function parseChangedLines(diff: string): ChangedLineMap;
