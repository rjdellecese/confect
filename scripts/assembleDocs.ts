#!/usr/bin/env bun

import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { parseArgs } from "node:util";

const VERSIONS = ["v9", "v10"] as const;
type Version = (typeof VERSIONS)[number];

interface VersionDetails {
  readonly branches: ReadonlyArray<string>;
  readonly initialRef?: string | undefined;
  readonly major: number;
}

const VERSION_DETAILS = {
  v9: {
    branches: ["main"],
    initialRef: "origin/release",
    major: 9,
  },
  v10: {
    branches: ["v10", "main"],
    initialRef: undefined,
    major: 10,
  },
} satisfies Record<Version, VersionDetails>;

const INITIAL_DEFAULT_VERSION: Version = "v9";
const MANIFEST_SCHEMA_VERSION = 1;
const DOCS_ROOT = "apps/docs";
const CORE_PACKAGE_PATH = "packages/core/package.json";
const EXCLUDED_VERSION_ROOT_FILES = new Set([
  ".prettierignore",
  ".prettierrc.json",
  "CHANGELOG.md",
  "README.md",
  "docs.json",
  "favicon.svg",
  "package.json",
]);

interface VersionSource {
  readonly source: string;
}

interface Manifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  readonly defaultVersion: Version;
  readonly versions: Readonly<Record<Version, VersionSource>>;
}

interface Redirect {
  readonly source: string;
  readonly destination: string;
}

interface DocsConfig extends Record<string, unknown> {
  readonly navigation: Record<string, unknown>;
  readonly redirects?: ReadonlyArray<Redirect> | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isVersion = (value: string): value is Version =>
  VERSIONS.some((version) => version === value);

export class DocsArgumentsError extends Schema.TaggedError<DocsArgumentsError>()(
  "DocsArgumentsError",
  { message: Schema.String },
) {}

export class DocsDataError extends Schema.TaggedError<DocsDataError>()(
  "DocsDataError",
  { source: Schema.String, filePath: Schema.String, message: Schema.String },
) {}

export class DocsSourceError extends Schema.TaggedError<DocsSourceError>()(
  "DocsSourceError",
  { source: Schema.String, message: Schema.String },
) {}

export class DocsGitError extends Schema.TaggedError<DocsGitError>()(
  "DocsGitError",
  {
    args: Schema.Array(Schema.String),
    exitCode: Schema.Finite,
    stderr: Schema.String,
  },
) {
  override get message(): string {
    return `git ${this.args.join(" ")} exited with ${this.exitCode}: ${this.stderr.trim()}`;
  }
}

export class DocsOutputError extends Schema.TaggedError<DocsOutputError>()(
  "DocsOutputError",
  { output: Schema.String, message: Schema.String },
) {}

export class DocsRedirectError extends Schema.TaggedError<DocsRedirectError>()(
  "DocsRedirectError",
  { source: Schema.String },
) {
  override get message(): string {
    return `Default-version docs already configure a redirect from ${this.source}`;
  }
}

const quoteJson = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const encodeJson = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Unknown, { space: 2 }),
);

const parseVersion = Effect.fn("Docs.parseVersion")(function* (value: string) {
  if (!isVersion(value)) {
    return yield* new DocsArgumentsError({
      message: `Unknown documentation version ${quoteJson(value)}`,
    });
  }
  return value;
});

export const parseDocsArguments = Effect.fn("Docs.parseArguments")(function* (
  args: ReadonlyArray<string>,
) {
  const { values } = yield* Effect.try({
    try: () =>
      parseArgs({
        args,
        options: {
          "allow-unpublished-source": { type: "boolean" },
          manifest: { type: "string" },
          "manifest-output": { type: "string" },
          output: { type: "string" },
          "update-ref": { type: "string" },
          "update-version": { type: "string" },
        },
        strict: true,
      }),
    catch: (cause) => new DocsArgumentsError({ message: String(cause) }),
  });

  const outputArgument = values.output;
  const manifestOutputArgument = values["manifest-output"];
  const allowUnpublishedSource = values["allow-unpublished-source"] ?? false;
  const updateRef = values["update-ref"];
  const updateVersionValue = values["update-version"];
  const updateVersion =
    updateVersionValue === undefined
      ? undefined
      : yield* parseVersion(updateVersionValue);

  if (outputArgument === undefined || manifestOutputArgument === undefined) {
    return yield* new DocsArgumentsError({
      message: "--output and --manifest-output are required",
    });
  }

  if ((updateRef === undefined) !== (updateVersion === undefined)) {
    return yield* new DocsArgumentsError({
      message: "--update-version and --update-ref must be provided together",
    });
  }

  return {
    outputArgument,
    manifestOutputArgument,
    allowUnpublishedSource,
    updateRef,
    updateVersion,
    manifestPath: values.manifest,
  };
});

