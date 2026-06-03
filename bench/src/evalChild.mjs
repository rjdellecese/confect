// Cold-start module-evaluation probe. Spawned fresh per measurement so the
// module cache and JIT are cold, mirroring a Convex isolate evaluating a
// function module top-level. Imports one bundled entry and reports the
// wall-clock time of that top-level evaluation as JSON on stdout.
//
// argv[2] = absolute path to a bundled .mjs entry.

const target = process.argv[2];
const t0 = performance.now();
await import(target);
const ms = performance.now() - t0;
process.stdout.write(JSON.stringify({ ms }));
