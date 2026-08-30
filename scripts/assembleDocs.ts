#!/usr/bin/env bun

// The source branches keep an ordinary, unversioned Mintlify tree so their
// previews stay useful. This script is the boundary that turns those trees
// into the versioned deployment artifact committed to `release`.

import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Runtime from "effect/Runtime";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";

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

const INITIAL_DEFAULT_VERSION = "v9";
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

const VersionSchema = Schema.Literals(VERSIONS);
const VersionSourceSchema = Schema.Struct({ source: Schema.String });

const ManifestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(MANIFEST_SCHEMA_VERSION),
  defaultVersion: VersionSchema,
  versions: Schema.Struct({
    v9: VersionSourceSchema,
    v10: VersionSourceSchema,
  }),
});
type Manifest = typeof ManifestSchema.Type;

const PackageJsonSchema = Schema.Struct({ version: Schema.String });
const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

const RedirectSchema = Schema.Struct({
  source: Schema.String,
  destination: Schema.String,
});
type Redirect = typeof RedirectSchema.Type;

const DocsConfigSchema = Schema.Struct({
  navigation: Schema.Record(Schema.String, Schema.Unknown),
  redirects: Schema.optionalKey(Schema.Array(RedirectSchema)),
});
type DocsConfig = typeof DocsConfigSchema.Type;

export class DocsAssemblyError extends Data.TaggedError("DocsAssemblyError")<{
  readonly reason: string;
}> {
  readonly [Runtime.errorReported] = false;

  override get message(): string {
    return this.reason;
  }
}

export interface AssembleDocsOptions {
  readonly allowUnpublishedSource: boolean;
  readonly manifest?: string | undefined;
  readonly manifestOutput: string;
  readonly output: string;
  readonly updateRef?: string | undefined;
  readonly updateVersion?: Version | undefined;
}

interface GitResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: Uint8Array;
}

interface SourceDetails {
  readonly packageVersion: string;
  readonly source: string;
}

const textDecoder = new TextDecoder();
const quoteJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const encodeUnknownJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Unknown, { space: 2 }),
);
const encodeManifest = Schema.encodeSync(
  Schema.fromJsonString(ManifestSchema, { space: 2 }),
);

const fail = (reason: string) => new DocsAssemblyError({ reason });

const isVersion = (value: string): value is Version =>
  VERSIONS.some((version) => version === value);

const readOptionValue = (
  args: ReadonlyArray<string>,
  index: number,
  option: string,
): Effect.Effect<
  readonly [value: string, nextIndex: number],
  DocsAssemblyError
> => {
  const argument = args[index];
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex >= 0) {
    const value = argument.slice(equalsIndex + 1);
    return value.length === 0
      ? Effect.fail(fail(`${option} requires a value`))
      : Effect.succeed([value, index] as const);
  }

  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return Effect.fail(fail(`${option} requires a value`));
  }
  return Effect.succeed([value, index + 1] as const);
};

export const parseOptions = Effect.fn("Docs.parseOptions")(function* (
  args: ReadonlyArray<string>,
) {
  let allowUnpublishedSource = false;
  let manifest: string | undefined;
  let manifestOutput: string | undefined;
  let output: string | undefined;
  let updateRef: string | undefined;
  let updateVersion: Version | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument.split("=", 1)[0];
    if (option === "--allow-unpublished-source") {
      if (argument !== option) {
        return yield* fail(`${option} does not accept a value`);
      }
      allowUnpublishedSource = true;
      continue;
    }

    switch (option) {
      case "--manifest": {
        const [value, nextIndex] = yield* readOptionValue(args, index, option);
        manifest = value;
        index = nextIndex;
        break;
      }
      case "--manifest-output": {
        const [value, nextIndex] = yield* readOptionValue(args, index, option);
        manifestOutput = value;
        index = nextIndex;
        break;
      }
      case "--output": {
        const [value, nextIndex] = yield* readOptionValue(args, index, option);
        output = value;
        index = nextIndex;
        break;
      }
      case "--update-ref": {
        const [value, nextIndex] = yield* readOptionValue(args, index, option);
        updateRef = value;
        index = nextIndex;
        break;
      }
      case "--update-version": {
        const [value, nextIndex] = yield* readOptionValue(args, index, option);
        if (!isVersion(value)) {
          return yield* fail(
            `Unknown documentation version ${quoteJsonString(value)}`,
          );
        }
        updateVersion = value;
        index = nextIndex;
        break;
      }
      default:
        return yield* fail(`Unknown argument ${quoteJsonString(argument)}`);
    }
  }

  if (output === undefined || manifestOutput === undefined) {
    return yield* fail("--output and --manifest-output are required");
  }
  if ((updateRef === undefined) !== (updateVersion === undefined)) {
    return yield* fail(
      "--update-version and --update-ref must be provided together",
    );
  }

  return {
    allowUnpublishedSource,
    manifest,
    manifestOutput,
    output,
    updateRef,
    updateVersion,
  } satisfies AssembleDocsOptions;
});

