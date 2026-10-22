# Native compiler protocol v1

This is an experimental, provisional capture boundary, not a production compiler or an input-stability receipt.

## Transport

stdin and stdout carry frames: a four-byte unsigned big-endian byte length followed by UTF-8 JSON. Length is 1 through 8,388,608 bytes. No stdout logging. Every object rejects duplicate and unknown keys, missing required keys, null in nonnullable fields, and trailing JSON. All message fields listed below are required. IDs are positive JSON safe integers. Host request IDs strictly increase across all requests, including callback replies. Build IDs and epochs strictly increase on each Rebuild. One process has one context; no Create after disposal. Protocol errors, truncated frames, unknown callback IDs and host loss close the service after cleanup. EOF after completed disposal is normal.

Every message has `version: 1`, `id`, and `tag`. Responses echo the initiating request ID. Callback events use `id: 0`; `callbackId` is a separate monotonically increasing ID. At most one build, 32 outstanding callbacks, eight concurrent native loads, 32 pending disposal acknowledgments and 64 queued outbound frames are allowed. The fixed load gate is acquired before filesystem reads; cancellation and host loss release queued loads without reading. Output backpressure beyond that queue closes the session. No arbitrary pluginData crosses the boundary.

## Host messages

- `Hello`: `esbuildVersion: "0.28.2"`, `capabilities: ["resolve-rpc", "file-scope", "capture-v1", "cancel-v1"]`. Exact versions and exact capability set are required.
- `Create`: `options: {root, entries, outdir, conditions, tsconfigRaw}`. After Hello, only one creation attempt is permitted per process, including an attempt rejected for invalid options or a native Context error; start a new process to retry. Root, outdir and every entry are absolute paths; entries and conditions are string arrays; tsconfigRaw is a JSON string supplied by Node. Fixed options: bundle, Node platform, ESM, target node22, sourcemap external, metafile, write false, log silent, keepNames true. File-scope injection is enabled. No arbitrary plugins, build options, native tsconfig discovery, overlays or loader maps.
- `Rebuild`: `buildId`, `epoch`.
- `ResolveResult`: `callbackId`, `buildId`, `epoch`, `decision`. Decision is either `{mode: "probe"}` or `{mode: "result", result: ResolveDecision}`.
- `CallbackCancelled`: `callbackId`, `buildId`, `epoch`. This acknowledges that host callback work has settled; it is valid only after CancelCallbacks.
- `Cancel`: `buildId`. When the latest build already completed and no newer build is active, Cancel is an acknowledged no-op. Its earlier provisional Capture may have status Succeeded or Failed, and no CancelCallbacks event is emitted. Unknown or superseded build IDs are rejected.
- `Dispose`: no additional fields; repeated Dispose is idempotent.

`ResolveDecision` has `path`, `namespace`, `suffix` (strings), `external`, `sideEffects` (booleans), `errors`, `warnings` (diagnostic arrays), `watchFiles`, `watchDirs` (string arrays). Empty namespace means file for bundled results. Supported bundled namespaces are file and confect-generated. Host adapts optional esbuild result properties to these explicit defaults. A probe decision uses the native probe unchanged, including side effects. Node owns generated/authored selection and all external runtime resolution and metafile normalization.

## Native messages

- `Hello`: `esbuildVersion`, `capabilities`, `maxFrameBytes: 8388608`, `maxCallbacks: 32`.
- `Created`: `contextId: 1`.
- `Resolve`: `callbackId`, `buildId`, `epoch`, `args: {path, importer, namespace, resolveDir, kind, with}`, `probe: {path, namespace, suffix, external, sideEffects, errors, warnings}`. `with` is a string-to-string map. Kind uses esbuild's JavaScript spellings. Native calls public build.Resolve with a private sentinel before sending this event. Node runs the real CompilationPlugin callback, supplies this probe for its build.resolve call, and returns probe mode when that callback returns undefined. No second native resolution replaces the probe.
- `CancelCallbacks`: `buildId`, `epoch`, `callbackIds` (array). Each callback must settle with ResolveResult or CallbackCancelled before cancellation acknowledgment. Callbacks not yet emitted are suppressed.
- `Capture`: `buildId`, `epoch`, `status` (Succeeded, Failed or Cancelled), `provisional: true`, `sources`, `outputs`, `metafile` (raw JSON string), `errors`, `warnings`. This answers Rebuild, and precedes Cancelled/Disposed. A source has `path`, `namespace`, `suffix`, `attributes`, `loader`, `resolveDir`, `sha256`, `originalSha256`, `bytesBase64`. Original digest always hashes disk bytes before transformations. Output records have `path`, `sha256`, `bytesBase64`. Source ordering is deterministic. Never publish this as a stable receipt without Node's epoch/guard/coverage checks.
- `Cancelled`: `buildId`, after native Cancel and Rebuild and all callbacks settle.
- `Disposed`: `contextId: 1`, `disposeCount: 1`, after the owned OnDispose callback completes.
- `Rejected`: `code`, `message` for a well-framed but invalid lifecycle/options request. Invalid wire shapes instead terminate the session.

Diagnostics have `{id, pluginName, text, location, notes}`. Location is null or `{file, namespace, line, column, length, lineText, suggestion}`; notes have `{text, location}`. Arbitrary diagnostic detail is not serialized.

## Loading and limits

Native owns disk loading and captures the same bytes supplied to OnLoad. It checks lexical and realpath `.env.local` basenames case-insensitively before content IO on every OS. This private boundary deliberately rejects case variants even on case-sensitive filesystems; production compiler behavior is unchanged. This is not protection against concurrent symlink replacement, nor an interception of native resolver metadata reads (for example, a package.json symlink); Node's configuration guards remain necessary. A single source read is capped at 8 MiB, and aggregate source captures have a 4 MiB budget including estimated record overhead.

JS/TS (`.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, `.tsx`) use bundle-require 5.1.0 file-scope transformation before attribute handling, matching production's injection ordering. File-scope injection requires valid UTF-8. File namespace injected sources report an empty resolveDir; generated sources report their directory. Ordinary JSON uses loader `default` and explicit resolveDir. In the file fallback loader, attributes are only `type: json`, `type: text`, or `type: bytes`; other attributes fail. JSON attributes use CompilationSources' JSON-to-JS transformation with original provenance. Generated disk files use confect-generated namespace; non-code generated files use JSON for `.json`, otherwise text, before attribute handling. Non-entry imports matching `convex.config` fail explicitly. Data URLs, unsupported loaders/namespaces and arbitrary plugins fail explicitly.

Cancellation stops accepting new callback work, asks Node to settle in-flight work, cancels native compilation and waits for all of it. Disposal first stops new builds and performs cancellation, then disposes the retained context and waits for owned plugin cleanup. Host loss releases callback waiters locally before disposal. Captures exceeding the frame limit fail closed instead of partially emitting JSON. Native resolution watch candidates include higher-priority extension alternatives so retained rebuilds can observe newly created files; this does not replace Node configuration and resolution guards.
