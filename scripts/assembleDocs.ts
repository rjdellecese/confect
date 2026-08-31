#!/usr/bin/env bun

// The source branches keep an ordinary, unversioned Mintlify tree so their
// previews stay useful. This script is the boundary that turns those trees
// into the versioned deployment artifact committed to `release`.

// oxlint-disable-next-line effecttsgo/node-builtin-import -- Bun implements Node's process APIs, and this deployment tool must run on both the Effect 3 and Effect 4 branches.
import { execFileSync, spawnSync } from "node:child_process";
// oxlint-disable effecttsgo/node-builtin-import -- Bun implements these filesystem APIs; keeping the tool dependency-free lets both release branches run identical code.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
// oxlint-enable effecttsgo/node-builtin-import
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Bun implements Node's portable path API.
import { dirname, extname, join, parse, resolve } from "node:path";
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
  source: string;
}

interface Manifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  defaultVersion: Version;
  versions: Record<Version, VersionSource>;
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

const parseVersion = (value: string): Version => {
  if (!isVersion(value)) {
    throw new Error(`Unknown documentation version ${JSON.stringify(value)}`);
  }
  return value;
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "allow-unpublished-source": { type: "boolean" },
    manifest: { type: "string" },
    "manifest-output": { type: "string" },
    output: { type: "string" },
    "update-ref": { type: "string" },
    "update-version": { type: "string" },
  },
  strict: true,
});

const outputArgument = values.output;
const manifestOutputArgument = values["manifest-output"];
const allowUnpublishedSource = values["allow-unpublished-source"] ?? false;
const updateRef = values["update-ref"];
const updateVersionValue = values["update-version"];
const updateVersion =
  updateVersionValue === undefined
    ? undefined
    : parseVersion(updateVersionValue);

if (outputArgument === undefined || manifestOutputArgument === undefined) {
  throw new Error("--output and --manifest-output are required");
}

if ((updateRef === undefined) !== (updateVersion === undefined)) {
  throw new Error(
    "--update-version and --update-ref must be provided together",
  );
}