const concatenate = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const output = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const gitResult = Effect.fn("Docs.Git.run")(function* (
  args: ReadonlyArray<string>,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make("git", args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdoutChunks, stderr, exitCode] = yield* Effect.all(
        [
          Stream.runCollect(handle.stdout),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return {
        exitCode,
        stderr,
        stdout: concatenate(stdoutChunks),
      } satisfies GitResult;
    }),
  ).pipe(
    Effect.mapError((cause) =>
      fail(
        `Could not run git ${args.map((arg) => quoteJsonString(arg)).join(" ")}: ${cause.message}`,
      ),
    ),
  );
});

const gitBuffer = Effect.fn("Docs.Git.buffer")(function* (
  args: ReadonlyArray<string>,
) {
  const result = yield* gitResult(args);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim();
    return yield* fail(
      `git ${args.map((arg) => quoteJsonString(arg)).join(" ")} exited with code ${result.exitCode}${detail.length === 0 ? "" : `: ${detail}`}`,
    );
  }
  return result.stdout;
});

const gitText = (args: ReadonlyArray<string>) =>
  gitBuffer(args).pipe(
    Effect.map((output) => textDecoder.decode(output).trim()),
  );

const resolveCommit = Effect.fn("Docs.Git.resolveCommit")(function* (
  ref: string,
) {
  const candidates = ref.startsWith("origin/") ? [ref] : [ref, `origin/${ref}`];
  for (const candidate of candidates) {
    const result = yield* gitResult([
      "rev-parse",
      "--verify",
      `${candidate}^{commit}`,
    ]);
    if (result.exitCode === 0) {
      return textDecoder.decode(result.stdout).trim();
    }
  }
  return yield* fail(`Could not resolve Git ref ${quoteJsonString(ref)}`);
});

const latestV10PrereleaseRef = Effect.fn("Docs.Git.latestV10PrereleaseRef")(
  function* () {
    const tags = yield* gitText([
      "tag",
      "--list",
      "@confect/core@10.0.0-next.*",
      "--sort=-version:refname",
    ]);
    const latestTag = tags.split("\n").find(Boolean);
    if (latestTag === undefined) {
      return yield* fail("Could not find a published v10 prerelease tag");
    }
    return latestTag;
  },
);

const readGitFile = (source: string, filePath: string) =>
  gitBuffer(["show", `${source}:${filePath}`]);

const readPackageVersion = Effect.fn("Docs.readPackageVersion")(function* (
  source: string,
) {
  const contents = yield* readGitFile(source, CORE_PACKAGE_PATH);
  return yield* Schema.decodeEffect(Schema.fromJsonString(PackageJsonSchema))(
    textDecoder.decode(contents),
  ).pipe(
    Effect.mapError(() =>
      fail(`Invalid ${CORE_PACKAGE_PATH} at source ${source}`),
    ),
    Effect.map((packageJson) => packageJson.version),
  );
});

