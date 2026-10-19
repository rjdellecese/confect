import { createServer } from "node:net";
import { assert, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  EvaluationFailed,
  type Request,
  type Snapshot,
} from "../src/Protocol.ts";
import { evaluate, evaluateNative } from "../src/Runner.ts";

const request = (
  code: string,
  options: {
    readonly invoke?: boolean;
    readonly imports?: Readonly<Record<string, string>>;
    readonly externals?: Snapshot["externals"];
  } = {},
): Request => ({
  snapshot: {
    entry: "/snapshot/entry.ts",
    modules: [
      {
        id: "/snapshot/entry.ts",
        file: "/nonexistent/entry.ts",
        code,
        imports: options.imports ?? {},
      },
    ],
    externals: options.externals ?? [],
  },
  exportName: "default",
  invoke: options.invoke ?? false,
});

const quote = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const exited = (pid: number): void => {
  expect(pid).not.toBe(process.pid);
  expect(() => process.kill(pid, 0)).toThrow(
    expect.objectContaining({ code: "ESRCH" }),
  );
};

it.live(
  "returns an export through advanced IPC and waits for the worker to exit",
  () =>
    Effect.gen(function* () {
      const result = yield* evaluate(
        request(`
      setInterval(() => {}, 1000);
      __vite_ssr_exports__.default = { pid: process.pid, value: new Map([["big", 42n]]) };
    `),
      );
      const value = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          pid: Schema.Finite,
          value: Schema.Unknown,
        }),
      )(result);
      expect(value.value).toEqual(new Map([["big", 42n]]));
      exited(value.pid);
    }).pipe(Effect.timeout("5 seconds")),
);

it.live(
  "starts a fresh process with fresh module and global state for every evaluation",
  () =>
    Effect.gen(function* () {
      const input = request(
        `
      globalThis.prototypeCount = (globalThis.prototypeCount ?? 0) + 1;
      const external = await __vite_ssr_import__("counter");
      __vite_ssr_exports__.default = async () => ({
        pid: process.pid, global: globalThis.prototypeCount, external: external.next()
      });
    `,
        {
          invoke: true,
          imports: { counter: "external" },
          externals: [
            {
              id: "external",
              url: "data:text/javascript,let count=0;export const next=()=>++count",
              type: "module",
            },
          ],
        },
      );
      const run = evaluate(input).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Struct({
              pid: Schema.Finite,
              global: Schema.Finite,
              external: Schema.Finite,
            }),
          ),
        ),
      );
      const first = yield* run;
      const second = yield* run;
      expect(first).toMatchObject({ global: 1, external: 1 });
      expect(second).toMatchObject({ global: 1, external: 1 });
      expect(first.pid).not.toBe(second.pid);
      exited(first.pid);
      exited(second.pid);
    }).pipe(Effect.timeout("5 seconds")),
);

it.live(
  "preserves shared module identity and live bindings across a diamond graph",
  () =>
    Effect.gen(function* () {
      const result = yield* evaluate({
        exportName: "default",
        invoke: true,
        snapshot: {
          entry: "entry",
          externals: [],
          modules: [
            {
              id: "entry",
              file: "/missing/entry.ts",
              imports: { left: "left", right: "right", state: "state" },
              code: `
            const left = await __vite_ssr_import__("left");
            const right = await __vite_ssr_import__("right");
            const state = await __vite_ssr_dynamic_import__("state");
            __vite_ssr_exports__.default = () => {
              left.bump();
              return { same: left.token === right.token && right.token === state.token, count: right.read() };
            };
          `,
            },
            {
              id: "left",
              file: "/missing/left.ts",
              imports: { "./state": "state" },
              code: `
            const state = await __vite_ssr_import__("./state");
            __vite_ssr_exports__.token = state.token;
            __vite_ssr_exports__.bump = state.bump;
          `,
            },
            {
              id: "right",
              file: "/missing/right.ts",
              imports: { "./state": "state" },
              code: `
            const state = await __vite_ssr_import__("./state");
            __vite_ssr_exports__.token = state.token;
            __vite_ssr_exports__.read = () => state.count;
          `,
            },
            {
              id: "state",
              file: "/missing/state.ts",
              imports: {},
              code: `
            let count = 0;
            __vite_ssr_exportName__("count", () => count);
            __vite_ssr_exports__.token = {};
            __vite_ssr_exports__.bump = () => { count++; };
          `,
            },
          ],
        },
      });
      expect(result).toEqual({ same: true, count: 1 });
    }).pipe(Effect.timeout("5 seconds")),
);