const runGit = Effect.fn("Docs.runGit")(function* (
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("git", args, {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      const [chunks, stderr, exitCode] = yield* Effect.all(
        [
          Stream.runCollect(handle.stdout),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      const stdout = new Uint8Array(
        chunks.reduce((length, chunk) => length + chunk.length, 0),
      );
      let offset = 0;
      for (const chunk of chunks) {
        stdout.set(chunk, offset);
        offset += chunk.length;
      }
      return { stdout, stderr, exitCode };
    }),
  );
});

const gitBuffer = Effect.fn("Docs.gitBuffer")(function* (
  args: ReadonlyArray<string>,
) {
  const result = yield* runGit(args);
  if (result.exitCode !== 0) {
    return yield* new DocsGitError({
      args,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
  }
  return result.stdout;
});

const gitText = Effect.fn("Docs.gitText")(function* (
  args: ReadonlyArray<string>,
) {
  return new TextDecoder().decode(yield* gitBuffer(args)).trim();
});

const resolveCommit = Effect.fn("Docs.resolveCommit")(function* (ref: string) {
  const candidates = ref.startsWith("origin/") ? [ref] : [ref, `origin/${ref}`];
  for (const candidate of candidates) {
    const result = yield* runGit([
      "rev-parse",
      "--verify",
      `${candidate}^{commit}`,
    ]);
    if (result.exitCode === 0)
      return new TextDecoder().decode(result.stdout).trim();
  }
  return yield* new DocsSourceError({
    source: ref,
    message: `Could not resolve Git ref ${quoteJson(ref)}`,
  });
});

const latestV10PrereleaseRef = Effect.fn("Docs.latestV10PrereleaseRef")(
  function* () {
    const tags = yield* gitText([
      "tag",
      "--list",
      "@confect/core@10.0.0-next.*",
      "--sort=-version:refname",
    ]);
    const latestTag = tags.split("\n").find(Boolean);
    if (latestTag === undefined) {
      return yield* new DocsSourceError({
        source: "@confect/core@10.0.0-next.*",
        message: "Could not find a published v10 prerelease tag",
      });
    }
    return latestTag;
  },
);

const readGitFile = (source: string, filePath: string) =>
  gitBuffer(["show", `${source}:${filePath}`]);

const decodeJson = (contents: string, source: string, filePath: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(contents).pipe(
    Effect.mapError(
      () =>
        new DocsDataError({
          source,
          filePath,
          message: `Invalid JSON in ${filePath} at source ${source}`,
        }),
    ),
  );

const readGitJson = Effect.fn("Docs.readGitJson")(function* (
  source: string,
  filePath: string,
) {
  return yield* decodeJson(
    new TextDecoder().decode(yield* readGitFile(source, filePath)),
    source,
    filePath,
  );
});

const readPackageVersion = Effect.fn("Docs.readPackageVersion")(function* (
  source: string,
) {
  const packageJson = yield* readGitJson(source, CORE_PACKAGE_PATH);
  if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
    return yield* new DocsDataError({
      source,
      filePath: CORE_PACKAGE_PATH,
      message: `Invalid ${CORE_PACKAGE_PATH} at source ${source}`,
    });
  }
  return packageJson.version;
});

const isRedirectList = (value: unknown): value is ReadonlyArray<Redirect> =>
  Array.isArray(value) &&
  value.every(
    (redirect) =>
      isRecord(redirect) &&
      typeof redirect.source === "string" &&
      typeof redirect.destination === "string",
  );

const readDocsConfig = Effect.fn("Docs.readConfig")(function* (source: string) {
  const configPath = `${DOCS_ROOT}/docs.json`;
  const config = yield* readGitJson(source, configPath);
  if (!isRecord(config) || !isRecord(config.navigation)) {
    return yield* new DocsDataError({
      source,
      filePath: configPath,
      message: `Invalid ${configPath} at source ${source}`,
    });
  }

  const redirects = config.redirects;
  if (redirects !== undefined && !isRedirectList(redirects)) {
    return yield* new DocsDataError({
      source,
      filePath: configPath,
      message: `Invalid ${configPath} redirects at source ${source}`,
    });
  }

  return {
    ...config,
    navigation: config.navigation,
    ...(redirects === undefined ? {} : { redirects }),
  } satisfies DocsConfig;
});

const initialManifest = Effect.fn("Docs.initialManifest")(function* () {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    defaultVersion: INITIAL_DEFAULT_VERSION,
    versions: {
      v9: { source: yield* resolveCommit(VERSION_DETAILS.v9.initialRef) },
      v10: { source: yield* resolveCommit(yield* latestV10PrereleaseRef()) },
    },
  } satisfies Manifest;
});

const loadManifest = Effect.fn("Docs.loadManifest")(function* (
  manifestPath: string | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  if (manifestPath === undefined || !(yield* fs.exists(manifestPath))) {
    return yield* initialManifest();
  }

  const manifest = yield* decodeJson(
    yield* fs.readFileString(manifestPath),
    manifestPath,
    manifestPath,
  );
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
    typeof manifest.defaultVersion !== "string" ||
    !isVersion(manifest.defaultVersion) ||
    !isRecord(manifest.versions)
  ) {
    return yield* new DocsDataError({
      source: manifestPath,
      filePath: manifestPath,
      message: `Invalid documentation release manifest at ${manifestPath}`,
    });
  }

  const versions = manifest.versions;
  const readSource = Effect.fn("Docs.readManifestSource")(function* (
    version: Version,
  ) {
    const entry = versions[version];
    if (!isRecord(entry) || typeof entry.source !== "string") {
      return yield* new DocsDataError({
        source: manifestPath,
        filePath: manifestPath,
        message: `Invalid ${version} source in documentation release manifest`,
      });
    }
    return { source: entry.source };
  });

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    defaultVersion: manifest.defaultVersion,
    versions: {
      v9: yield* readSource("v9"),
      v10: yield* readSource("v10"),
    },
  } satisfies Manifest;
});