const readDocsConfig = Effect.fn("Docs.readConfig")(function* (source: string) {
  const configPath = `${DOCS_ROOT}/docs.json`;
  const contents = yield* readGitFile(source, configPath);
  const configText = textDecoder.decode(contents);
  const config = yield* Schema.decodeEffect(
    Schema.fromJsonString(JsonObjectSchema),
  )(configText).pipe(
    Effect.mapError(() => fail(`Invalid ${configPath} at source ${source}`)),
  );
  const validated = yield* Schema.decodeUnknownEffect(DocsConfigSchema, {
    onExcessProperty: "preserve",
  })(config).pipe(
    Effect.mapError(() => fail(`Invalid ${configPath} at source ${source}`)),
  );

  // Preserve the source config's property order while replacing the fields
  // whose shapes the schema validated above.
  return {
    ...config,
    navigation: validated.navigation,
    ...(validated.redirects === undefined
      ? {}
      : { redirects: validated.redirects }),
  } satisfies DocsConfig;
});

const initialManifest = Effect.fn("Docs.initialManifest")(function* () {
  const v10Ref = yield* latestV10PrereleaseRef();
  return ManifestSchema.make({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    defaultVersion: INITIAL_DEFAULT_VERSION,
    versions: {
      v9: { source: yield* resolveCommit(VERSION_DETAILS.v9.initialRef) },
      v10: { source: yield* resolveCommit(v10Ref) },
    },
  });
});

const loadManifest = Effect.fn("Docs.loadManifest")(function* (
  manifestPath: string | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  if (manifestPath === undefined || !(yield* fs.exists(manifestPath))) {
    return yield* initialManifest();
  }

  const contents = yield* fs.readFileString(manifestPath);
  return yield* Schema.decodeEffect(Schema.fromJsonString(ManifestSchema))(
    contents,
  ).pipe(
    Effect.mapError(() =>
      fail(`Invalid documentation release manifest at ${manifestPath}`),
    ),
  );
});

const updateManifestSource = (
  manifest: Manifest,
  version: Version | undefined,
  ref: string | undefined,
): Manifest => {
  if (version === undefined || ref === undefined) return manifest;
  return version === "v9"
    ? {
        ...manifest,
        versions: { ...manifest.versions, v9: { source: ref } },
      }
    : {
        ...manifest,
        versions: { ...manifest.versions, v10: { source: ref } },
      };
};

const validateSource = Effect.fn("Docs.validateSource")(function* (
  version: Version,
  sourceRef: string,
  allowUnpublishedSource: boolean,
) {
  const details = VERSION_DETAILS[version];
  const source = yield* resolveCommit(sourceRef);
  const packageVersion = yield* readPackageVersion(source);
  const packageMajor = Number.parseInt(packageVersion.split(".")[0], 10);
  if (packageMajor !== details.major) {
    return yield* fail(
      `${version} requires @confect/core major ${details.major}, but source ${source} contains ${packageVersion}; refusing to deploy it`,
    );
  }

  if (!allowUnpublishedSource) {
    const sourceBranchMembership = yield* Effect.forEach(
      details.branches,
      (branch) =>
        gitResult([
          "merge-base",
          "--is-ancestor",
          source,
          `origin/${branch}`,
        ]).pipe(Effect.map((result) => result.exitCode === 0)),
    );
    const belongsToSourceBranch = sourceBranchMembership.some(Boolean);
    if (!belongsToSourceBranch) {
      return yield* fail(
        `${version} source ${source} is not part of ${details.branches.join(" or ")}; refusing to deploy it`,
      );
    }
  }

  return { packageVersion, source } satisfies SourceDetails;
});

const versionPath = (filePath: string, version: Version): string => {
  if (/^v\d+(?:\/|$)/u.test(filePath)) return filePath;
  return `${version}/${filePath}`;
};

const rewriteDocumentationLinks = (
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
  if (typeof contents === "string") {
    yield* fs.writeFileString(filePath, contents);
  } else {
    yield* fs.writeFile(filePath, contents);
  }
});

