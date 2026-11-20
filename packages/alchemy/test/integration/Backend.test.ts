import * as Array from "effect/Array";
import * as Rec from "effect/Record";
import { Confect, Convex } from "@confect/alchemy";
import { it, expect } from "@effect/vitest";
import { adopt } from "alchemy/AdoptPolicy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { stackFixture, failureOf } from "./StackFixture.js";

const name = "gentle-heron-7";
const url = `https://${name}.eu-west-1.convex.cloud`;
const rawKey = `prod:${name}|private-key-for-tests`;
const secret = "private-value-for-tests";
const deployKey = Redacted.make(rawKey);
const deployment = { name, url };
const cwd = import.meta.dirname;
const Update = Schema.fromJsonString(
  Schema.Struct({
    changes: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        value: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
);
const mockEnvironment = (live: Map<string, string>, log: string[]) =>
  Effect.fn(function* (r: Request) {
    const path = new URL(r.url);
    expect(path.origin).toBe(url);
    expect(r.headers.get("Authorization")).toBe(`Convex ${rawKey}`);
    if (
      r.method === "GET" &&
      path.pathname === "/api/v1/list_environment_variables"
    ) {
      log.push("list");
      return Response.json({ environmentVariables: Rec.fromEntries(live) });
    }
    if (
      r.method === "POST" &&
      path.pathname === "/api/v1/update_environment_variables"
    ) {
      const { changes } = yield* Effect.promise(() => r.text()).pipe(
        Effect.flatMap(Schema.decodeEffect(Update)),
      );
      for (const change of changes) {
        if (change.value === undefined) live.delete(change.name);
        else live.set(change.name, change.value);
      }
      log.push("write");
      return new Response(null);
    }
    return new Response(null, { status: 404 });
  });

it.effect(
  "refuses state marker keys before any environment reads or writes",
  () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const fixture = stackFixture({ fetch: mockEnvironment(new Map(), log) });
      for (const reserved of [
        "__proto__",
        "__redacted__",
        "__date__",
        "__bytes__",
      ]) {
        const declaration = Convex.EnvironmentVariables("Reserved", {
          url,
          deployKey,
          variables: { [reserved]: Redacted.make(secret) },
        }).pipe(adopt());
        const diagnostic = yield* failureOf(fixture.plan(declaration));
        expect(diagnostic).toContain("unsafe state key");
        expect(diagnostic).not.toContain(secret);
      }
      expect(log).toEqual([]);
    }),
);

it.effect(
  "borrows readable values, orders codegen and deploy after them, and restores before pushing",
  () =>
    Effect.gen(function* () {
      const live = new Map([
        ["ORIGIN", "old"],
        ["ANOTHER", "untouched"],
      ]);
      const log: string[] = [];
      const fixture = stackFixture({
        config: { key: rawKey, value: secret },
        fetch: mockEnvironment(live, log),
        run: (cmd) =>
          Effect.sync(() => {
            expect(cmd.options.stdin).toBe("ignore");
            expect(cmd.options.stderr).toBe("ignore");
            expect(cmd.options.stdout).toBe("ignore");
            expect(cmd.args).not.toContain(rawKey);
            expect(cmd.args).not.toContain(secret);
            if (cmd.args.includes("codegen")) log.push("prepare");
            else {
              expect(cmd.args).toContain("deploy");
              expect(cmd.args).toContain("--env-file");
              log.push("deploy");
            }
            return 0;
          }),
      });
      const declare = (env: Confect.BackendProps["env"]) =>
        Confect.Backend("Notes", {
          deployment,
          deployKey: Config.Redacted("key"),
          cwd,
          ...(env === undefined ? {} : { env }),
        }).pipe(Effect.map((b) => b.url));
      const env = { ORIGIN: Config.Redacted("value") };
      const denied = yield* Effect.exit(fixture.plan(declare(env)));
      expect(Exit.isFailure(denied)).toBe(true);
      expect(log).toEqual(["list"]);
      const stack = declare(env).pipe(adopt(true));
      const plan = yield* fixture.plan(stack);
      expect(Rec.keys(plan.resources)).toHaveLength(2);
      expect(log).not.toContain("write");
      const output = yield* fixture.deploy(stack);
      expect(output).toBe(url);
      expect(log.slice(-3)).toEqual(["write", "prepare", "deploy"]);
      expect(live.get("ORIGIN")).toBe(secret);
      yield* fixture.deploy(stack);
      expect(log.slice(-2)).toEqual(["prepare", "deploy"]);
      const drift = yield* fixture.drift;
      expect(
        Array.some(
          Rec.values(drift.resources),
          (r) => r.resourceType === Convex.Code.Type && r.action === "skipped",
        ),
      ).toBe(true);
      yield* fixture.deploy(declare({}));
      expect(log.slice(-3)).toEqual(["write", "prepare", "deploy"]);
      expect(live.get("ORIGIN")).toBe("old");
      yield* fixture.deploy(Effect.void);
      expect(live.get("ANOTHER")).toBe("untouched");
    }),
);