it.live("resolves the same specifier independently for each importer", () =>
  Effect.gen(function* () {
    const result = yield* evaluate({
      exportName: "default",
      invoke: false,
      snapshot: {
        entry: "entry",
        externals: [],
        modules: [
          {
            id: "entry",
            file: "/missing/entry.ts",
            imports: { left: "left", right: "right" },
            code: `
            const [left, right] = await Promise.all([__vite_ssr_import__("left"), __vite_ssr_import__("right")]);
            __vite_ssr_exports__.default = [left.default, right.default];
          `,
          },
          ...["left", "right"].flatMap((side): Snapshot["modules"] => [
            {
              id: side,
              file: `/missing/${side}.ts`,
              imports: { "./value": `${side}-value` },
              code: `
              const value = await __vite_ssr_dynamic_import__("./value");
              __vite_ssr_exports__.default = value.default;
            `,
            },
            {
              id: `${side}-value`,
              file: `/missing/${side}/value.ts`,
              imports: {},
              code: `__vite_ssr_exports__.default = ${quote(side)};`,
            },
          ]),
        ],
      },
    });
    expect(result).toEqual(["left", "right"]);
  }).pipe(Effect.timeout("5 seconds")),
);

it.live.each([
  "node:fs",
  "data:text/javascript,export default 1",
  "/snapshot/entry.ts",
  "./unknown",
  "toString",
])("fails closed for an undeclared import %s", (specifier) =>
  Effect.gen(function* () {
    const result = yield* evaluate(
      request(`
      await __vite_ssr_import__(${quote(specifier)});
      __vite_ssr_exports__.default = "unreachable";
    `),
    ).pipe(Effect.result);
    assert(Result.isFailure(result));
    expect(result.failure).toBeInstanceOf(EvaluationFailed);
    expect(result.failure.message).toContain("is not in the snapshot");
  }).pipe(Effect.timeout("5 seconds")),
);

it.live.each([
  {
    code: "__vite_ssr_exports__.other = 1;",
    invoke: false,
    message: "is missing",
  },
  {
    code: "__vite_ssr_exports__.default = 1;",
    invoke: true,
    message: "is not callable",
  },
  {
    code: "__vite_ssr_exports__.default = () => 1;",
    invoke: false,
    message: "could not be cloned",
  },
  { code: "process.exit(23);", invoke: false, message: "code 23" },
  {
    code: "process.send({ unexpected: true }); await new Promise(() => {});",
    invoke: false,
    message: "_tag",
  },
])("models export and worker failures: $message", ({ code, invoke, message }) =>
  Effect.gen(function* () {
    const result = yield* evaluate(request(code, { invoke })).pipe(
      Effect.result,
    );
    assert(Result.isFailure(result));
    expect(result.failure).toBeInstanceOf(EvaluationFailed);
    expect(result.failure.message).toContain(message);
  }).pipe(Effect.timeout("5 seconds")),
);

it.live("terminates a worker that throws with active handles", () =>
  Effect.gen(function* () {
    const result = yield* evaluate(
      request(`
      setInterval(() => {}, 1000);
      throw { toString: () => String(process.pid) };
    `),
    ).pipe(Effect.result);
    assert(Result.isFailure(result));
    const pid = Number(result.failure.message);
    expect(Number.isInteger(pid)).toBe(true);
    expect(pid).toBeGreaterThan(0);
    exited(pid);
  }).pipe(Effect.timeout("5 seconds")),
);

it.live(
  "kills and reaps an interrupted worker after a readiness handshake",
  () =>
    Effect.gen(function* () {
      const server = createServer();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          server.close();
        }),
      );
      yield* Effect.callback<void>((resume) => {
        server.listen(0, "127.0.0.1", () => resume(Effect.void));
      });
      const address = server.address();
      assert(address !== null && typeof address !== "string");
      const ready = Effect.callback<number>((resume) => {
        server.once("connection", (socket) => {
          socket.once("data", (data) => {
            resume(Effect.succeed(Number(data.toString())));
            socket.destroy();
          });
        });
      });
      const waiting = yield* ready.pipe(Effect.forkScoped);
      const input = request(
        `
      const net = await __vite_ssr_import__("node:net");
      const socket = net.connect(${address.port}, "127.0.0.1", () => socket.write(String(process.pid)));
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    `,
        {
          imports: { "node:net": "net" },
          externals: [{ id: "net", url: "node:net", type: "builtin" }],
        },
      );
      const running = yield* evaluate(input).pipe(Effect.forkScoped);
      const pid = yield* Fiber.join(waiting);
      yield* Fiber.interrupt(running);
      exited(pid);
    }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
);

it.live(
  "evaluates the native oracle in a separate fresh process each time",
  () =>
    Effect.gen(function* () {
      const run = evaluateNative({
        _tag: "Native",
        url: `data:text/javascript,${encodeURIComponent(`
        globalThis.prototypeCount = (globalThis.prototypeCount ?? 0) + 1;
        setInterval(() => {}, 1000);
        export default async () => ({ pid: process.pid, count: globalThis.prototypeCount });
      `)}`,
        exportName: "default",
        invoke: true,
      }).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Struct({ pid: Schema.Finite, count: Schema.Finite }),
          ),
        ),
      );
      const first = yield* run;
      const second = yield* run;
      expect(first.count).toBe(1);
      expect(second.count).toBe(1);
      expect(first.pid).not.toBe(second.pid);
      exited(first.pid);
      exited(second.pid);
    }).pipe(Effect.timeout("5 seconds")),
);
