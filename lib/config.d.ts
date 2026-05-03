import { z } from 'zod';
export declare const TOOL_NAME = "test-alibi";
export declare const VERSION = "0.1.0";
export declare const DEFAULT_CONFIG_PATH = ".github/test-alibi.yml";
export declare const ConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        warn: "warn";
        fail: "fail";
    }>>;
    coverage: z.ZodDefault<z.ZodArray<z.ZodString>>;
    min_changed_line_coverage: z.ZodDefault<z.ZodNumber>;
    min_file_changed_line_coverage: z.ZodDefault<z.ZodNumber>;
    ignore_paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    executable_extensions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    max_findings: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type TestAlibiConfig = z.infer<typeof ConfigSchema>;
export declare function loadConfig(configPath?: string, cwd?: string, overrides?: Partial<TestAlibiConfig>): TestAlibiConfig;
