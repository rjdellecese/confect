# Alchemy integration — proof of concept

**Experimental proof of concept. Not a supported integration, not published,
and not ready for production use.** This package explores the deployment-adapter
approach in [RFC #408](https://github.com/rjdellecese/confect/issues/408).

It uses Alchemy 2.0.0-beta.79 and the workspace's Effect v4 version. Confect's
published packages and application authoring model are unchanged.

## What it demonstrates

`Backend` is an Alchemy resource representing a code deployment to an **existing
Convex Cloud dev or prod deployment**. It does not own the database itself.
During apply it:

1. Resolves a deployment-scoped key and environment values from Effect Config.
2. Checks that the key's deployment name matches the supplied Convex Cloud URL.
3. Runs `pnpm exec confect codegen` in the application directory.
4. Reads the deployment's environment and updates only differing, explicitly
   configured variables through the Convex Deployment API.
5. Runs `pnpm exec convex deploy --yes` with an explicit credentials file.
6. Returns the configured backend URL as an Alchemy output.

Every apply runs codegen and deployment, even when resource props are unchanged.
This deliberately avoids caching until there is a complete fingerprint for
application sources, imported workspace packages, configuration, and tool versions.
Planning does not run codegen, read deployment credentials, or contact Convex.
Destroying the resource only removes its Alchemy state: it does not delete the
deployment, data, functions, or environment variables.

## Try it with a disposable deployment

Use a disposable **cloud dev deployment**, not your production database. You need
Node 24+, Bun for the Alchemy CLI, pnpm, and an existing Confect application with
`confect` and `convex` available through `pnpm exec`. Build any workspace library
dependencies first. This checkout's example application requires `pnpm build`.

From the repository root, install dependencies with `pnpm install`, then enter
`tools/alchemy-poc`. Supply these variables through your shell or CI environment:

| Variable                 | Value                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `CONFECT_POC_CWD`        | Absolute path to the Confect application's package directory                                |
| `CONFECT_POC_URL`        | Deployment origin, such as `https://your-deployment.convex.cloud`, without a trailing slash |
| `CONFECT_POC_DEPLOY_KEY` | A deployment-scoped `dev:…` or `prod:…` key matching that URL                               |
| `CONFECT_POC_APP_ENV`    | Value to set as the deployment's `APP_ENV` variable                                         |

Do not put credentials in `alchemy.run.ts`, command arguments, or committed files.
Use the process environment for this example. The pinned Alchemy CLI can also
load `.env` from its working directory; do not create one for this experiment.

Preview the plan:

```sh
pnpm exec alchemy plan --stage poc
```

Only after reviewing the target, apply it:

```sh
pnpm exec alchemy deploy --stage poc
```

The latter command **changes the deployment's functions, schema, indexes, and
configured environment variables**. Alchemy stages isolate state, not Convex
deployments: using a different `--stage` with the same URL still deploys to the
same database. Do not run concurrent applies against the same application
directory or deployment.

## Adapter inputs

Import `Backend` and `providers` from `./src/Backend` in an experimental stack.
`alchemy.run.ts` is a complete example using Alchemy's local state store.

- `cwd` selects the application package directory. Confect still discovers its
  normal `confect/` directory and honors the functions directory in `convex.json`.
- `url` is the existing Convex Cloud deployment origin, including its region
  segment when applicable.
- `deployKeyEnv` is the **name** of the local Effect Config entry holding the key.
- `env` maps remote environment names to **local Config entry names**, not values.
  For example, `{ APP_ENV: "CONFECT_POC_APP_ENV" }`. Omit it for no environment
  management. Removing an entry does not delete the remote variable.

The returned `url` can feed a frontend's build configuration or a Worker's
environment. Application clients still use Confect's existing client libraries
and their own authentication; deploy keys are never application credentials.

## Safety and limitations

The adapter stores configuration names and the public URL in Alchemy state,
not resolved credentials or environment values. The Convex CLI receives its
key through a mode-0600 file in a temporary directory, removed when the operation
finishes or is interrupted normally. An abrupt process termination can leave it
behind. The explicit `--env-file` prevents deployment selection from falling
back to application dotenv files. The adapter never edits those files.

Child-process output is suppressed because tools and user-authored modules can
print secrets. Failures report the step and exit code without raw subprocess or
HTTP response bodies. Commands have a five-minute timeout and HTTP operations
have a thirty-second timeout. For detailed codegen diagnostics, run
`pnpm exec confect codegen` separately in the application directory.

Environment changes precede code deployment and are **not rolled back** if the
push fails. Retrying rechecks the current environment and reruns the commands;
there is no automatic retry or exactly-once guarantee. Convex remains responsible
for validating and applying schemas and indexes. Environment updates can
invalidate subscriptions, which is why unchanged values are not rewritten.

This proof of concept does not provision projects or deployments, create previews,
support self-hosted deployments or custom domains, delete removed variables,
supervise local development, bind cloud capabilities into Convex handlers, or
replace Convex's deployment pipeline. It also does not yet provide incremental
deploys, cross-process locking, drift previews, or production-grade diagnostics.

## Verification

From the repository root:

```sh
pnpm exec vitest run --project confect-alchemy-poc
pnpm --filter confect-alchemy-poc typecheck
```

Tests substitute the Convex HTTP transport and command execution while exercising
the real orchestration and temporary-file lifecycle. They do not deploy to Convex.
A real deployment smoke test is still required before treating this as more than
a proof of concept.
