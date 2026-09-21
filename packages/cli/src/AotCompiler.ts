import type * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type * as Table from "@confect/core/Table";
import * as Context from "effect/Context";
import * as Result from "effect/Result";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaAOTCompiler from "effect/unstable/schema/SchemaAOTCompiler";
import * as Flag from "effect/unstable/cli/Flag";
import { SchemaCompilationError } from "./CodegenError";

export const Enabled = Context.Reference<boolean>("@confect/cli/SchemaAot", {
  defaultValue: () => false,
});

export const flag = Flag.Boolean("schema-aot").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Generate experimental ahead-of-time schema parsers"),
);

export interface Artifact {
  readonly path: string;
  readonly contents: string;
}

const decoder = (
  path: string,
  asts: ReadonlyArray<SchemaAST.AST>,
): ReadonlyArray<Artifact> => [
  {
    path: `${path}.js`,
    contents: SchemaAOTCompiler.compile(
      asts.map((ast) => ({ ast, operations: ["decode"] })),
    ),
  },
  {
    path: `${path}.d.ts`,
    contents:
      'import type { AST } from "effect/SchemaAST";\nexport declare function install(asts: ReadonlyArray<AST>): void;\n',
  },
];

export const table = (
  modulePath: string,
  boundTable: Table.AnyWithProps,
): Result.Result<ReadonlyArray<Artifact>, SchemaCompilationError> =>
  Result.try({
    try: () => [
      ...decoder(`tables/${boundTable.tableName}/fields`, [
        SchemaAST.flip(boundTable.Fields.ast),
      ]),
      ...decoder(`tables/${boundTable.tableName}/doc`, [boundTable.Doc.ast]),
    ],
    catch: (cause) => new SchemaCompilationError({ modulePath, cause }),
  });

export const group = (
  modulePath: string,
  stem: string,
  groupSpec: GroupSpec.AnyWithProps,
): Result.Result<ReadonlyArray<Artifact>, SchemaCompilationError> =>
  Result.try({
    try: () => {
      const artifacts: Array<Artifact> = [];
      const imports = [
        'import type { ConfectFunctionRegistryItem } from "@confect/server/FunctionRegistryItem";',
        'import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";',
        'import * as SchemaAST from "effect/SchemaAST";',
      ];
      const cases: Array<string> = [];
      for (const name of Object.keys(groupSpec.functions).sort()) {
        const fn = groupSpec.functions[name];
        const provenance = fn.functionProvenance;
        if (provenance._tag !== "Confect") continue;
        const errors = [
          ...(provenance.error === undefined ? [] : [provenance.error]),
          ...MiddlewareSpec.errorSchemas([
            ...groupSpec.middlewareAttachments.map(({ spec }) => spec),
            ...fn.middlewareAttachments.map(({ spec }) => spec),
          ]),
        ];
        const asts = [
          provenance.args.ast,
          SchemaAST.flip(provenance.returns.ast),
          ...errors.map((schema) => SchemaAST.flip(schema.ast)),
        ];
        const alias = `install${cases.length}`;
        const basename = stem.slice(stem.lastIndexOf("/") + 1);
        imports.push(
          `import { install as ${alias} } from ${JSON.stringify(`./${basename}/${name}.js`)};`,
        );
        artifacts.push(...decoder(`groups/${stem}/${name}`, asts));
        cases.push(
          `case ${JSON.stringify(name)}: if (errors.length !== ${errors.length}) return; ${alias}([item.args.ast, SchemaAST.flip(item.returns.ast), ...errors.map(schema => SchemaAST.flip(schema.ast))]); return;`,
        );
      }
      artifacts.push({
        path: `groups/${stem}.ts`,
        contents:
          cases.length === 0
            ? "export const prepare = (_item: unknown): void => {};\n"
            : `${imports.join("\n")}\nexport const prepare = (item: ConfectFunctionRegistryItem): void => {\nconst errors = [...(item.error === undefined ? [] : [item.error]), ...MiddlewareSpec.errorSchemas(item.middlewareAttachments.map(({ spec }) => spec))];\nswitch (item.name) {\n${cases.join("\n")}\n}\n};\n`,
      });
      return artifacts;
    },
    catch: (cause) => new SchemaCompilationError({ modulePath, cause }),
  });
