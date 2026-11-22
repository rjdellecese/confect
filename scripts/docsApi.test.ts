import { afterAll, beforeAll, expect, test } from "bun:test";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Str from "effect/String";
import * as Option from "effect/Option";
import docsConfig from "../apps/docs/docs.json";
import { Application, Converter } from "typedoc";
import { fromMarkdown } from "mdast-util-from-markdown";
import {
  MintlifyRouter,
  MintlifyTheme,
  presentationOptions,
  normalizeCategories,
  preserveReexportCategories,
  formatDeclarationDetails,
} from "./docsApiTheme";

const fs = Effect.runSync(
  FileSystem.FileSystem.pipe(Effect.provide(BunServices.layer)),
);
const { resolve } = Effect.runSync(
  Path.Path.pipe(Effect.provide(BunServices.layer)),
);
const root = resolve(import.meta.dir, "..");
let directory: string;
const pages = new Map<string, string>();

beforeAll(
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        directory = yield* fs.makeTempDirectory({ prefix: "confect-api-" });
        for (const run of ["first", "second"]) {
          const result = Bun.spawnSync(
            [
              "bun",
              "scripts/docsApi.ts",
              "--check",
              "--out",
              `${directory}/${run}`,
            ],
            { cwd: root },
          );
          expect(
            result.exitCode,
            result.stdout.toString() + result.stderr.toString(),
          ).toBe(0);
        }
        const files = yield* fs.readDirectory(`${directory}/first`, {
          recursive: true,
        });
        for (const file of Array.filter(files, Str.endsWith(".mdx"))) {
          const first = yield* fs.readFileString(`${directory}/first/${file}`);
          const second = yield* fs.readFileString(
            `${directory}/second/${file}`,
          );
          expect(first, file).toBe(second);
          pages.set(file, first);
        }
        const firstConfig = yield* fs.readFileString(
          `${directory}/first/docs.json`,
        );
        const secondConfig = yield* fs.readFileString(
          `${directory}/second/docs.json`,
        );
        expect(firstConfig).toBe(secondConfig);
      }),
    ),
  90000,
);

afterAll(() =>
  Effect.runPromise(fs.remove(directory, { recursive: true, force: true })),
);