const gitBuffer = (args: ReadonlyArray<string>): Buffer =>
  execFileSync("git", [...args], {
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const gitText = (args: ReadonlyArray<string>): string =>
  gitBuffer(args).toString("utf8").trim();

const repositoryRoot = gitText(["rev-parse", "--show-toplevel"]);
const output = resolve(outputArgument);
const manifestOutput = resolve(manifestOutputArgument);

for (const prohibitedOutput of [
  parse(output).root,
  repositoryRoot,
  resolve(repositoryRoot, DOCS_ROOT),
]) {
  if (output === prohibitedOutput) {
    throw new Error(`Refusing to replace unsafe output directory ${output}`);
  }
}

const resolveCommit = (ref: string): string => {
  const candidates = ref.startsWith("origin/") ? [ref] : [ref, `origin/${ref}`];
  for (const candidate of candidates) {
    const result = spawnSync(
      "git",
      ["rev-parse", "--verify", `${candidate}^{commit}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    if (result.status === 0) return result.stdout.trim();
  }
  throw new Error(`Could not resolve Git ref ${JSON.stringify(ref)}`);
};

const latestV10PrereleaseRef = (): string => {
  const tags = gitText([
    "tag",
    "--list",
    "@confect/core@10.0.0-next.*",
    "--sort=-version:refname",
  ]);
  const latestTag = tags.split("\n").find(Boolean);
  if (latestTag === undefined) {
    throw new Error("Could not find a published v10 prerelease tag");
  }
  return latestTag;
};

const readGitFile = (source: string, filePath: string): Buffer =>
  gitBuffer(["show", `${source}:${filePath}`]);

const readGitJson = (source: string, filePath: string): unknown =>
  JSON.parse(readGitFile(source, filePath).toString("utf8")) as unknown;

const readPackageVersion = (source: string): string => {
  const packageJson = readGitJson(source, CORE_PACKAGE_PATH);
  if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
    throw new Error(`Invalid ${CORE_PACKAGE_PATH} at source ${source}`);
  }
  return packageJson.version;
};

const readDocsConfig = (source: string): DocsConfig => {
  const configPath = `${DOCS_ROOT}/docs.json`;
  const config = readGitJson(source, configPath);
  if (!isRecord(config) || !isRecord(config.navigation)) {
    throw new Error(`Invalid ${configPath} at source ${source}`);
  }

  const redirects = config.redirects;
  if (
    redirects !== undefined &&
    (!Array.isArray(redirects) ||
      !redirects.every(
        (redirect) =>
          isRecord(redirect) &&
          typeof redirect.source === "string" &&
          typeof redirect.destination === "string",
      ))
  ) {
    throw new Error(`Invalid ${configPath} redirects at source ${source}`);
  }

  return {
    ...config,
    navigation: config.navigation,
    ...(redirects === undefined
      ? {}
      : { redirects: redirects as ReadonlyArray<Redirect> }),
  };
};

const initialManifest = (): Manifest => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  defaultVersion: INITIAL_DEFAULT_VERSION,
  versions: {
    v9: { source: resolveCommit(VERSION_DETAILS.v9.initialRef) },
    v10: { source: resolveCommit(latestV10PrereleaseRef()) },
  },
});

const loadManifest = (): Manifest => {
  const manifestPath = values.manifest;
  if (manifestPath === undefined || !existsSync(manifestPath)) {
    return initialManifest();
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
    typeof manifest.defaultVersion !== "string" ||
    !isVersion(manifest.defaultVersion) ||
    !isRecord(manifest.versions)
  ) {
    throw new Error(
      `Invalid documentation release manifest at ${manifestPath}`,
    );
  }

  for (const version of VERSIONS) {
    const entry = manifest.versions[version];
    if (!isRecord(entry) || typeof entry.source !== "string") {
      throw new Error(
        `Invalid ${version} source in documentation release manifest`,
      );
    }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    defaultVersion: manifest.defaultVersion,
    versions: {
      v9: { source: (manifest.versions.v9 as VersionSource).source },
      v10: { source: (manifest.versions.v10 as VersionSource).source },
    },
  };
};

const manifest = loadManifest();

if (updateVersion !== undefined && updateRef !== undefined) {
  manifest.versions[updateVersion].source = resolveCommit(updateRef);
}

for (const version of VERSIONS) {
  const details = VERSION_DETAILS[version];
  const source = resolveCommit(manifest.versions[version].source);
  const packageVersion = readPackageVersion(source);
  const packageMajor = Number.parseInt(packageVersion.split(".")[0], 10);
  if (packageMajor !== details.major) {
    throw new Error(
      `${version} requires @confect/core major ${details.major}, but source ${source} contains ${packageVersion}; refusing to deploy it`,
    );
  }
  const belongsToSourceBranch = details.branches.some((branch) => {
    const ancestry = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", source, `origin/${branch}`],
      { stdio: "ignore" },
    );
    return ancestry.status === 0;
  });
  if (!allowUnpublishedSource && !belongsToSourceBranch) {
    throw new Error(
      `${version} source ${source} is not part of ${details.branches.join(" or ")}; refusing to deploy it`,
    );
  }
  manifest.versions[version].source = source;
}

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

const writeOutputFile = (
  filePath: string,
  contents: string | Uint8Array,
): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
};

const copyVersion = (version: Version, source: string): void => {
  const files = gitBuffer([
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    source,
    "--",
    DOCS_ROOT,
  ])
    .toString("utf8")
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

    const sourceContents = readGitFile(source, sourcePath);
    const extension = extname(relativePath);
    const outputContents =
      extension === ".md" || extension === ".mdx"
        ? rewriteDocumentationLinks(sourceContents.toString("utf8"), version)
        : sourceContents;
    writeOutputFile(join(output, version, relativePath), outputContents);
  }
};

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

const versionNavigation = (
  config: DocsConfig,
  version: Version,
  defaultVersion: Version,
): Record<string, unknown> => {
  const navigation = { ...config.navigation };
  delete navigation.global;

  const rewrittenNavigation = rewritePageLists(navigation, version);
  if (!isRecord(rewrittenNavigation)) {
    throw new Error(`Invalid ${version} navigation`);
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
};

const sources: Record<Version, string> = {
  v9: manifest.versions.v9.source,
  v10: manifest.versions.v10.source,
};
const configs: Record<Version, DocsConfig> = {
  v9: readDocsConfig(sources.v9),
  v10: readDocsConfig(sources.v10),
};
const v10PackageVersion = readPackageVersion(sources.v10);
// The stable v10 publish carries a plain 10.x version, so the same deployment
// that publishes it can promote the docs without a separate manual switch.
const defaultVersion: Version = v10PackageVersion.includes("-") ? "v9" : "v10";
manifest.defaultVersion = defaultVersion;
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
    throw new Error(
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

rmSync(output, { force: true, recursive: true });
mkdirSync(output, { recursive: true });
copyVersion("v9", sources.v9);
copyVersion("v10", sources.v10);
writeOutputFile(
  join(output, "favicon.svg"),
  readGitFile(defaultSource, `${DOCS_ROOT}/favicon.svg`),
);
writeOutputFile(
  join(output, "docs.json"),
  `${JSON.stringify(combinedConfig, undefined, 2)}\n`,
);

mkdirSync(dirname(manifestOutput), { recursive: true });
writeFileSync(manifestOutput, `${JSON.stringify(manifest, undefined, 2)}\n`);

// oxlint-disable-next-line effecttsgo/global-console -- This standalone deployment script reports the immutable inputs it assembled.
console.log(
  `Assembled v9 (${sources.v9}) and v10 (${sources.v10}) documentation; ${defaultVersion} is stable`,
);
