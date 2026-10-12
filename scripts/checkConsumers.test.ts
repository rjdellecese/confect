import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import {
  cleanEnvironment,
  inspectGraph,
  packageManagerExecutable,
} from "./checkConsumers";
import { graphProblems } from "./consumerCompatibility";

test("isolates configuration, credentials, and workspace executable aliases", () => {
  const env = cleanEnvironment(
    "/tmp/consumer",
    "/usr/bin:/repo/node_modules/.bin:/repo/tools:/opt/bin",
    ":",
    "/repo",
  );
  expect(env.PATH).toBe("/usr/bin:/opt/bin");
  expect(env.HOME).toBe("/tmp/consumer/home");
  expect(env.npm_config_userconfig).toBe("/tmp/consumer/empty.npmrc");
  expect(env.npm_config_globalconfig).toBe("/tmp/consumer/empty-global.npmrc");
  expect(env.NODE_PATH).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.npm_config_legacy_peer_deps).toBeUndefined();
  expect(env.npm_config_force).toBeUndefined();
  expect(env.NPM_TOKEN).toBeUndefined();
});

test("runs an external node_modules package manager without restoring inherited bins or config", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-manager-test-",
      });
      const repository = path.join(root, "repository");
      const toolBin = path.join(root, "setup-pnpm/node_modules/.bin");
      const workspaceBin = path.join(repository, "node_modules/.bin");
      yield* fs.makeDirectory(toolBin, { recursive: true });
      yield* fs.makeDirectory(workspaceBin, { recursive: true });
      const tool = path.join(toolBin, "pnpm");
      yield* fs.writeFileString(tool, "#!/bin/sh\nprintf 'isolated-manager'\n");
      yield* fs.chmod(tool, 0o755);
      const inheritedPath = `${toolBin}:${workspaceBin}:/usr/bin:/bin`;
      const executable = yield* packageManagerExecutable(
        "pnpm",
        inheritedPath,
        repository,
      );
      const env = cleanEnvironment(root, inheritedPath, ":", repository);
      expect(executable).toBe(tool);
      expect(env.PATH).toBe("/usr/bin:/bin");
      expect(env.npm_config_userconfig).toBe(path.join(root, "empty.npmrc"));
      expect(env.npm_config_globalconfig).toBe(
        path.join(root, "empty-global.npmrc"),
      );
      expect(env.PNPM_HOME).toBeUndefined();
      const spawner = yield* ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(executable, ["--version"], {
          cwd: root,
          env,
          extendEnv: false,
        }),
      );
      expect(
        yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      ).toBe("isolated-manager");
      expect(Number(yield* handle.exitCode)).toBe(0);
      yield* fs.writeFileString(
        path.join(workspaceBin, "pnpm"),
        "#!/bin/sh\nexit 0\n",
      );
      yield* fs.chmod(path.join(workspaceBin, "pnpm"), 0o755);
      const rejected = yield* packageManagerExecutable(
        "pnpm",
        `${workspaceBin}:${toolBin}`,
        repository,
      ).pipe(Effect.flip);
      expect(rejected._tag).toBe("ConsumerGateFailure");
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  ));

test("walks actual package resolution paths, including a nested peer mismatch", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-graph-test-",
      });
      for (const [location, manifest] of [
        [
          "",
          '{"name":"app","version":"1.0.0","dependencies":{"effect":"4.0.1","host":"1.0.0"}}',
        ],
        ["node_modules/effect", '{"name":"effect","version":"4.0.1"}'],
        [
          "node_modules/host",
          '{"name":"host","version":"1.0.0","dependencies":{"companion":"1.0.0"},"peerDependencies":{"effect":"^4.0.1"}}',
        ],
        [
          "node_modules/host/node_modules/companion",
          '{"name":"companion","version":"1.0.0","peerDependencies":{"effect":"^4.0.3"}}',
        ],
      ]) {
        yield* fs.makeDirectory(path.join(directory, location!), {
          recursive: true,
        });
        yield* fs.writeFileString(
          path.join(directory, location!, "package.json"),
          manifest!,
        );
      }
      const graph = yield* inspectGraph(directory);
      expect(graph.packages).toHaveLength(3);
      expect(
        graphProblems(graph.packages, [], graph.rootResolutions, directory),
      ).toEqual([
        {
          _tag: "InvalidPeer",
          package: "companion",
          dependency: "effect",
          expected: "^4.0.3",
          actual: "4.0.1",
        },
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  ));