test("keeps semantic groups and members in the outline without boilerplate labels", () => {
  for (const [path, page] of pages) {
    const detailHeadings = Array.filter(
      fromMarkdown(page).children,
      (node) => node.type === "heading" && node.depth > 3,
    );
    expect(detailHeadings, path).toEqual([]);
  }
  const functions = pages.get("api/reference/core/FunctionSpec.mdx") ?? "";
  expect(
    Array.fromIterable(Str.matchAll(/^\*\*Call Signature\*\*$/gm)(functions))
      .length,
  ).toBeGreaterThan(1);
  expect(functions).toContain("**Returns**");
  expect(functions).toContain("**Throws**");
  expect(functions).toContain("## Combinators");
  expect(functions).toContain("### functionSpec.middleware()");
  expect(functions).toContain("**Middleware**");
  expect(functions).toContain("**middlewareAttachments**");
  expect(functions).not.toMatch(
    /^#{2,6} (Parameters|Returns|Type Parameters|Throws|Call Signature|Inherited from)$/m,
  );
  expect(functions).not.toMatch(/^### .*\((function|type|class|value)\)$/m);
  expect(pages.get("api/reference/server/ExecutionMetadata.mdx")).toContain(
    "**Service operations**",
  );
  expect(pages.get("api/reference/server/ExecutionMetadata.mdx")).toContain(
    "### ExecutionMetadata.getFunction",
  );
  expect(pages.get("api/reference/server/ActionRunner.mdx")).toContain(
    "### ActionRunner.runAction",
  );
  expect(pages.get("api/reference/server/QueryStream.mdx")).toContain(
    "**bytesRead**",
  );
});

test("formats detail labels without rewriting fenced examples, tables, or anchors", () => {
  const input = Array.join(
    [
      "## Models",
      "",
      "### Example",
      "",
      '<span id="parameter"></span>',
      "",
      "#### Parameters",
      "",
      "| Name | Type |",
      "| --- | --- |",
      "| value | string |",
      "",
      "````md",
      "#### Not a detail label",
      "```ts",
      "const example = '#### Keep this';",
      "```",
      "````",
      "",
      "~~~~md",
      "#### Also an example",
      "~~~~",
      "",
      "##### `value`",
      "",
      "[Linked parameter](#parameter)",
      "",
    ],
    "\n",
  );
  expect(formatDeclarationDetails(input)).toBe(
    Str.replace(
      "##### `value`",
      "**`value`**",
    )(Str.replace("#### Parameters", "**Parameters**")(input)),
  );
});

test("indexes middleware on the returned spec without changing the Builder contract", () => {
  const functions = pages.get("api/reference/core/FunctionSpec.mdx") ?? "";
  const combinators = Str.split("## Constructors")(functions)[0];
  expect(combinators).toMatch(
    /## Combinators[\s\S]*<span id="api-middleware"><\/span>\n\n### functionSpec\.middleware\(\)/,
  );
  expect(Array.fromIterable(Str.matchAll(/^### /gm)(combinators))).toHaveLength(
    1,
  );
  expect(functions).not.toMatch(/^### Builder\b/m);
  expect(combinators).toContain(
    "function spec returned by a Confect constructor",
  );
  expect(combinators).toContain(
    "middleware<MiddlewareSpec_>(middlewareSpec, ...options): Builder<",
  );
  expect(combinators).toMatch(
    /Defined in: \[packages\/core\/src\/FunctionSpec\.ts:\d+\]/,
  );
  expect(combinators).toContain("The required attachment value");
  expect(combinators).toContain("**Returns**");
  expect(combinators).toContain("**Throws**");
  expect(functions).toContain("[`Builder`](#functionspec-middleware)");
  for (const id of [
    "builder",
    "builder-middleware",
    "api-builder",
    "api-type-parameter-name_",
  ])
    expect(combinators).toContain(`<span id="${id}"></span>`);
  expect(functions).toMatch(
    /id="api-middlewareattachments"><\/span>\s*<span id="api-middlewareattachments-1"><\/span>\s*\*\*middlewareAttachments\*\*/,
  );
  expect(pages.get("api/reference/server/FunctionImpl.mdx")).toMatch(
    /^### Builder$/m,
  );
  expect(
    Array.fromIterable(
      Str.matchAll(/Attach middleware around this function's handler/g)(
        functions,
      ),
    ),
  ).toHaveLength(1);
  const constructors = Str.split("## Models")(
    Str.split("## Constructors")(functions)[1],
  )[0];
  const sections = Array.drop(Str.split(/^### /m)(constructors), 1);
  expect(sections).toHaveLength(18);
  for (const section of sections) {
    const name = Str.split("\n")(section)[0];
    const adapter = Str.startsWith("convex")(name);
    const methodLink = "[.middleware()](#functionspec-middleware)";
    expect(
      Array.fromIterable(
        Str.matchAll(/\[`Builder`\]\(#functionspec-middleware\)/g)(section),
      ),
      name,
    ).toHaveLength(adapter ? 1 : 2);
    if (adapter) {
      expect(section, name).toContain("A name-taking factory");
      expect(section, name).not.toContain(methodLink);
    } else {
      expect(section, name).toContain(methodLink);
      expect(section, name).toContain(
        Str.includes("Paginated")(name)
          ? "A query spec whose handler returns a page with cursors"
          : "A function spec. Call",
      );
    }
  }
});

test("preserves renderer-identified semantics rather than every heading at a depth", () => {
  const service = pages.get("api/reference/server/ActionRunner.mdx") ?? "";
  expect(service).toMatch(
    /## Invocation[\s\S]*### ActionRunner\.runAction[\s\S]*## Services/,
  );
  expect(service).toContain(
    "See [ActionRunner.runAction](#api-operationactionrunnerrunaction).",
  );
  expect(pages.get("api/reference/foldkit/PaginatedQuery.mdx")).toContain(
    "### PaginatedQuery.init",
  );
  const aliases = pages.get("api/reference/server/Table.mdx") ?? "";
  expect(aliases).toContain("## Constructors");
  expect(aliases).toContain("## Models");
  expect(aliases).not.toContain("## Other");
  expect(aliases).toContain(
    "Re-exports [make](/api/reference/core/Table#api-make)",
  );
});

test("retains source categories and upstream contracts on public reexports", () => {
  for (const [module, names] of [
    ["server/ExecutionMetadata", ["DeploymentMetadata", "FunctionMetadata"]],
    ["server/RequestMetadata", ["Metadata"]],
    ["server/TransactionMetadata", ["TransactionMetric", "TransactionMetrics"]],
    ["server/MutationAuth", ["SignJwtClaims", "SignJwtOptions"]],
    ["test/TestConfect", ["DeploymentJwk", "DeploymentJwks"]],
  ] as const) {
    const page = pages.get(`api/reference/${module}.mdx`);
    expect(page).toContain("## Models");
    expect(page).not.toContain("## Other");
    for (const name of names)
      expect(page).toContain(
        `### ${name}\n\n<Badge color="gray" size="sm">\n  type\n</Badge>`,
      );
  }
  expect(pages.get("api/reference/server/ExecutionMetadata.mdx")).toContain(
    "Metadata about the deployment this function is running on.",
  );
  expect(pages.get("api/reference/server/ExecutionMetadata.mdx")).toContain(
    "region: string | null",
  );
  expect(pages.get("api/reference/server/ExecutionMetadata.mdx")).toContain(
    "Read metadata for the current function, including its name and component.",
  );
});

test("renders public functions, overloads, classes, types, and inferred service operations", () => {
  expect(pages.get("api/reference/server/QueryStream.mdx")).toContain(
    '### map\n\n<Badge color="gray" size="sm">\n  function\n</Badge>',
  );
  const functions = pages.get("api/reference/core/FunctionSpec.mdx");
  expect(functions).toContain("publicQuery");
  expect(functions).toContain("**Call Signature**");
  expect(functions).toContain("Declare a public query in the Convex runtime.");
  expect(pages.get("api/reference/core/PaginationError.mdx")).toContain(
    '<span id="api-invalidcursor"></span>',
  );
  expect(pages.get("api/reference/core/GenericId.mdx")).toContain("GenericId");
  expect(pages.get("api/reference/server/ActionRunner.mdx")).toContain(
    "Invoke an action ref with decoded arguments.",
  );
  expect(pages.get("api/reference/server/ActionRunner.mdx")).toContain(
    "Native/undeclared failures become defects.",
  );
  expect(pages.get("api/reference/server/DatabaseReader.mdx")).toContain(
    "Select a table for document lookup or query construction.",
  );
  expect(pages.get("api/reference/server/DatabaseReader.mdx")).toMatch(
    /Selecting a\s+handle does not read any documents\./,
  );
  expect(pages.get("api/reference/server/DatabaseReader.mdx")).toMatch(
    /Narrow the handle by `tableName` before selecting a table-specific\s+index/,
  );
  expect(pages.get("api/reference/server/Table.mdx")).toContain(
    "## System tables",
  );
  expect(pages.get("api/reference/server/Table.mdx")).toContain(
    'id="api-_storage"',
  );
  expect(pages.get("api/reference/server/Table.mdx")).toContain(
    'id="api-_scheduled_functions"',
  );
  expect(pages.get("api/reference/server/FunctionImpl.mdx")).toContain(
    "### Builder.make",
  );
  expect(pages.get("api/reference/server/MiddlewareImpl.mdx")).toContain(
    "### Builders.makeByFunctionType",
  );
  expect(pages.get("api/reference/server/HttpRouter.mdx")).toContain(
    "function make<DatabaseSchema_>(routes)",
  );
  expect(pages.get("api/reference/test/TestConfect.mdx")).toMatch(
    /function layer<DatabaseSchema_>\(\s*tableNames,\s*convexSchemaDefinition,\s*modules,/,
  );
  expect(pages.get("api/reference/react/index.mdx")).toContain("useMutation");
  expect(pages.get("api/reference/react/PaginatedQueryResult.mdx")).toContain(
    '<span id="api-paginatedqueryresultproto"></span>',
  );
  expect(
    pages.has(
      "api/reference/react/PaginatedQueryResult/PaginatedQueryResult.mdx",
    ),
  ).toBe(false);
  expect(pages.get("api/reference/server/VectorSearch.mdx")).toContain(
    "ranked &#123;\\_id, \\_score&#125; matches",
  );
  expect(pages.get("api/reference/server/VectorSearch.mdx")).toContain(
    "`number`[]",
  );
  expect(pages.get("api/reference/server/VectorSearch.mdx")).toContain(
    "_score: number",
  );
  expect(pages.get("api/reference/server/VectorSearch.mdx")).toContain(
    "`query.vector`",
  );
});

test("keeps public error aliases and experimental QueryStream docs without internal pages", () => {
  const stream = pages.get("api/reference/server/QueryStream.mdx");
  expect(stream).toContain("Experimental");
  expect(stream).toContain('<span id="api-emptyinitialpageerror"></span>');
  expect(stream).toContain('<span id="api-invalidpagesizeerror"></span>');
  expect(stream).toContain('<span id="api-readbudgetexceedederror"></span>');
  expect(stream).not.toMatch(/^#{2,6} makeEffect/m);
  for (const [path, content] of pages) {
    expect(path).not.toMatch(
      /QueryStream(?!\.mdx)|\/internal\/|Registered|Registry|FunctionProvenance/,
    );
    expect(content).not.toContain("apps/example/");
    expect(content).not.toContain("test/mock-backend/fixtures/");
    expect(content).not.toContain("tools/local-backend/fixtures/");
  }
  expect(pages.get("api/reference/server/DatabaseReader.mdx")).not.toMatch(
    /^#{2,6} make/m,
  );
  expect(pages.get("api/reference/core/FunctionSpec.mdx")).not.toMatch(
    /^#{2,6} TypeId/m,
  );
});

test("all generated page links and explicit TypeDoc anchors resolve", () => {
  for (const [path, content] of pages) {
    const anchors = Array.fromIterable(
      Str.matchAll(/<span id="([^"]+)"><\/span>/g)(content),
    );
    expect(new Set(Array.map(anchors, (match) => match[1])).size, path).toBe(
      anchors.length,
    );
    for (const anchor of anchors) {
      if (
        path === "api/reference/core/FunctionSpec.mdx" &&
        (anchor[1] === "builder" || anchor[1] === "builder-middleware")
      )
        continue;
      expect(anchor[1]).toStartWith("api-");
    }
    for (const match of Str.matchAll(/\]\(([^)\s]+)\)/g)(content)) {
      const href = match[1];
      if (/^(?:https?:|mailto:)/.test(href)) continue;
      const [file, anchor] = Str.split("#")(href);
      if (file !== "") expect(file).toStartWith("/api/reference/");
      const target = file === "" ? path : `${Str.slice(1)(file)}.mdx`;
      expect(pages.has(target), `${path}: ${href}`).toBe(true);
      if (anchor !== undefined) {
        expect(pages.get(target), `${path}: ${href}`).toContain(
          target === "api/reference/core/FunctionSpec.mdx" &&
            anchor === "functionspec-middleware"
            ? "### functionSpec.middleware()\n"
            : `<span id="${anchor}"></span>`,
        );
      }
    }
  }
});

test("navigation covers every generated module and records exact source provenance", () => {
  const navigation = Option.getOrUndefined(
    Array.findFirst(
      docsConfig.navigation.tabs,
      (tab) => tab.tab === "API Reference",
    ),
  );
  expect(navigation).toBeDefined();
  const paths: string[] = [];
  type Page = string | { pages: readonly Page[] };
  const visit = (items: readonly Page[]): void => {
    for (const item of items) {
      if (typeof item === "string") paths.push(`${item}.mdx`);
      else visit(item.pages);
    }
  };
  if (navigation !== undefined) visit(navigation.groups);
  expect(Array.map(docsConfig.navigation.tabs, (tab) => tab.tab)).toEqual([
    "Guides",
    "API Reference",
  ]);
  expect(paths).not.toContain("getting-started/introduction.mdx");
  for (const path of pages.keys()) {
    if (path === "api/reference/index.mdx") continue;
    expect(paths).toContain(path);
  }
  const revision = Str.trim(
    Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      cwd: root,
    }).stdout.toString(),
  );
  expect(pages.get("api/reference/source.mdx")).toContain(revision);
  expect(pages.get("api/reference/source.mdx")).toContain("@confect/core");
});

test(
  "groups types and values by source categories, including new domain categories",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fixture = `${directory}/categories`;
        yield* fs.makeDirectory(fixture);
        yield* fs.writeFileString(
          `${fixture}/tsconfig.json`,
          '{"compilerOptions":{"strict":true,"types":[]},"include":["categories.ts"]}',
        );
        yield* fs.writeFileString(
          `${fixture}/upstream.ts`,
          `
/** The original contract description. */
export interface External { readonly id: string }
/** A more specific original category.
 * @category Specific
 */
export interface Specific { readonly value: number }
`,
        );
        yield* fs.writeFileString(
          `${fixture}/categories.ts`,
          `
/** Public contracts from another module.
 * @category Models
 */
export type { External, Specific } from "./upstream";
/** A named value.
 * @category Models
 */
export interface Widget { readonly name: string }
/** The default named value.
 * @category models
 */
export const Widget: Widget = { name: "default" };
/** Create a named value.
 * @category Constructors
 */
export const make = (name: string): Widget => ({ name });
/** Select a route.
 * @category Routing
 */
export const route = (value: Widget): string => value.name;
/** The protocol name.
 * @category HTTP
 */
export const protocol = "HTTP";
/** Base contract.
 * @category Models
 */
export class Base {
  /** Existing operation.
   * @category Combinators
   */
  existing(): void {}
}
/** Builder contract.
 * @category Models
 */
export class Builder extends Base {
  /** Stored label.
   * @category Models
   */
  readonly label = "builder";
  /** Attach a new step.
   * @category Combinators
   * @returns The same builder.
   */
  attach(): this { return this; }
}
/** Implementation detail.
 * @internal
 * @category Models
 */
export const hidden = 1;
`,
        );
        const options = {
          ...presentationOptions,
          name: "Categories",
          entryPoints: [`${fixture}/categories.ts`],
          tsconfig: `${fixture}/tsconfig.json`,
          alwaysCreateEntryPointModule: true,
          plugin: ["typedoc-plugin-markdown"],
          theme: "mintlify",
          router: "mintlify",
          excludeInternal: true,
          useCodeBlocks: true,
          useHTMLAnchors: true,
          fileExtension: ".mdx",
          readme: "none",
          out: `${fixture}/output`,
        };
        const app = yield* Effect.promise(() =>
          Application.bootstrapWithPlugins(options),
        );
        app.renderer.defineTheme("mintlify", MintlifyTheme);
        app.renderer.defineRouter("mintlify", MintlifyRouter);
        app.converter.on(
          Converter.EVENT_CREATE_DECLARATION,
          preserveReexportCategories,
        );
        app.converter.on(
          Converter.EVENT_RESOLVE_END,
          ({ project }) => normalizeCategories(project),
          -50,
        );
        const project = yield* Effect.promise(() => app.convert());
        expect(project).toBeDefined();
        if (project === undefined) return;
        yield* Effect.promise(() => app.generateOutputs(project));
        const page = yield* fs.readFileString(
          `${fixture}/output/categories/index.mdx`,
        );
        expect(page).toContain("## Models");
        expect(page).toContain("## Constructors");
        expect(page).toContain("## Routing");
        expect(page).toContain("## Combinators");
        expect(page).toContain("### Builder.attach()");
        expect(page).toContain("### Base.existing()");
        expect(page).not.toContain("### Builder.existing()");
        expect(page).not.toContain("### Builder.label");
        expect(page).toContain("**label**");
        expect(page).toContain("The same builder.");
        expect(
          Array.fromIterable(Str.matchAll(/Attach a new step\./g)(page)),
        ).toHaveLength(1);
        expect(page).toContain(
          '### Widget (type)\n\n<Badge color="gray" size="sm">type</Badge>',
        );
        expect(page).toContain(
          '### Widget (value)\n\n<Badge color="gray" size="sm">value</Badge>',
        );
        expect(page).toMatch(/## Models[\s\S]*### External\n/);
        expect(page).toMatch(/## Specific[\s\S]*### Specific\n/);
        expect(page).toContain("The original contract description.");
        expect(page).toContain("readonly id: string");
        expect(page).toContain(
          '### make()\n\n<Badge color="gray" size="sm">function</Badge>',
        );
        expect(page).toContain("## HTTP");
        expect(page).not.toContain("## Http");
        expect(
          Array.fromIterable(Str.matchAll(/^## Models$/gm)(page)),
        ).toHaveLength(1);
        expect(page).not.toContain("## models");
        expect(page).toMatch(/## Constructors[\s\S]*## Models/);
        expect(page).not.toContain("hidden");
        expect(page).not.toMatch(/^## (Interfaces|Variables|Functions)$/m);
      }),
    ),
  30000,
);
