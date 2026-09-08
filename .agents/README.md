# Capy project configuration

Repository instructions live in `AGENTS.md`, review invariants in `REVIEW.md`,
and reusable workflows in `.agents/skills/`. Capy discovers these skills without
separate slash-command files. Keep third-party skills managed through
`pnpm skills` and `skills-lock.json`.

Capy stores Setup, Automations, and MCP registrations in the project, not in
Git. The setup script keeps executable behavior reviewable and branch-aware.

## Setup

The [Environment documentation](https://docs.capy.ai/environment) describes
the lifecycle scripts. Use these project-side mappings:

| Project setting       | Command                         |
| --------------------- | ------------------------------- |
| Initialize            | `bash .agents/scripts/setup.sh` |
| Update after checkout | `bash .agents/scripts/setup.sh` |

Leave startup empty.

Do not switch project Setup to these commands until the scripts exist on every
branch used to start machines, including `main` and `v10`. Until then, retain
the existing inline Setup commands. After the cutover, validate Setup with a
test snapshot build.

## Formatting, linting, and read safety

Treat tool hooks as unsupported until a current configuration and runtime
contract is documented. Do not install hook scripts or project hook mappings.
Instead, follow `AGENTS.md` directly: run Oxfmt and Oxlint after edits, never
read `.env.local`, and use opensrc rather than installed dependency source.
These instructions apply to shell commands and other tools as well; they are
not a sandbox boundary.

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
