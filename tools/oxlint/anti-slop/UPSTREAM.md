# Anti-slop provenance

- Source: <https://github.com/dmmulroy/anti-slop>
- Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Copied from: `skills/install-anti-slop/assets/anti-slop/`, verified against
  upstream `src/` with `node scripts/sync-skill-assets.mjs --check`.
- General plugin: `tools/oxlint/anti-slop/index.ts`.
- Effect plugin: `tools/oxlint/anti-slop/effect/index.ts`.
- Installer/update skill: `.agents/skills/install-anti-slop/`, tracked in
  `skills-lock.json`.

The plugin source is unchanged. Local additions are this provenance record,
the upstream root `LICENSE`, and a private `package.json` marking the copied
TypeScript as ES modules so Node loads it without reparsing warnings. The nested
`vendor/eslint-stylistic/LICENSE` and
`UPSTREAM.md` are preserved from upstream. Plugin tests are not included in the
upstream skill assets.

Both plugins are registered in `.oxlintrc.json`, which `vite.config.ts` also
loads. All 18 general rules, all five Effect rules, and the native
`oxc/no-accumulating-spread` companion rule are enabled as errors. The local
`@oxlint/plugins` dependency matches Oxlint at `1.82.0` rather than upstream's
`1.78.0`. Agent assets and the vendored plugin are excluded from linting and
formatting to preserve their upstream contents.

The Effect service-constructor import rule checks relative project imports;
package-alias imports are not enforced by that rule.
