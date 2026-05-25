import { Array, Effect, Option } from "effect";
import { CodeBlockWriter } from "./CodeBlockWriter";
import {
  collectImportBindings,
  type SpecAssemblyNode,
} from "./SpecAssemblyNode";

export const functions = ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  functionNames: string[];
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    if (useNode) {
      yield* cbw.writeLine(`"use node";`);
      yield* cbw.blankLine();
    }

    yield* cbw.writeLine(
      `import registeredFunctions from "${registeredFunctionsImportPath}";`,
    );
    yield* cbw.newLine();
    yield* Effect.forEach(functionNames, (functionName) =>
      cbw.writeLine(
        `export const ${functionName} = registeredFunctions.${functionName};`,
      ),
    );

    return yield* cbw.toString();
  });

export const schema = ({ schemaImportPath }: { schemaImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import schemaDefinition from "${schemaImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(
      `export default schemaDefinition.convexSchemaDefinition;`,
    );

    return yield* cbw.toString();
  });

export const http = ({ httpImportPath }: { httpImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import http from "${httpImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default http;`);

    return yield* cbw.toString();
  });

export const crons = ({ cronsImportPath }: { cronsImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import crons from "${cronsImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default crons.convexCronJobs;`);

    return yield* cbw.toString();
  });

export const authConfig = ({ authImportPath }: { authImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import auth from "${authImportPath}";`);
    yield* cbw.newLine();
    yield* cbw.writeLine(`export default auth;`);

    return yield* cbw.toString();
  });

export const refs = ({
  specImportPath,
  nodeSpecImportPath,
}: {
  specImportPath: string;
  nodeSpecImportPath: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Refs } from "@confect/core";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* Option.match(nodeSpecImportPath, {
      onNone: () => Effect.void,
      onSome: (nodeSpecImportPath_) =>
        cbw.writeLine(`import nodeSpec from "${nodeSpecImportPath_}";`),
    });
    yield* cbw.blankLine();
    yield* cbw.writeLine(
      Option.match(nodeSpecImportPath, {
        onSome: () => `export default Refs.make(spec, nodeSpec);`,
        onNone: () => `export default Refs.make(spec);`,
      }),
    );

    return yield* cbw.toString();
  });

export const api = ({
  schemaImportPath,
  specImportPath,
}: {
  schemaImportPath: string;
  specImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Api } from "@confect/server";`);
    yield* cbw.writeLine(`import schema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import spec from "${specImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Api.make(schema, spec);`);

    return yield* cbw.toString();
  });