const copyVersion = Effect.fn("Docs.copyVersion")(function* (
  version: Version,
  source: string,
  output: string,
) {
  const path = yield* Path.Path;
  const files = textDecoder
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

  yield* Effect.forEach(
    files,
    (sourcePath) =>
      Effect.gen(function* () {
        const relativePath = sourcePath.slice(`${DOCS_ROOT}/`.length);
        if (
          !relativePath.includes("/") &&
          EXCLUDED_VERSION_ROOT_FILES.has(relativePath)
        ) {
          return;
        }

        const sourceContents = yield* readGitFile(source, sourcePath);
        const extension = path.extname(relativePath);
        const outputContents =
          extension === ".md" || extension === ".mdx"
            ? rewriteDocumentationLinks(
                textDecoder.decode(sourceContents),
                version,
              )
            : sourceContents;
        yield* writeOutputFile(
          path.join(output, version, relativePath),
          outputContents,
        );
      }),
    { discard: true },
  );
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

  if (typeof value !== "object" || value === null) return value;

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
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      collectPageReferences(entry, key === "pages", pages);
    }
  }
  return pages;
};

const versionNavigation = (
  config: DocsConfig,
  version: Version,
  defaultVersion: Version,
): Record<string, unknown> => {
  const navigation = { ...config.navigation };
  delete navigation.global;

  return {
    version,
    ...(version === defaultVersion ? { default: true } : {}),
    tag:
      version === defaultVersion
        ? "Stable"
        : version === "v10"
          ? "Prerelease"
          : "Previous",
    ...Object.fromEntries(
      Object.entries(navigation).map(([key, value]) => [
        key,
        rewritePageLists(value, version, key === "pages"),
      ]),
    ),
  };
};

export const assembleDocs = Effect.fn("Docs.assemble")(function* (
  options: AssembleDocsOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repositoryRoot = yield* gitText(["rev-parse", "--show-toplevel"]);
  const output = path.resolve(options.output);
  const manifestOutput = path.resolve(options.manifestOutput);

  for (const prohibitedOutput of [
    path.parse(output).root,
    repositoryRoot,
    path.resolve(repositoryRoot, DOCS_ROOT),
  ]) {
    if (output === prohibitedOutput) {
      return yield* fail(
        `Refusing to replace unsafe output directory ${output}`,
      );
    }
  }

  let manifest = yield* loadManifest(options.manifest);
  manifest = updateManifestSource(
    manifest,
    options.updateVersion,
    options.updateRef,
  );

  const v9 = yield* validateSource(
    "v9",
    manifest.versions.v9.source,
    options.allowUnpublishedSource,
  );
  const v10 = yield* validateSource(
    "v10",
    manifest.versions.v10.source,
    options.allowUnpublishedSource,
  );
  const sources = { v9: v9.source, v10: v10.source };
  const configs = {
    v9: yield* readDocsConfig(v9.source),
    v10: yield* readDocsConfig(v10.source),
  };

  // The stable v10 publish carries a plain 10.x version, so the same
  // deployment that publishes it can promote the docs without a separate
  // manual switch.
  const defaultVersion: Version = v10.packageVersion.includes("-")
    ? "v9"
    : "v10";
  const defaultSource = sources[defaultVersion];
  const defaultConfig = configs[defaultVersion];
  manifest = {
    ...manifest,
    defaultVersion,
    versions: {
      v9: { source: sources.v9 },
      v10: { source: sources.v10 },
    },
  };

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
      return yield* fail(
        `Default-version docs already configure a redirect from ${redirect.source}`,
      );
    }
  }

  const combinedConfig = {
    ...defaultConfig,
    navigation: {
      ...(defaultConfig.navigation.global === undefined
        ? {}
        : { global: defaultConfig.navigation.global }),
      versions: [
        versionNavigation(configs.v9, "v9", defaultVersion),
        versionNavigation(configs.v10, "v10", defaultVersion),
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
    `${encodeUnknownJson(combinedConfig)}\n`,
  );

  yield* fs.makeDirectory(path.dirname(manifestOutput), { recursive: true });
  yield* fs.writeFileString(manifestOutput, `${encodeManifest(manifest)}\n`);

  yield* Console.log(
    `Assembled v9 (${sources.v9}) and v10 (${sources.v10}) documentation; ${defaultVersion} is stable`,
  );
});

export const main = Effect.fn("Docs.main")(function* (
  args: ReadonlyArray<string>,
) {
  const options = yield* parseOptions(args);
  yield* assembleDocs(options);
});

if (import.meta.main) {
  main(Bun.argv.slice(2)).pipe(
    Effect.tapErrorTag("DocsAssemblyError", (error) =>
      Console.error(error.message),
    ),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
