interface PreToolUseInput {
  readonly hook_event_name: "PreToolUse";
  readonly tool_name: "Bash";
  readonly tool_input: {
    readonly command?: string;
  };
}

const input = JSON.parse(await Bun.stdin.text()) as PreToolUseInput;
const command = input.tool_input.command ?? "";

const referencesLocalEnvironment =
  /(?:^|[\s"'`/\\])\.env\.local(?:$|[\s"'`/\\])/.test(command);
const referencesInstalledDependency =
  /(?:^|[\s"'`/\\])(?:node_modules|\.pnpm-store|\.pnpm)(?:$|[\s"'`/\\])/.test(
    command,
  );

if (referencesLocalEnvironment || referencesInstalledDependency) {
  const reason = referencesLocalEnvironment
    ? "Do not read `.env.local` files."
    : [
        "Do not read dependency source from `node_modules`, `.pnpm`, or `.pnpm-store`.",
        "Run `pnpm opensrc path <package-name>` and inspect the returned source directory instead.",
      ].join(" ");

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}