export const nodeApi = ({
  schemaImportPath,
  nodeSpecImportPath,
}: {
  schemaImportPath: string;
  nodeSpecImportPath: string;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    yield* cbw.writeLine(`import { Api } from "@confect/server";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`import schema from "${schemaImportPath}";`);
    yield* cbw.writeLine(`import nodeSpec from "${nodeSpecImportPath}";`);
    yield* cbw.blankLine();
    yield* cbw.writeLine(`export default Api.make(schema, nodeSpec);`);

    return yield* cbw.toString();
  });

export const registeredFunctionsForGroup = ({
  apiImportPath,
  groupPathDot,
  implImportPath,
  layerExportName,
  useNode = false,
}: {
  apiImportPath: string;
  groupPathDot: string;
  implImportPath: string;
  layerExportName: string;
  useNode?: boolean;
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    if (useNode) {
      yield* cbw.writeLine(
        `import { RegisteredFunctions } from "@confect/server";`,
      );
      yield* cbw.writeLine(
        `import { RegisteredNodeFunction } from "@confect/server/node";`,
      );
    } else {
      yield* cbw.writeLine(
        `import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";`,
      );
    }

    yield* cbw.writeLine(`import api from "${apiImportPath}";`);
    yield* cbw.writeLine(`import ${layerExportName} from "${implImportPath}";`);
    yield* cbw.blankLine();
    const quotedGroupPath = `"${groupPathDot.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    yield* cbw.writeLine(
      useNode
        ? `export default RegisteredFunctions.buildForGroup(api, ${quotedGroupPath}, ${layerExportName}, RegisteredNodeFunction.make);`
        : `export default RegisteredFunctions.buildForGroup(api, ${quotedGroupPath}, ${layerExportName}, RegisteredConvexFunction.make);`,
    );

    return yield* cbw.toString();
  });

export const services = ({ schemaImportPath }: { schemaImportPath: string }) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    // Imports
    yield* cbw.writeLine("import {");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ActionCtx as ActionCtx_,");
        yield* cbw.writeLine("ActionRunner as ActionRunner_,");
        yield* cbw.writeLine("Auth as Auth_,");
        yield* cbw.writeLine("type DataModel,");
        yield* cbw.writeLine("DatabaseReader as DatabaseReader_,");
        yield* cbw.writeLine("DatabaseWriter as DatabaseWriter_,");
        yield* cbw.writeLine("MutationCtx as MutationCtx_,");
        yield* cbw.writeLine("MutationRunner as MutationRunner_,");
        yield* cbw.writeLine("QueryCtx as QueryCtx_,");
        yield* cbw.writeLine("QueryRunner as QueryRunner_,");
        yield* cbw.writeLine("Scheduler as Scheduler_,");
        yield* cbw.writeLine("StorageActionWriter as StorageActionWriter_,");
        yield* cbw.writeLine("StorageReader as StorageReader_,");
        yield* cbw.writeLine("StorageWriter as StorageWriter_,");
        yield* cbw.writeLine("VectorSearch as VectorSearch_,");
      }),
    );
    yield* cbw.writeLine(`} from "@confect/server";`);
    yield* cbw.writeLine(
      `import type schemaDefinition from "${schemaImportPath}";`,
    );
    yield* cbw.blankLine();

    // Auth
    yield* cbw.writeLine("export const Auth = Auth_.Auth;");
    yield* cbw.writeLine("export type Auth = typeof Auth.Identifier;");
    yield* cbw.blankLine();

    // Scheduler
    yield* cbw.writeLine("export const Scheduler = Scheduler_.Scheduler;");
    yield* cbw.writeLine(
      "export type Scheduler = typeof Scheduler.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageReader
    yield* cbw.writeLine(
      "export const StorageReader = StorageReader_.StorageReader;",
    );
    yield* cbw.writeLine(
      "export type StorageReader = typeof StorageReader.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageWriter
    yield* cbw.writeLine(
      "export const StorageWriter = StorageWriter_.StorageWriter;",
    );
    yield* cbw.writeLine(
      "export type StorageWriter = typeof StorageWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // StorageActionWriter
    yield* cbw.writeLine(
      "export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;",
    );
    yield* cbw.writeLine(
      "export type StorageActionWriter = typeof StorageActionWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // VectorSearch
    yield* cbw.writeLine("export const VectorSearch =");
    yield* cbw.indent(
      cbw.writeLine(
        "VectorSearch_.VectorSearch<DataModel.FromSchema<typeof schemaDefinition>>();",
      ),
    );
    yield* cbw.writeLine(
      "export type VectorSearch = typeof VectorSearch.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseReader
    yield* cbw.writeLine("export const DatabaseReader =");
    yield* cbw.indent(
      cbw.writeLine(
        "DatabaseReader_.DatabaseReader<typeof schemaDefinition>();",
      ),
    );
    yield* cbw.writeLine(
      "export type DatabaseReader = typeof DatabaseReader.Identifier;",
    );
    yield* cbw.blankLine();

    // DatabaseWriter
    yield* cbw.writeLine("export const DatabaseWriter =");
    yield* cbw.indent(
      cbw.writeLine(
        "DatabaseWriter_.DatabaseWriter<typeof schemaDefinition>();",
      ),
    );
    yield* cbw.writeLine(
      "export type DatabaseWriter = typeof DatabaseWriter.Identifier;",
    );
    yield* cbw.blankLine();

    // QueryRunner
    yield* cbw.writeLine(
      "export const QueryRunner = QueryRunner_.QueryRunner;",
    );
    yield* cbw.writeLine(
      "export type QueryRunner = typeof QueryRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // MutationRunner
    yield* cbw.writeLine(
      "export const MutationRunner = MutationRunner_.MutationRunner;",
    );
    yield* cbw.writeLine(
      "export type MutationRunner = typeof MutationRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // ActionRunner
    yield* cbw.writeLine(
      "export const ActionRunner = ActionRunner_.ActionRunner;",
    );
    yield* cbw.writeLine(
      "export type ActionRunner = typeof ActionRunner.Identifier;",
    );
    yield* cbw.blankLine();

    // QueryCtx
    yield* cbw.writeLine("export const QueryCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("QueryCtx_.QueryCtx<");
        yield* cbw.indent(
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine("export type QueryCtx = typeof QueryCtx.Identifier;");
    yield* cbw.blankLine();

    // MutationCtx
    yield* cbw.writeLine("export const MutationCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("MutationCtx_.MutationCtx<");
        yield* cbw.indent(
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type MutationCtx = typeof MutationCtx.Identifier;",
    );
    yield* cbw.blankLine();

    // ActionCtx
    yield* cbw.writeLine("export const ActionCtx =");
    yield* cbw.indent(
      Effect.gen(function* () {
        yield* cbw.writeLine("ActionCtx_.ActionCtx<");
        yield* cbw.indent(
          cbw.writeLine(
            "DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>",
          ),
        );
        yield* cbw.writeLine(">();");
      }),
    );
    yield* cbw.writeLine(
      "export type ActionCtx = typeof ActionCtx.Identifier;",
    );

    return yield* cbw.toString();
  });

const writeChildAddGroupAt = (
  cbw: CodeBlockWriter,
  child: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(".addGroupAt(");
    yield* cbw.quote(child.segment);
    yield* cbw.write(", ");
    yield* writeGroupAssembly(cbw, child, groupFactory);
    yield* cbw.write(")");
  });

const writeGroupFactoryCall = (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(groupFactory);
    yield* cbw.write("(");
    yield* cbw.quote(node.segment);
    yield* cbw.write(")");

    yield* Effect.forEach(node.children, (child) =>
      writeChildAddGroupAt(cbw, child, groupFactory),
    );
  });

const writeGroupAssembly: (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
) => Effect.Effect<void> = (cbw, node, groupFactory) =>
  node.children.length === 0
    ? Option.match(node.importBinding, {
        onNone: () => writeGroupFactoryCall(cbw, node, groupFactory),
        onSome: (binding) => cbw.write(binding.exportName),
      })
    : writeGroupFactoryCall(cbw, node, groupFactory);

const writeRootAddAt = (
  cbw: CodeBlockWriter,
  node: SpecAssemblyNode,
  groupFactory: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* cbw.write(".addAt(");
    yield* cbw.quote(node.segment);
    yield* cbw.write(", ");

    yield* writeGroupAssembly(cbw, node, groupFactory);

    yield* cbw.write(")");
  });

export const assembledSpec = ({
  nodes,
  runtime,
}: {
  nodes: ReadonlyArray<SpecAssemblyNode>;
  runtime: "Convex" | "Node";
}) =>
  Effect.gen(function* () {
    const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

    const needsGroupSpec = Array.some(
      nodes,
      (node) => node.children.length > 0,
    );
    yield* cbw.writeLine(
      needsGroupSpec
        ? `import { GroupSpec, Spec } from "@confect/core";`
        : `import { Spec } from "@confect/core";`,
    );

    yield* Effect.forEach(collectImportBindings(nodes), (binding) =>
      cbw.writeLine(
        `import ${binding.exportName} from "${binding.importPath}";`,
      ),
    );

    yield* cbw.blankLine();

    const specFactory =
      runtime === "Convex" ? "Spec.make()" : "Spec.makeNode()";
    const groupFactory =
      runtime === "Convex" ? "GroupSpec.makeAt" : "GroupSpec.makeNodeAt";

    yield* cbw.write(`export default ${specFactory}`);
    yield* Effect.forEach(nodes, (node) =>
      writeRootAddAt(cbw, node, groupFactory),
    );
    yield* cbw.write(";");
    yield* cbw.newLine();

    return yield* cbw.toString();
  });