it.effect(
  "refuses an entire batch with a hidden or newly claimed name even with adoption",
  () =>
    Effect.gen(function* () {
      const live = new Map([
        ["A", "old-a"],
        ["B", "old-b"],
      ]);
      const log: string[] = [];
      const fixture = stackFixture({ fetch: mockEnvironment(live, log) });
      const env = (variables: Convex.EnvironmentVariablesProps["variables"]) =>
        Convex.EnvironmentVariables("Env", {
          deploymentName: name,
          url,
          deployKey,
          variables,
        }).pipe(adopt(), Effect.asVoid);
      const hidden = yield* failureOf(
        fixture.deploy(env({ A: "new", SECRET: Redacted.make(secret) })),
      );
      expect(hidden).toContain("unreadable name");
      expect(hidden).not.toContain(secret);
      expect(log).not.toContain("write");
      yield* fixture.deploy(env({ A: "new" }));
      const added = yield* failureOf(
        fixture.deploy(env({ A: "next", B: "new-b" })),
      );
      expect(added).toContain("adopt in a separate resource");
      expect([...live]).toEqual([
        ["A", "new"],
        ["B", "old-b"],
      ]);
      live.delete("A");
      const released = yield* failureOf(fixture.deploy(env({})));
      expect(released).toContain("unreadable name");
      expect(live.has("A")).toBe(false);
      live.set("A", "restorable");
      yield* fixture.deploy(Effect.void);
      expect(live.get("A")).toBe("old-a");
    }),
);

it.effect(
  "never reads write-only values, skips drift, retains by default, and unsets on explicit destroy",
  () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const live = new Map([["__redacted__", "old"]]);
      const fixture = stackFixture({ fetch: mockEnvironment(live, log) });
      const stack = Convex.AuthoritativeEnvironmentVariable("Write", {
        deployment,
        deployKey,
        name: "__redacted__",
        value: Redacted.make(secret),
      }).pipe(Effect.asVoid);
      yield* fixture.plan(stack);
      expect(log).toEqual([]);
      yield* fixture.deploy(stack);
      yield* fixture.deploy(stack);
      expect(live.get("__redacted__")).toBe(secret);
      const drift = yield* fixture.drift;
      expect(drift.resources.Write.action).toBe("skipped");
      yield* fixture.deploy(Effect.void);
      expect(log).toEqual(["write", "write"]);
      yield* fixture.deploy(stack.pipe(RemovalPolicy.destroy()));
      yield* fixture.deploy(Effect.void);
      expect(log).toEqual(["write", "write", "write", "write"]);
      expect(live.has("__redacted__")).toBe(false);
    }),
);

it.effect(
  "stops after a failed prepare phase, with no private diagnostics",
  () =>
    Effect.gen(function* () {
      const commands: globalThis.Array<string | Redacted.Redacted<string>> = [];
      const fixture = stackFixture({
        run: (cmd) =>
          Effect.sync(() => {
            commands.push(...cmd.args);
            return 51;
          }),
      });
      const exit = yield* Effect.exit(
        fixture.deploy(
          Confect.Backend("Code", { deployment, deployKey, cwd }).pipe(
            Effect.asVoid,
          ),
        ),
      );
      expect(commands).toContain("codegen");
      expect(commands).not.toContain("deploy");
      expect(commands).not.toContain(rawKey);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const diagnostic = Cause.pretty(exit.cause);
        expect(diagnostic).toContain("prepare");
        expect(diagnostic).toContain("51");
        expect(diagnostic).not.toContain(rawKey);
      }
    }),
);
