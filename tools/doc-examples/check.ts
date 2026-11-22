import { $ } from "bun";

try {
  const result = await $`docgen --no-enforce-version`.quiet().nothrow();
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  } else if (!/\b[1-9]\d* example\(s\) found\b/.test(result.text())) {
    process.stderr.write("docgen found no TypeScript examples to check\n");
    process.exitCode = 1;
  }
} finally {
  await $`rm -rf dist/docgen`;
}
