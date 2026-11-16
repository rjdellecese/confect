import { afterAll, beforeAll, expect, test } from "bun:test";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Str from "effect/String";
import * as Option from "effect/Option";
import docsConfig from "../apps/docs/docs.json";
import { Application } from "typedoc";
import {
  MintlifyRouter,
  MintlifyTheme,
  presentationOptions,
} from "./docsApiTheme";

const fs = Effect.runSync(
  FileSystem.FileSystem.pipe(Effect.provide(BunServices.layer)),
);
const { resolve, dirname } = Effect.runSync(
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

test("renders public functions, overloads, classes, types, and inferred service operations", () => {
  const functions = pages.get("api/reference/core/FunctionSpec.mdx");
  expect(functions).toContain("publicQuery");
  expect(functions).toMatch(/^#{3,4} Call Signature$/m);
  expect(functions).toContain("Declare a public query in the Convex runtime.");
  expect(pages.get("api/reference/core/PaginationError.mdx")).toContain(
    '<span id="invalidcursor"></span>',
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
    /Selecting a\s+table does not itself fetch documents; system tables are read-only\./,
  );
  expect(pages.get("api/reference/react/index.mdx")).toContain("useMutation");
  expect(pages.get("api/reference/react/PaginatedQueryResult.mdx")).toContain(
    '<span id="paginatedqueryresultproto"></span>',
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
  expect(stream).toContain('<span id="emptyinitialpageerror"></span>');
  expect(stream).toContain('<span id="invalidpagesizeerror"></span>');
  expect(stream).toContain('<span id="readbudgetexceedederror"></span>');
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
    for (const match of Str.matchAll(/\]\(([^)\s]+)\)/g)(content)) {
      const href = match[1];
      if (/^(?:https?:|mailto:)/.test(href)) continue;
      const [file, anchor] = Str.split("#")(href);
      const target =
        file === ""
          ? path
          : Str.replace(
              `${directory}/first/`,
              "",
            )(resolve(directory, "first", dirname(path), file));
      expect(pages.has(target), `${path}: ${href}`).toBe(true);
      if (anchor !== undefined) {
        expect(pages.get(target), `${path}: ${href}`).toContain(
          `<span id="${anchor}"></span>`,
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
          `${fixture}/categories.ts`,
          `
/** A named value.
 * @category Models
 */
export interface Widget { readonly name: string }
/** The default named value.
 * @category Models
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
          fileExtension: ".mdx",
          readme: "none",
          out: `${fixture}/output`,
        };
        const app = yield* Effect.promise(() =>
          Application.bootstrapWithPlugins(options),
        );
        app.renderer.defineTheme("mintlify", MintlifyTheme);
        app.renderer.defineRouter("mintlify", MintlifyRouter);
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
        expect(page).toContain("### Widget (interface)");
        expect(page).toContain("### Widget (variable)");
        expect(page).toMatch(/## Constructors[\s\S]*## Models/);
        expect(page).not.toContain("hidden");
        expect(page).not.toMatch(/^## (Interfaces|Variables|Functions)$/m);
      }),
    ),
  30000,
);
