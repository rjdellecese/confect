# Capy project configuration

Repository instructions live in `AGENTS.md`, review invariants in `REVIEW.md`,
and reusable workflows in `.agents/skills/`. Capy discovers these skills without
separate slash-command files. Keep third-party skills managed through
`pnpm skills` and `skills-lock.json`.

Capy stores Setup, tool-hook mappings, Automations, and MCP registrations in
the project, not in Git. The scripts below keep executable behavior reviewable
and branch-aware; the mappings describe how to configure the project.

## Setup and hooks

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
files because one patch can touch multiple paths. Hook failures and remaining
lint diagnostics must be reported, not silently discarded.

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
