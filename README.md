# Attest

Green CI is not evidence unless it exercised the changed lines.

A diff-coverage tool that intersects changed executable lines with coverage data. It runs locally by default, emits deterministic JSON and Markdown, writes a GitHub Step Summary when used as an action, and can update one stable PR comment when requested.

## Install

```bash
pnpm add -D test-alibi
```

Run locally:

```bash
pnpm test-alibi scan --base origin/main --head HEAD --config .github/test-alibi.yml --format markdown
pnpm test-alibi scan --base origin/main --head HEAD --format json
```

## GitHub Actions

Use `actions/checkout` with full history so git comparisons are available.

```yaml
name: Attest

on:
  pull_request:

jobs:
  test_alibi:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: Eidetic-Research/attest@v1
        with:
          mode: warn
          comment: true
          coverage: coverage/lcov.info
```

Use `mode: fail` when findings should block the check. In `warn` mode, findings are reported but the action exits successfully unless a runtime error occurs.

## Config

Create `.github/test-alibi.yml`:

```yaml
test_alibi:
  coverage:
    - "coverage/lcov.info"
  min_changed_line_coverage: 0.6
  min_file_changed_line_coverage: 0.5
  ignore_paths:
    - "**/*.test.ts"
    - "**/*.spec.ts"
    - "**/*.stories.tsx"
    - "generated/**"
    - "dist/**"
  executable_extensions:
    - ".ts"
    - ".tsx"
    - ".js"
    - ".jsx"
    - ".py"
    - ".go"
    - ".rs"
```

## Example JSON

```json
{
  "tool": "test-alibi",
  "version": "0.1.3",
  "base": "origin/main",
  "head": "HEAD",
  "mode": "warn",
  "summary": {
    "findings": 1,
    "errors": 1,
    "warnings": 0
  },
  "findings": [
    {
      "id": "test-alibi:example",
      "severity": "error",
      "title": "Example finding",
      "message": "src/billing/entitlements.ts has 31 changed executable lines, but only 6 were covered by tests.",
      "evidence": {},
      "recommendation": "Add tests that exercise the changed lines or adjust the configured threshold."
    }
  ]
}
```

## Example Markdown

```markdown
Test Alibi found 1 finding.

1. src/billing/entitlements.ts has 31 changed executable lines, but only 6 were covered by tests.
   Evidence: see JSON output for matched paths and labels.
   Recommendation: Add tests that exercise the changed lines or adjust the configured threshold.
```

## Notes

- No telemetry.
- No LLM calls.
- No source-code upload.
- No external network calls except GitHub API calls for optional PR comments.
- The hidden PR comment marker is `<!-- test-alibi-report -->`.

## License

Test Alibi is licensed under the Business Source License 1.1. Evaluation, development, testing, security review, and use in public open-source repositories are allowed. Commercial use, including private/internal CI use, managed services, resale, hosted services, or competing products, requires a paid commercial license from Eidetic Research.

Each version converts to Apache-2.0 on the earlier of its configured Change Date or the fourth anniversary of that version's first public distribution. See [LICENSE](LICENSE).

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:action
```

The action bundle is written to `dist/index.js` with `@vercel/ncc`. Marketplace publication notes are in [MARKETPLACE.md](MARKETPLACE.md).
