#!/usr/bin/env node

// The source branches keep an ordinary, unversioned Mintlify tree so their
// previews stay useful. This script is the boundary that turns those trees
// into the versioned deployment artifact committed to `release`.

// oxlint-disable-next-line effecttsgo/node-builtin-import -- This standalone deployment script runs outside an Effect application runtime.
import { execFileSync, spawnSync } from "node:child_process";
// oxlint-disable effecttsgo/node-builtin-import -- This standalone deployment script runs outside an Effect application runtime.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
// oxlint-enable effecttsgo/node-builtin-import
// oxlint-disable-next-line effecttsgo/node-builtin-import -- This standalone deployment script runs outside an Effect application runtime.
import { dirname, extname, join, parse, resolve } from "node:path";
import { parseArgs } from "node:util";

const VERSION_DETAILS = {
  v9: {
    branches: ["main"],
    initialRef: "origin/release",
  },
  v10: {
    branches: ["v10", "main"],
    initialRef: undefined,
  },
};

const INITIAL_DEFAULT_VERSION = "v9";
const MANIFEST_SCHEMA_VERSION = 1;
const DOCS_ROOT = "apps/docs";
const EXCLUDED_VERSION_ROOT_FILES = new Set([
  ".prettierignore",
  ".prettierrc.json",
  "CHANGELOG.md",
  "README.md",
  "docs.json",
  "favicon.svg",
  "package.json",
]);

const { values } = parseArgs({
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
const updateVersion = values["update-version"];

if (!outputArgument || !manifestOutputArgument) {
  throw new Error("--output and --manifest-output are required");
}

if ((updateRef === undefined) !== (updateVersion === undefined)) {
  throw new Error(
    "--update-version and --update-ref must be provided together",
  );
}

if (updateVersion !== undefined && !(updateVersion in VERSION_DETAILS)) {
  throw new Error(
    `Unknown documentation version ${JSON.stringify(updateVersion)}`,
  );
}

const gitBuffer = (args) =>
  execFileSync("git", args, {
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const gitText = (args) => gitBuffer(args).toString("utf8").trim();

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

const resolveCommit = (ref) => {
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

const latestV10PrereleaseRef = () => {
  const tags = gitText([
    "tag",
    "--list",
    "@confect/core@10.0.0-next.*",
    "--sort=-version:refname",
  ]);
  const latestTag = tags.split("\n").find(Boolean);
  if (!latestTag) {
    throw new Error("Could not find a published v10 prerelease tag");
  }
  return latestTag;
};

const initialManifest = () => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  defaultVersion: INITIAL_DEFAULT_VERSION,
  versions: Object.fromEntries(
    Object.entries(VERSION_DETAILS).map(([version, details]) => [
      version,
      {
        source: resolveCommit(details.initialRef ?? latestV10PrereleaseRef()),
      },
    ]),
  ),
});

const loadManifest = () => {
  const manifestPath = values.manifest;
  if (!manifestPath || !existsSync(manifestPath)) {
    return initialManifest();
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
    !(manifest.defaultVersion in VERSION_DETAILS) ||
    typeof manifest.versions !== "object" ||
    manifest.versions === null
  ) {
    throw new Error(
      `Invalid documentation release manifest at ${manifestPath}`,
    );
  }

  for (const version of Object.keys(VERSION_DETAILS)) {
    const entry = manifest.versions[version];
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.source !== "string"
    ) {
      throw new Error(
        `Invalid ${version} source in documentation release manifest`,
      );
    }
  }

  return manifest;
};

const manifest = loadManifest();

if (updateVersion !== undefined && updateRef !== undefined) {
  manifest.versions[updateVersion].source = resolveCommit(updateRef);
}

for (const [version, details] of Object.entries(VERSION_DETAILS)) {
  const source = resolveCommit(manifest.versions[version].source);
  const belongsToSourceBranch = details.branches.some((branch) => {
    const ancestry = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", source, `origin/${branch}`],
      {
        stdio: "ignore",
      },
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

const readGitFile = (source, path) => gitBuffer(["show", `${source}:${path}`]);

const readGitJson = (source, path) =>
  JSON.parse(readGitFile(source, path).toString("utf8"));

const versionPath = (path, version) => {
  if (/^v\d+(?:\/|$)/u.test(path)) return path;
  return `${version}/${path}`;
};

const rewriteDocumentationLinks = (contents, version) => {
  let fenceMarker;
  return contents
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
      if (fence) {
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
          (_match, path) => `](/${versionPath(path, version)}`,
        )
        .replace(
          /(href\s*=\s*["'])\/(?!\/)([^"']*)/gu,
          (_match, start, path) => `${start}/${versionPath(path, version)}`,
        )
        .replace(
          /(href\s*=\s*\{\s*["'])\/(?!\/)([^"']*)/gu,
          (_match, start, path) => `${start}/${versionPath(path, version)}`,
        )
        .replace(
          /(from\s+["'])\/(?!\/)([^"']*)/gu,
          (_match, start, path) => `${start}/${versionPath(path, version)}`,
        );
    })
    .join("\n");
};

const writeOutputFile = (path, contents) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

const copyVersion = (version, source) => {
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

  for (const path of files) {
    const relativePath = path.slice(`${DOCS_ROOT}/`.length);
    if (
      !relativePath.includes("/") &&
      EXCLUDED_VERSION_ROOT_FILES.has(relativePath)
    ) {
      continue;
    }

    const sourceContents = readGitFile(source, path);
    const extension = extname(relativePath);
    const outputContents =
      extension === ".md" || extension === ".mdx"
        ? rewriteDocumentationLinks(sourceContents.toString("utf8"), version)
        : sourceContents;
    writeOutputFile(join(output, version, relativePath), outputContents);
  }
};

const prefixPageReference = (page, version) => {
  if (/^(?:https?:\/\/|[A-Z]+ \/)/u.test(page)) return page;
  const path = page.startsWith("/") ? page.slice(1) : page;
  return versionPath(path, version);
};

const rewritePageLists = (value, version, insidePages = false) => {
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

const collectPageReferences = (value, insidePages = false, pages = []) => {
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

const versionNavigation = (config, version, defaultVersion) => {
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
    ...rewritePageLists(navigation, version),
  };
};

const sources = Object.fromEntries(
  Object.keys(VERSION_DETAILS).map((version) => [
    version,
    manifest.versions[version].source,
  ]),
);
const configs = Object.fromEntries(
  Object.entries(sources).map(([version, source]) => [
    version,
    readGitJson(source, `${DOCS_ROOT}/docs.json`),
  ]),
);
const v10PackageVersion = readGitJson(
  sources.v10,
  "packages/core/package.json",
).version;
// The stable v10 publish carries a plain 10.x version, so the same deployment
// that publishes it can promote the docs without a separate manual switch.
const defaultVersion = v10PackageVersion.includes("-") ? "v9" : "v10";
manifest.defaultVersion = defaultVersion;
const defaultSource = sources[defaultVersion];
const defaultConfig = configs[defaultVersion];

const generatedRedirects = [
  ...new Set(collectPageReferences(defaultConfig.navigation)),
]
  .filter((page) => !/^(?:https?:\/\/|[A-Z]+ \/)/u.test(page))
  .map((page) => {
    const path = page.startsWith("/") ? page.slice(1) : page;
    return {
      source: `/${path}`,
      destination: `/${prefixPageReference(path, defaultVersion)}`,
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
