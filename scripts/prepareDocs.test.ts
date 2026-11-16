import * as Str from "effect/String";
import * as Array from "effect/Array";
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
    Effect.forEach(
      directories.splice(0),
      (directory) => fs.remove(directory, { recursive: true, force: true }),
      { concurrency: 1 },
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
    return Str.trim(result.stdout.toString());
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
  const addGenerator = Effect.gen(function* () {
    yield* write(
      "package.json",
      '{"type":"module","scripts":{"docs:api":"node scripts/docsApi.ts"}}',
    );
    yield* write("packages/core/src/Api.ts", "Selected source API");
    yield* write("apps/docs/.gitignore", "api/reference/\n");
    yield* write(
      "scripts/docsApi.ts",
      `
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
assert.equal(process.argv[2], "--check");
assert.equal(process.argv[3], "--out");
const output = process.argv[4];
assert.notEqual(resolve(output), resolve("apps/docs"));
const source = readFileSync("packages/core/src/Api.ts", "utf8");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
mkdirSync(join(output, "api/reference"), { recursive: true });
writeFileSync(join(output, "api/reference/source.mdx"), sha + "\\n" + source);
writeFileSync(join(output, "docs.json"), JSON.stringify({ navigation: { groups: [{ group: "API Reference", pages: ["api/reference/source"] }] } }));
if (source === "invalid") process.exit(1);
`,
    );
    git("add", ".");
    git("commit", "-m", "Add fixture generator");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    return git("rev-parse", "HEAD");
  });
  return { source, destination, git, write, sha, prepare, addGenerator };
});

test("stages an exact docs snapshot and removes stale deployment workflows without changing history", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, prepare } = yield* fixture;
      const before = git("rev-parse", "release");
      expect(prepare().exitCode).toBe(0);
      expect(Str.split("\n")(git("-C", destination, "ls-files"))).toEqual([
        "apps/docs/current.mdx",
        "apps/docs/docs.json",
      ]);
      const currentDocs = yield* fs.readFileString(
        join(destination, "apps/docs/current.mdx"),
      );
      expect(currentDocs).toBe("Current docs");
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
      for (const ref of ["main", "--output=unexpected", Str.repeat(40)("f")]) {
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
      const untrackedText = yield* fs.readFileString(
        join(destination, "untracked"),
      );
      expect(untrackedText).toBe("keep me");
      yield* fs.remove(join(destination, "untracked"));
      git("-C", destination, "checkout", "--detach");
      expect(prepare().exitCode).not.toBe(0);
    }),
  ));

type NavigationPage = string | { readonly pages: readonly NavigationPage[] };

const navigationPages = (pages: readonly NavigationPage[]): string[] =>
  Array.flatMap(pages, (page) =>
    typeof page === "string" ? [page] : navigationPages(page.pages),
  );

test("redirects legacy guide groups without inventing versioned API reference routes", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const legacyGroups = [
        "Getting Started",
        "Concepts",
        "Server",
        "Clients",
        "Guides",
      ];
      const groups = Array.filter(docsConfig.navigation.groups, (group) =>
        legacyGroups.includes(group.group),
      );
      expect(Array.map(groups, (group) => group.group)).toEqual(legacyGroups);
      const pages = Array.flatMap(groups, (group) =>
        navigationPages(group.pages),
      );
      expect(docsConfig.redirects).toEqual(
        Array.flatMap(["v9", "v10"], (version) =>
          Array.map(pages, (page) => ({
            source: `/${version}/${page}`,
            destination: `/${page}`,
          })),
        ),
      );
      for (const page of pages) {
        const pageExists = yield* fs.exists(
          resolve(import.meta.dir, `../apps/docs/${page}.mdx`),
        );
        expect(pageExists).toBe(true);
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
      git("checkout", "--detach", sha);
      expect(prepare(sha).exitCode).not.toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));

test("generates the selected source snapshot including ignored API pages without changing source files", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { source, destination, git, write, prepare, addGenerator } =
        yield* fixture;
      const selected = yield* addGenerator;
      yield* write("packages/core/src/Api.ts", "Later main API");
      yield* write("scripts/docsApi.ts", "process.exit(1);\n");
      git("add", ".");
      git("commit", "-m", "Change later main API");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("checkout", "--detach", selected);
      const result = prepare(selected);
      expect(result.exitCode).toBe(0);
      const generated = yield* fs.readFileString(
        join(destination, "apps/docs/api/reference/source.mdx"),
      );
      expect(generated).toBe(`${selected}\nSelected source API`);
      expect(git("-C", destination, "ls-files")).toContain(
        "apps/docs/api/reference/source.mdx",
      );
      const config = yield* fs.readFileString(
        join(destination, "apps/docs/docs.json"),
      );
      expect(config).toContain("api/reference/source");
      expect(git("status", "--porcelain", "--ignored")).toBe("");
      const originalConfig = yield* fs.readFileString(
        join(source, "apps/docs/docs.json"),
      );
      expect(originalConfig).toBe('{"navigation":{"groups":[]}}\n');
      git("-C", destination, "commit", "-m", "Deploy generated fixture docs");
      expect(prepare(selected).exitCode).toBe(0);
      expect(git("-C", destination, "status", "--porcelain")).toBe("");
    }),
  ));

test("leaves the destination untouched when API validation fails after writing generated files", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, write, prepare, addGenerator } = yield* fixture;
      yield* addGenerator;
      yield* write("packages/core/src/Api.ts", "invalid");
      git("add", ".");
      git("commit", "-m", "Invalidate fixture API");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      const before = git("-C", destination, "write-tree");
      expect(prepare(git("rev-parse", "HEAD")).exitCode).not.toBe(0);
      expect(git("-C", destination, "write-tree")).toBe(before);
      expect(git("-C", destination, "status", "--porcelain", "--ignored")).toBe(
        "",
      );
      const oldDocs = yield* fs.readFileString(
        join(destination, "apps/docs/old.mdx"),
      );
      expect(oldDocs).toBe("Old docs");
      expect(git("status", "--porcelain", "--ignored")).toBe("");
    }),
  ));

test("rejects mismatched HEAD and staged or unstaged source changes before publication", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { destination, git, write, prepare, addGenerator } = yield* fixture;
      const selected = yield* addGenerator;
      git("commit", "--allow-empty", "-m", "Advance source HEAD");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      expect(prepare(selected).exitCode).not.toBe(0);
      git("checkout", "--detach", selected);
      yield* write("packages/core/src/Api.ts", "Uncommitted API");
      expect(prepare(selected).exitCode).not.toBe(0);
      git("add", ".");
      expect(prepare(selected).exitCode).not.toBe(0);
      expect(git("-C", destination, "status", "--porcelain", "--ignored")).toBe(
        "",
      );
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