const validateSource = Effect.fn("Docs.validateSource")(function* (
  version: Version,
  ref: string,
  allowUnpublishedSource: boolean,
) {
  const details = VERSION_DETAILS[version];
  const source = yield* resolveCommit(ref);
  const packageVersion = yield* readPackageVersion(source);
  const packageMajor = Number.parseInt(packageVersion.split(".")[0], 10);
  if (packageMajor !== details.major) {
    return yield* new DocsSourceError({
      source,
      message: `${version} requires @confect/core major ${details.major}, but source ${source} contains ${packageVersion}; refusing to deploy it`,
    });
  }
  let belongsToSourceBranch = false;
  for (const branch of details.branches) {
    const ancestry = yield* runGit([
      "merge-base",
      "--is-ancestor",
      source,
      `origin/${branch}`,
    ]);
    if (ancestry.exitCode === 0) {
      belongsToSourceBranch = true;
      break;
    }
  }
  if (!allowUnpublishedSource && !belongsToSourceBranch) {
    return yield* new DocsSourceError({
      source,
      message: `${version} source ${source} is not part of ${details.branches.join(" or ")}; refusing to deploy it`,
    });
  }
  return source;
});

const versionPath = (filePath: string, version: Version): string => {
  if (/^v\d+(?:\/|$)/u.test(filePath)) return filePath;
  return `${version}/${filePath}`;
};

