# Capy project configuration

Repository instructions live in `AGENTS.md`, review invariants in `REVIEW.md`,
and reusable workflows in `.agents/skills/`. Capy discovers these skills without
separate slash-command files. Keep third-party skills managed through
`pnpm skills` and `skills-lock.json`.

Capy stores Setup, tool-hook mappings, Automations, and MCP registrations in
the project, not in Git. The scripts below keep executable behavior reviewable
and branch-aware. The hook mappings are proposed, not verified end-to-end;
do not cut over until the documentation and runtime checks below are resolved.

## Setup and hooks

### Official documentation and verification status

Sources checked on September 8, 2026:

- [Dev environment: Tool hooks](https://docs.capy.ai/configs/dev-environment#tool-hooks)
  documents `pre`/`post` configuration, `commands` arrays, the tool names
  `bash`, `edit`, `write`, `read`, and `apply_patch`, and the agent filters
  `capy` and `review`. Its edit/write examples use `${file_path}`.
- [Update Setup API reference](https://docs.capy.ai/api-reference/setup/update-setup)
  documents the `hooks` object and `${variable}` interpolation from tool
  arguments/results for post hooks. Its schema instead lists the agent filters
  `captain`, `build`, and `review`, and its pre-hook description uses
  `bash_run`. These disagree with the guide; do not assume the two interfaces
  accept interchangeable names.
- [Setup overview](https://docs.capy.ai/api-reference/setup/overview)
  documents project-side persistence and migration from deprecated
  `.capy/settings.json` hooks. A repository script alone does not install a
  tool hook.

The guide explicitly warns: "Hook configuration ships today and the agent can
read and write it; enforcement around tool calls is still rolling out, so
don't treat a hook as a security boundary yet."

These pages do not establish the pre-read `${path}` contract, interpolation
escaping, hook working directory, or whether a non-zero pre-hook exit prevents
the read. They also do not specify how post-hook failures reach the agent.
The scripts have been tested directly, not through Capy's automatic dispatch;
their exit codes prove script behavior, not tool blocking or diagnostic delivery.

Before merging the hook migration, resolve the documentation mismatch and
obtain the missing runtime contract from Capy. Then verify automatic dispatch,
path interpolation, working directory, pre-hook rejection, and post-hook
diagnostic delivery using harmless fixtures. Do not test with `.env.local` or
installed dependency source. A successful setup snapshot validates lifecycle
scripts, not these tool-hook semantics.

### Proposed mappings

| Project setting       | Command                                          |
| --------------------- | ------------------------------------------------ |
| Initialize            | `bash .agents/scripts/setup.sh`                  |
| Update after checkout | `bash .agents/scripts/setup.sh`                  |
| Before `read`         | `bash .agents/hooks/pre-read.sh "${path}"`       |
| After `edit`          | `bash .agents/hooks/post-file.sh "${file_path}"` |
| After `write`         | `bash .agents/hooks/post-file.sh "${file_path}"` |
| After `apply_patch`   | `bash .agents/hooks/post-patch.sh`               |

Leave startup empty. Apply the hooks to coding agents (`capy`), not read-only
review agents. The post-patch hook processes staged, unstaged, and untracked
files because one patch can touch multiple paths. The scripts retain non-zero
exit codes and diagnostics; Capy's delivery of those failures still needs
verification.

Do not switch project Setup to these commands until the scripts exist on every
branch used to start machines, including `main` and `v10`. Until then, retain
the existing inline Setup commands. After the cutover, validate Setup with a
test snapshot build. Neither hook configuration nor repository instructions
are a sandbox boundary; the `.env.local` and dependency-source rules also apply
to shell commands and other tools.

## Automations

The dependency-upgrade workflows are the `upgrade-internal-deps`,
`upgrade-published-deps`, `upgrade-runtime-pins`, and `upgrade-effect-rc` skills.
Automation prompts should invoke the appropriate skill rather than duplicate
its steps. `sync-main-into-prerelease` owns main-to-prerelease propagation;
the Effect upgrade must not perform that sync itself.

Keep schedules disabled unless the user explicitly asks to enable them. Keep
`release-docs` and `managing-prereleases` on demand because they can publish
documentation or packages.

## MCP servers

Register these servers at project scope through Capy's MCP review flow:

| Server   | Transport               | Configuration                                                                              |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Mintlify | HTTP, no authentication | `https://www.mintlify.com/docs/mcp`                                                        |
| Lucide   | stdio                   | Command: `pnpm`; arguments: `dlx`, `lucide-icons-mcp`, `--stdio`; no environment variables |

The table preserves the former repository MCP configuration; it does not
register or connect the servers. Each registration needs approval in Capy.
Never store credentials in this repository.
