import { extname } from "node:path";

interface PostToolUseInput {
  readonly cwd: string;
  readonly hook_event_name: "PostToolUse";
  readonly tool_name: "apply_patch";
  readonly tool_input: {
    readonly command?: string;
  };
}

const FORMAT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".json",
  ".jsonc",
  ".json5",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".htm",
  ".vue",
  ".css",
  ".scss",
  ".less",
  ".md",
  ".mdx",
  ".graphql",
  ".gql",
  ".hbs",
]);
const LINT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

const input = JSON.parse(await Bun.stdin.text()) as PostToolUseInput;
const patch = input.tool_input.command ?? "";
const files = [...patch.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)].map(
  (match) => match[1],
);
const uniqueFiles = [...new Set(files)];
const formatFiles = uniqueFiles.filter((file) =>
  FORMAT_EXTENSIONS.has(extname(file).toLowerCase()),
);
const lintFiles = uniqueFiles.filter((file) =>
  LINT_EXTENSIONS.has(extname(file).toLowerCase()),
);

const run = (args: ReadonlyArray<string>) =>
  Bun.spawnSync(args, {
    cwd: input.cwd,
    stderr: "inherit",
    stdout: "inherit",
  });

if (formatFiles.length > 0) {
  run(["pnpm", "oxfmt", "--write", ...formatFiles]);
}

if (lintFiles.length > 0) {
  run(["pnpm", "oxlint", "--fix", ...lintFiles]);
}
