# AGENTS.md

Instructions for AI coding agents working with this codebase.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

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
npx convex env set < .env.defaults
```

This bulk-sets all variables from `.env.defaults` (added in convex 1.33.0). The values are stored in the local backend's state (`.convex/`) and persist across restarts, but not across fresh clones or environment resets.

#### Convex WebSocket proxy

In cloud agent environments, only the Vite dev server port (5173) is forwarded to the browser. The Convex backend (port 3210) is not directly accessible. To handle this:

- `vite.config.ts` has a proxy that forwards `/api` requests (including WebSocket) to the Convex backend on port 3210.
- `.env.development.local` overrides `VITE_CONVEX_URL` to `http://127.0.0.1:5173` so the Convex client connects through Vite's proxy instead of directly to port 3210.
- Vite loads `.env.development.local` with higher priority than `.env.local` (which `convex dev` manages), so the override is stable.
