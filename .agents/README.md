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

### Documentation and verification status

Fresh browser and direct HTTP checks on September 8, 2026 supersede the earlier
search and text-fetch results, which returned stale documentation:

- `/configs/dev-environment` redirects to the current
  [Environment page](https://docs.capy.ai/environment). Its rendered page and
  Markdown response have no "Tool hooks" section.
- `/api-reference/setup/overview` and `/api-reference/setup/update-setup`
  return HTTP 404, including their `.md` variants.
- The current [documentation index](https://docs.capy.ai/llms.txt) does not list
  the former Setup API pages.

The earlier hook examples, agent filters, and "enforcement is still rolling
out" quotation are not verified current documentation. Do not use them as
evidence that the proposed hooks are supported or enforced.

The mappings below came from the project's existing Setup configuration and
an earlier migration branch, not a verified current public hook contract.
Current support for tool names and agent filters, the pre-read `${path}`
contract, interpolation escaping, hook working directory, pre-hook rejection,
and post-hook failure delivery all remain unverified.
The scripts have been tested directly, not through Capy's automatic dispatch;
their exit codes prove script behavior, not tool blocking or diagnostic delivery.

Before merging the hook migration, obtain a current authoritative configuration
and runtime contract from Capy. Then verify automatic dispatch,
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
