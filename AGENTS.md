# AGENTS.md

## Source Code Reference

Source code for dependencies is cached at `~/.opensrc/` for deeper understanding of implementation details.

See `~/.opensrc/sources.json` for the list of cached packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Reading Source Code

Use `pnpm opensrc path` inside other commands to search, read, or explore a package's source. It fetches source code on cache miss and prints the cached absolute path to stdout.

```bash
rg "pattern" $(pnpm opensrc path <package>)
cat $(pnpm opensrc path <package>)/path/to/file
find $(pnpm opensrc path <package>) -name "*.ts"
```

Works with any registry:

```bash
rg "pattern" $(pnpm opensrc path pypi:<package>)
rg "pattern" $(pnpm opensrc path crates:<package>)
rg "pattern" $(pnpm opensrc path <owner>/<repo>)
```

## Cursor Cloud specific instructions

### Running the example app

The example app is in `apps/example`. To start it:

```bash
cd apps/example
pnpm dev
```

This runs Vite, the Convex local backend, and the Confect codegen watcher concurrently.

#### Convex environment variables

The Convex local backend requires certain environment variables. After starting the dev server for the first time (so the local backend is initialized), set them from the checked-in defaults file:

```bash
cd apps/example
pnpm convex env set < .env.defaults
```

This bulk-sets all variables from `.env.defaults` (added in convex 1.33.0). The values are stored in the local backend's state (`.convex/`) and persist across restarts, but not across fresh clones or environment resets.

#### Ports

The example app uses three local ports, all accessible from the browser:

- **5173**: Vite dev server (frontend)
- **3210**: Convex backend (WebSocket sync, used by `VITE_CONVEX_URL`)
- **3211**: Convex HTTP actions server (used by `VITE_CONVEX_SITE_URL`)
