import type { Compiler } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { callbackify } from "node:util";
import { isArtifact } from "../../../packages/cli/src/DevelopmentEvents.ts";

export class Failed extends Schema.TaggedError<Failed>()("RspackInputsFailed", {
  method: Schema.String,
  path: Schema.String,
  reason: Schema.String,
  cause: Schema.Unknown,
  code: Schema.String,
}) {}

export class Changed extends Schema.TaggedError<Changed>()(
  "RspackInputsChanged",
  {
    method: Schema.String,
    path: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {
  readonly code = "ESTALE";
}

type Method =
  | "readFile"
  | "stat"
  | "lstat"
  | "readlink"
  | "realpath"
  | "readdir";
export const Observation = Schema.Struct({
  method: Schema.Literals([
    "readFile",
    "stat",
    "lstat",
    "readlink",
    "realpath",
    "readdir",
  ]),
  path: Schema.String,
  fingerprint: Schema.String,
});
export interface Observation extends Schema.Schema.Type<typeof Observation> {}
export interface Capture {
  readonly observations: ReadonlyArray<Observation>;
  readonly validate: Effect.Effect<void, Failed | Changed>;
}

const denied = (name: string, basenames: ReadonlyArray<string>) =>
  name
    .split(path.sep)
    .some((part) => part === ".env.local" || basenames.includes(part));

const statFingerprint = (value: fs.Stats) => ({
  kind: [
    value.isFile(),
    value.isDirectory(),
    value.isSymbolicLink(),
    value.isBlockDevice(),
    value.isCharacterDevice(),
    value.isFIFO(),
    value.isSocket(),
  ],
  dev: value.dev,
  ino: value.ino,
  mode: value.mode,
  nlink: value.nlink,
  uid: value.uid,
  gid: value.gid,
  rdev: value.rdev,
  size: value.size,
  mtimeMs: value.mtimeMs,
  ctimeMs: value.ctimeMs,
  birthtimeMs: value.birthtimeMs,
});

export const make = (
  options: {
    readonly deniedBasenames?: ReadonlyArray<string>;
    readonly hideArtifacts?: boolean;
    readonly visibleArtifacts?: ReadonlyArray<string>;
  } = {},
) => {
  const basenames = options.deniedBasenames ?? [];
  const observations: Observation[] = [];
  const seen = new Map<string, string>();
  let sealed = false;
  let pending = 0;
  let failure: Failed | Changed | undefined;
  const fail = (
    method: string,
    name: string,
    reason: string,
    cause?: unknown,
    code = "EACCES",
  ) => new Failed({ method, path: name, reason, cause, code });

  const request = async (method: Method, name: string) => {
    if (denied(name, basenames)) throw fail(method, name, "ProtectedPath");
    if (
      options.hideArtifacts &&
      isArtifact(name) &&
      !options.visibleArtifacts?.includes(name)
    )
      return {
        error: fail(method, name, "OwnedArtifact", undefined, "ENOENT"),
        fingerprint: "owned-artifact",
      };
    let real: string | undefined;
    let realError: string | undefined;
    try {
      real = await fs.promises.realpath(name);
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        !("code" in cause) ||
        typeof cause.code !== "string"
      )
        throw fail(method, name, "RealpathFailed", cause);
      realError = cause.code;
    }
    if (real !== undefined && denied(real, basenames))
      throw fail(method, name, "ProtectedRealpath");
    try {
      let value: Buffer | string | string[] | fs.Stats;
      if (method === "readFile") {
        if (real === undefined) {
          return {
            error: fail(method, name, "MissingRealpath", realError, realError),
            fingerprint: JSON.stringify({ realError, error: realError }),
          };
        }
        if (process.platform !== "linux")
          throw fail(method, name, "LinuxDescriptorGuardRequired");
        const handle = await fs.promises.open(
          real,
          fs.constants.O_RDONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK,
        );
        try {
          const opened = await fs.promises.realpath(
            `/proc/self/fd/${handle.fd}`,
          );
          if (denied(opened, basenames))
            throw fail(method, name, "ProtectedDescriptor");
          if (opened !== real)
            throw fail(method, name, "DescriptorPathChanged");
          if (!(await handle.stat()).isFile())
            throw fail(method, name, "NotRegularFile");
          value = await handle.readFile();
        } finally {
          await handle.close();
        }
      } else if (method === "stat") value = await fs.promises.stat(name);
      else if (method === "lstat") value = await fs.promises.lstat(name);
      else if (method === "readlink") value = await fs.promises.readlink(name);
      else if (method === "realpath") value = await fs.promises.realpath(name);
      else value = await fs.promises.readdir(name);
      const directoryEntries =
        options.hideArtifacts &&
        value instanceof fs.Stats &&
        value.isDirectory()
          ? (await fs.promises.readdir(name))
              .filter((entry) => !isArtifact(path.join(name, entry)))
              .sort()
          : undefined;
      if (options.hideArtifacts && Array.isArray(value))
        value = value.filter((entry) => !isArtifact(path.join(name, entry)));
      const result = Buffer.isBuffer(value)
        ? {
            bytes: value.length,
            sha256: createHash("sha256").update(value).digest("hex"),
          }
        : value instanceof fs.Stats
          ? {
              ...statFingerprint(value),
              ...(directoryEntries
                ? {
                    size: 0,
                    nlink: 1,
                    mtimeMs: 0,
                    ctimeMs: 0,
                    directoryEntries,
                  }
                : {}),
            }
          : value;
      return {
        value,
        fingerprint: JSON.stringify({ real, realError, result }),
      };
    } catch (cause) {
      if (Schema.is(Failed)(cause)) throw cause;
      if (
        !(cause instanceof Error) ||
        !("code" in cause) ||
        typeof cause.code !== "string"
      )
        throw fail(method, name, "RequestFailed", cause);
      return {
        error: fail(method, name, "FilesystemError", cause, cause.code),
        fingerprint: JSON.stringify({ real, realError, error: cause.code }),
      };
    }
  };

  const wrap = <F extends (...args: never[]) => unknown>(
    method: Method,
    original: F,
  ): F =>
    new Proxy(original, {
      apply(_target, _receiver, args: unknown[]) {
        const last = args.at(-1);
        if (typeof last !== "function") {
          const error = fail(method, String(args[0]), "CallbackRequired");
          if (!sealed) failure ??= error;
          throw error;
        }
        const callback = last as (
          error: NodeJS.ErrnoException | null,
          value?: unknown,
        ) => void;
        const name =
          typeof args[0] === "string" ? args[0] : "<unsupported path>";
        if (sealed || args.length !== 2 || typeof args[0] !== "string") {
          const error = fail(
            method,
            name,
            sealed ? "Sealed" : "UnsupportedRequest",
          );
          if (!sealed) failure ??= error;
          callback(error);
          return;
        }
        pending++;
        callbackify(request)(method, name, (cause, result) => {
          pending--;
          if (sealed) {
            callback(fail(method, name, "Sealed"));
            return;
          }
          if (cause || result === undefined) {
            const error = Schema.is(Failed)(cause)
              ? cause
              : fail(method, name, "RequestFailed", cause);
            failure ??= error;
            callback(error);
            return;
          }
          const key = JSON.stringify([method, name]);
          const expected = seen.get(key);
          if (expected !== undefined && expected !== result.fingerprint) {
            const error = new Changed({
              method,
              path: name,
              expected,
              actual: result.fingerprint,
            });
            failure ??= error;
            callback(error);
            return;
          }
          if (expected === undefined) {
            seen.set(key, result.fingerprint);
            observations.push({
              method,
              path: name,
              fingerprint: result.fingerprint,
            });
          }
          callback(result.error ?? null, result.value);
        });
      },
    });

  const fileSystem: NonNullable<Compiler["inputFileSystem"]> = {
    readFile: wrap("readFile", fs.readFile),
    stat: wrap("stat", fs.stat),
    lstat: wrap("lstat", fs.lstat),
    readlink: wrap("readlink", fs.readlink),
    realpath: wrap("realpath", fs.realpath),
    readdir: wrap("readdir", fs.readdir),
  };
  const validate = Effect.fn("RspackInputs.validate")(function* (
    recorded: ReadonlyArray<Observation>,
  ) {
    for (const observation of recorded) {
      const result = yield* Effect.tryPromise({
        try: () => request(observation.method, observation.path),
        catch: (cause) =>
          Schema.is(Failed)(cause)
            ? cause
            : fail(
                observation.method,
                observation.path,
                "ValidationFailed",
                cause,
              ),
      });
      if (result.fingerprint !== observation.fingerprint)
        return yield* new Changed({
          method: observation.method,
          path: observation.path,
          expected: observation.fingerprint,
          actual: result.fingerprint,
        });
    }
  });
  let receipt: Capture | undefined;
  const capture: Effect.Effect<Capture, Failed | Changed> = Effect.suspend(
    () => {
      if (receipt !== undefined) return Effect.succeed(receipt);
      sealed = true;
      if (pending !== 0)
        failure ??= fail("capture", "", "PendingRequests", pending);
      if (failure !== undefined) return Effect.fail(failure);
      receipt = {
        observations,
        validate: validate(observations),
      };
      return Effect.succeed(receipt);
    },
  );
  return { fileSystem, capture, validate };
};
