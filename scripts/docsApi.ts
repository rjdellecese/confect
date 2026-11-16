import * as BunServices from "@effect/platform-bun/BunServices";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import { Application, type TypeDocOptions } from "typedoc";
import type { PluginOptions } from "typedoc-plugin-markdown";
import { MintlifyRouter, MintlifyTheme } from "./docsApiTheme";
import docsConfig from "../apps/docs/docs.json";

const fs = Effect.runSync(
  FileSystem.FileSystem.pipe(Effect.provide(BunServices.layer)),
);
const { resolve } = Effect.runSync(
  Path.Path.pipe(Effect.provide(BunServices.layer)),
);
const Json = Schema.fromJsonString(Schema.Unknown, { space: 2 });
const root = resolve(import.meta.dir, "..");
const outIndex = process.argv.indexOf("--out");
const output = resolve(
  outIndex < 0 ? `${root}/apps/docs` : process.argv[outIndex + 1],
);
const check = process.argv.includes("--check");
const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
if (git.exitCode !== 0) process.exit(git.exitCode);
const revision = Str.trim(git.stdout.toString());
const packages = ["core", "foldkit", "js", "react", "server", "test"];
const rendered = await Effect.runPromise(
  fs.makeTempDirectory({ prefix: "confect-api-render-" }),
);
try {
  const options: Partial<TypeDocOptions & PluginOptions> = {
    name: "Confect API",
    entryPoints: Array.map(
      packages,
      (name) => `${root}/packages/${name}/src/index.ts`,
    ),
    tsconfig: `${root}/tsconfig.docs.json`,
    plugin: ["typedoc-plugin-markdown"],
    excludeInternal: true,
    excludeExternals: true,
    excludePrivate: true,
    excludeProtected: true,
    readme: "none",
    theme: "mintlify",
    router: "mintlify",
    fileExtension: ".mdx",
    entryFileName: "index",
    hidePageHeader: true,
    hidePageTitle: true,
    hideBreadcrumbs: true,
    useCodeBlocks: true,
    sanitizeComments: true,
    useHTMLAnchors: true,
    gitRevision: revision,
    sourceLinkTemplate:
      "https://github.com/rjdellecese/confect/blob/{gitRevision}/{path}#L{line}",
    out: `${rendered}/api/reference`,
  };
  const app = await Application.bootstrapWithPlugins(options);
  app.renderer.defineTheme("mintlify", MintlifyTheme);
  app.renderer.defineRouter("mintlify", MintlifyRouter);
  const project = await app.convert();
  if (project === undefined) process.exit(1);
  for (const child of project.children ?? [])
    child.name = Str.replace(/\/src$/, "")(child.name);
  app.validate(project);
  if (app.logger.hasErrors()) process.exit(1);
  await Effect.runPromise(fs.makeDirectory(rendered, { recursive: true }));
  await app.generateOutputs(project);
  if (app.logger.hasErrors()) process.exit(1);

  const packagePages = await Effect.runPromise(
    Effect.forEach(packages, (name) =>
      Effect.gen(function* () {
        const files = yield* fs.readDirectory(
          `${rendered}/api/reference/${name}`,
          {
            recursive: true,
          },
        );
        const pages = Array.map(
          Array.filter(files, Str.endsWith(".mdx")).sort((a, b) =>
            a === "index.mdx"
              ? -1
              : b === "index.mdx"
                ? 1
                : a < b
                  ? -1
                  : a > b
                    ? 1
                    : 0,
          ),
          (file) => `api/reference/${name}/${Str.replace(/\.mdx$/, "")(file)}`,
        );
        const metadata = yield* fs.readFileString(
          `${root}/packages/${name}/package.json`,
        );
        const { version } = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
        )(metadata);
        return {
          group: { group: `@confect/${name}`, pages },
          version: `| @confect/${name} | ${version} |`,
        };
      }),
    ),
  );
  const apiGroup = {
    group: "API Reference",
    pages: [
      "api/overview",
      "api/generated",
      "api/reference/source",
      ...Array.map(packagePages, (item) => item.group),
    ],
  };
  const config = {
    ...docsConfig,
    navigation: {
      ...docsConfig.navigation,
      groups: [
        ...Array.filter(
          docsConfig.navigation.groups,
          (group) => group.group !== "API Reference",
        ),
        apiGroup,
      ],
    },
  };
  const encoded = Effect.runSync(Schema.encodeEffect(Json)(config));
  if (
    check &&
    encoded !== Effect.runSync(Schema.encodeEffect(Json)(docsConfig))
  ) {
    Effect.runSync(
      Console.error(
        "API navigation is stale. Run pnpm docs:api and commit apps/docs/docs.json.",
      ),
    );
    process.exit(1);
  }
  await Effect.runPromise(
    fs.writeFileString(`${rendered}/docs.json`, `${encoded}\n`),
  );
  await Effect.runPromise(
    fs.writeFileString(
      `${rendered}/api/reference/source.mdx`,
      `---\ntitle: "Reference source"\ndescription: "Source revision and package versions used to generate this API reference."\n---\n\nThis reference was generated from [\`${revision}\`](https://github.com/rjdellecese/confect/tree/${revision}), not from installed package releases. A checkout can include changes not yet published to npm.\n\n| Package | Source version |\n| --- | --- |\n${Array.join(
        Array.map(packagePages, (item) => item.version),
        "\n",
      )}\n`,
    ),
  );
  const format = Bun.spawnSync(
    [
      "pnpm",
      "oxfmt",
      "--write",
      `${rendered}/docs.json`,
      `${rendered}/api/reference`,
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" },
  );
  if (format.exitCode !== 0) process.exit(format.exitCode);
  await Effect.runPromise(
    fs.makeDirectory(`${output}/api`, { recursive: true }),
  );
  await Effect.runPromise(
    fs.remove(`${output}/api/reference`, { recursive: true, force: true }),
  );
  await Effect.runPromise(
    fs.copy(`${rendered}/api/reference`, `${output}/api/reference`, {
      overwrite: true,
    }),
  );
  await Effect.runPromise(
    fs.copyFile(`${rendered}/docs.json`, `${output}/docs.json`),
  );
  Effect.runSync(Console.log(`Generated API reference from ${revision}`));
} finally {
  await Effect.runPromise(
    fs.remove(rendered, { recursive: true, force: true }),
  );
}