export const rewriteDocumentationLinks = (
  contents: string,
  version: Version,
): string => {
  let fenceMarker: string | undefined;
  return contents
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
      if (fence !== undefined) {
        if (fenceMarker === undefined) {
          fenceMarker = fence[0];
        } else if (fence[0] === fenceMarker) {
          fenceMarker = undefined;
        }
        return line;
      }

      if (fenceMarker !== undefined) return line;

      return line
        .replace(
          /\]\(\/(?!\/)([^)\s]*)/gu,
          (_match, filePath: string) => `](/${versionPath(filePath, version)}`,
        )
        .replace(
          /(href\s*=\s*["'])\/(?!\/)([^"']*)/gu,
          (_match, start: string, filePath: string) =>
            `${start}/${versionPath(filePath, version)}`,
        )
        .replace(
          /(href\s*=\s*\{\s*["'])\/(?!\/)([^"']*)/gu,
          (_match, start: string, filePath: string) =>
            `${start}/${versionPath(filePath, version)}`,
        )
        .replace(
          /(from\s+["'])\/(?!\/)([^"']*)/gu,
          (_match, start: string, filePath: string) =>
            `${start}/${versionPath(filePath, version)}`,
        );
    })
    .join("\n");
};

const writeOutputFile = Effect.fn("Docs.writeOutputFile")(function* (
  filePath: string,
  contents: string | Uint8Array,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* typeof contents === "string"
    ? fs.writeFileString(filePath, contents)
    : fs.writeFile(filePath, contents);
});

const copyVersion = Effect.fn("Docs.copyVersion")(function* (
  version: Version,
  source: string,
  output: string,
) {
  const path = yield* Path.Path;
  const files = new TextDecoder()
    .decode(
      yield* gitBuffer([
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        source,
        "--",
        DOCS_ROOT,
      ]),
    )
    .split("\0")
    .filter(Boolean);

  for (const sourcePath of files) {
    const relativePath = sourcePath.slice(`${DOCS_ROOT}/`.length);
    if (
      !relativePath.includes("/") &&
      EXCLUDED_VERSION_ROOT_FILES.has(relativePath)
    ) {
      continue;
    }

    const sourceContents = yield* readGitFile(source, sourcePath);
    const extension = path.extname(relativePath);
    const outputContents =
      extension === ".md" || extension === ".mdx"
        ? rewriteDocumentationLinks(
            new TextDecoder().decode(sourceContents),
            version,
          )
        : sourceContents;
    yield* writeOutputFile(
      path.join(output, version, relativePath),
      outputContents,
    );
  }
});

const prefixPageReference = (page: string, version: Version): string => {
  if (/^(?:https?:\/\/|[A-Z]+ \/)/u.test(page)) return page;
  const filePath = page.startsWith("/") ? page.slice(1) : page;
  return versionPath(filePath, version);
};

const rewritePageLists = (
  value: unknown,
  version: Version,
  insidePages = false,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      insidePages && typeof entry === "string"
        ? prefixPageReference(entry, version)
        : rewritePageLists(entry, version),
    );
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      rewritePageLists(entry, version, key === "pages"),
    ]),
  );
};

const collectPageReferences = (
  value: unknown,
  insidePages = false,
  pages: Array<string> = [],
): Array<string> => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (insidePages && typeof entry === "string") {
        pages.push(entry);
      } else {
        collectPageReferences(entry, false, pages);
      }
    }
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectPageReferences(entry, key === "pages", pages);
    }
  }
  return pages;
};

const versionNavigation = Effect.fn("Docs.versionNavigation")(function* (
  config: DocsConfig,
  version: Version,
  defaultVersion: Version,
) {
  const navigation = { ...config.navigation };
  delete navigation.global;

  const rewrittenNavigation = rewritePageLists(navigation, version);
  if (!isRecord(rewrittenNavigation)) {
    return yield* new DocsDataError({
      source: version,
      filePath: `${DOCS_ROOT}/docs.json`,
      message: `Invalid ${version} navigation`,
    });
  }

  return {
    version,
    ...(version === defaultVersion ? { default: true } : {}),
    tag:
      version === defaultVersion
        ? "Stable"
        : version === "v10"
          ? "Prerelease"
          : "Previous",
    ...rewrittenNavigation,
  };
});

