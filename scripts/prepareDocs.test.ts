import { afterEach, expect, test } from "bun:test";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import docsConfig from "../apps/docs/docs.json";

const fs = Effect.runSync(
  FileSystem.FileSystem.pipe(Effect.provide(BunServices.layer)),
);
const { join, resolve } = Effect.runSync(
  Path.Path.pipe(Effect.provide(BunServices.layer)),
);

const script = resolve(import.meta.dir, "prepareDocs.sh");
const directories: string[] = [];

afterEach(() =>
  Effect.runPromise(
    Effect.forEach(directories.splice(0), (directory) =>
      fs.remove(directory, { recursive: true, force: true }),
    ),
  ),
);

const fixture = Effect.gen(function* () {
  const directory = yield* fs.makeTempDirectory({ prefix: "confect-docs-" });
  directories.push(directory);
  const source = join(directory, "source");
  const destination = join(directory, "release");
  yield* fs.makeDirectory(source);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", source, ...args]);
    expect(result.exitCode).toBe(0);
    return result.stdout.toString().trim();
  };
  const write = Effect.fnUntraced(function* (path: string, contents: string) {
    const file = join(source, path);
    yield* fs.makeDirectory(resolve(file, ".."), { recursive: true });
    yield* fs.writeFileString(file, contents);
  });
  git("init", "--initial-branch=main");
  git("config", "user.name", "Docs Snapshot Test");
  git("config", "user.email", "docs-test@example.invalid");
  yield* write("apps/docs/docs.json", '{"navigation":{"groups":[]}}\n');
  yield* write("apps/docs/old.mdx", "Old docs");
  yield* write("packages/core/package.json", '{"version":"10.0.0"}');
  yield* write(".github/workflows/stale.yml", "name: Stale deployment");
  yield* write(".docs-release.json", "{}");
  git("add", ".");
  git("commit", "-m", "Initial fixture");
  git("tag", "@confect/core@10.0.0");
  git("branch", "release");
  git("worktree", "add", destination, "release");
  git("rm", "apps/docs/old.mdx");
  yield* write("apps/docs/current.mdx", "Current docs");
  git("add", ".");
  git("commit", "-m", "Update fixture docs");
  const sha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", sha);
  const prepare = (ref = sha, target = destination) =>
    Bun.spawnSync(["bash", script, ref, target], { cwd: source });
  return { source, destination, git, write, sha, prepare };
});

test("stages an exact docs snapshot and removes stale deployment workflows without changing history", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, prepare } = yield* fixture;
      const before = git("rev-parse", "release");
      expect(prepare().exitCode).toBe(0);
      expect(git("-C", destination, "ls-files").split("\n")).toEqual([
        "apps/docs/current.mdx",
        "apps/docs/docs.json",
      ]);
      expect(
        yield* fs.readFileString(join(destination, "apps/docs/current.mdx")),
      ).toBe("Current docs");
      expect(git("rev-parse", "release")).toBe(before);
      git("-C", destination, "commit", "-m", "Deploy fixture docs");
      expect(prepare().exitCode).toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));

test("requires a full commit SHA reachable from main before changing the destination", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, prepare } = yield* fixture;
      for (const ref of ["main", "--output=unexpected", "f".repeat(40)]) {
        expect(prepare(ref).exitCode).not.toBe(0);
      }
      git("tag", "-a", "annotated", "-m", "Annotated fixture tag");
      expect(prepare(git("rev-parse", "annotated")).exitCode).not.toBe(0);
      git("checkout", "-b", "unmerged");
      git("commit", "--allow-empty", "-m", "Unmerged fixture");
      expect(prepare(git("rev-parse", "HEAD")).exitCode).not.toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));

test("rejects the source checkout, non-root destinations, and dirty release checkouts", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { source, destination, prepare, sha, git } = yield* fixture;
      expect(prepare(sha, source).exitCode).not.toBe(0);
      expect(prepare(sha, join(destination, "apps/docs")).exitCode).not.toBe(0);
      yield* fs.writeFileString(join(destination, "untracked"), "keep me");
      expect(prepare().exitCode).not.toBe(0);
      expect(yield* fs.readFileString(join(destination, "untracked"))).toBe(
        "keep me",
      );
      yield* fs.remove(join(destination, "untracked"));
      git("-C", destination, "checkout", "--detach");
      expect(prepare().exitCode).not.toBe(0);
    }),
  ));

test("redirects legacy versioned navigation pages only to existing current pages", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const pages = docsConfig.navigation.groups.flatMap((group) =>
        group.pages.flatMap((page) =>
          typeof page === "string" ? [page] : page.pages,
        ),
      );
      expect(docsConfig.redirects).toEqual(
        ["v9", "v10"].flatMap((version) =>
          pages.map((page) => ({
            source: `/${version}/${page}`,
            destination: `/${page}`,
          })),
        ),
      );
      for (const page of pages) {
        expect(
          yield* fs.exists(
            resolve(import.meta.dir, `../apps/docs/${page}.mdx`),
          ),
        ).toBe(true);
      }
      expect(docsConfig.navigation).not.toHaveProperty("versions");
    }),
  ));

test("rejects prereleases, retired v9, and stable versions without a published ancestor tag", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, write, prepare, sha } = yield* fixture;
      for (const version of ["10.0.0-next.1", "9.0.0", "10.1.0"]) {
        yield* write("packages/core/package.json", `{"version":"${version}"}`);
        git("add", ".");
        git("commit", "-m", "Change fixture version");
        git("update-ref", "refs/remotes/origin/main", "HEAD");
        expect(prepare(git("rev-parse", "HEAD")).exitCode).not.toBe(0);
      }
      git("tag", "-d", "@confect/core@10.0.0");
      git("tag", "@confect/core@10.0.0");
      expect(prepare(sha).exitCode).not.toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));

test("rejects missing docs and symlinks before removing any destination files", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { source, destination, git, prepare } = yield* fixture;
      git("rm", "apps/docs/docs.json");
      git("commit", "-m", "Remove fixture config");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      expect(prepare(git("rev-parse", "HEAD")).exitCode).not.toBe(0);
      git(
        "restore",
        "--source=HEAD~1",
        "--staged",
        "--worktree",
        "apps/docs/docs.json",
      );
      yield* fs.symlink("../../.github", join(source, "apps/docs/escape"));
      git("add", ".");
      git("commit", "-m", "Add fixture symlink");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      expect(prepare(git("rev-parse", "HEAD")).exitCode).not.toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));