export const assembleDocsMain = Effect.fn("Docs.main")(function* (
  args: ReadonlyArray<string>,
) {
  const options = yield* parseDocsArguments(args);
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repositoryRoot = yield* gitText(["rev-parse", "--show-toplevel"]);
  const output = path.resolve(options.outputArgument);
  const manifestOutput = path.resolve(options.manifestOutputArgument);
  for (const prohibitedOutput of [
    path.parse(output).root,
    repositoryRoot,
    path.resolve(repositoryRoot, DOCS_ROOT),
  ]) {
    if (output === prohibitedOutput) {
      return yield* new DocsOutputError({
        output,
        message: `Refusing to replace unsafe output directory ${output}`,
      });
    }
  }
  const previousManifest = yield* loadManifest(options.manifestPath);
  const sourceFor = (version: Version) =>
    options.updateVersion === version && options.updateRef !== undefined
      ? options.updateRef
      : previousManifest.versions[version].source;
  const sources: Record<Version, string> = {
    v9: yield* validateSource(
      "v9",
      sourceFor("v9"),
      options.allowUnpublishedSource,
    ),
    v10: yield* validateSource(
      "v10",
      sourceFor("v10"),
      options.allowUnpublishedSource,
    ),
  };
  const configs: Record<Version, DocsConfig> = {
    v9: yield* readDocsConfig(sources.v9),
    v10: yield* readDocsConfig(sources.v10),
  };
  const v10PackageVersion = yield* readPackageVersion(sources.v10);
  const defaultVersion: Version = v10PackageVersion.includes("-")
    ? "v9"
    : "v10";
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    defaultVersion,
    versions: { v9: { source: sources.v9 }, v10: { source: sources.v10 } },
  };
  const defaultSource = sources[defaultVersion];
  const defaultConfig = configs[defaultVersion];

  const generatedRedirects: Array<Redirect> = [
    ...new Set(collectPageReferences(defaultConfig.navigation)),
  ]
    .filter((page) => !/^(?:https?:\/\/|[A-Z]+ \/)/u.test(page))
    .map((page) => {
      const filePath = page.startsWith("/") ? page.slice(1) : page;
      return {
        source: `/${filePath}`,
        destination: `/${prefixPageReference(filePath, defaultVersion)}`,
      };
    });

  const existingRedirects = defaultConfig.redirects ?? [];
  const existingRedirectSources = new Set(
    existingRedirects.map((redirect) => redirect.source),
  );
  for (const redirect of generatedRedirects) {
    if (existingRedirectSources.has(redirect.source)) {
      return yield* new DocsRedirectError({ source: redirect.source });
    }
  }

  const combinedConfig = {
    ...defaultConfig,
    navigation: {
      ...(defaultConfig.navigation.global === undefined
        ? {}
        : { global: defaultConfig.navigation.global }),
      versions: [
        yield* versionNavigation(configs.v9, "v9", defaultVersion),
        yield* versionNavigation(configs.v10, "v10", defaultVersion),
      ],
    },
    redirects: [...existingRedirects, ...generatedRedirects],
  };

  yield* fs.remove(output, { force: true, recursive: true });
  yield* fs.makeDirectory(output, { recursive: true });
  yield* copyVersion("v9", sources.v9, output);
  yield* copyVersion("v10", sources.v10, output);
  yield* writeOutputFile(
    path.join(output, "favicon.svg"),
    yield* readGitFile(defaultSource, `${DOCS_ROOT}/favicon.svg`),
  );
  yield* writeOutputFile(
    path.join(output, "docs.json"),
    `${yield* encodeJson(combinedConfig)}\n`,
  );

  yield* writeOutputFile(manifestOutput, `${yield* encodeJson(manifest)}\n`);

  yield* Console.log(
    `Assembled v9 (${sources.v9}) and v10 (${sources.v10}) documentation; ${defaultVersion} is stable`,
  );
});

if (import.meta.main) {
  assembleDocsMain(Bun.argv.slice(2)).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
