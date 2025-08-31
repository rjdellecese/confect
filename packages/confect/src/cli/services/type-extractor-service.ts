import ts from "typescript";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { ParseResult } from "../shared-types";
import { CliOptions } from "./cli-option-tag";

/**
 * Confect Type Extractor Service for analyzing TypeScript files and extracting Confect function definitions.
 *
 * This service scans a Convex directory recursively to find and parse Confect functions
 * (confectQuery, confectMutation, confectAction) and their associated error schemas.
 *
 * @since 1.0.0
 * @example
 * ```typescript
 * const extractor = yield* ConfectTypeExtractorService
 * const result = yield* extractor.extract('./convex')
 * console.log(`Found ${result.functions.length} Confect functions`)
 * ```
 */
export class ConfectTypeExtractorService extends Effect.Service<ConfectTypeExtractorService>()(
  "ConfectTypeExtractorService",
  {
    effect: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;

      return {
        /**
         * Extracts Confect function definitions from a Convex directory.
         *
         * @param convexDir - The path to the Convex directory to scan
         * @returns Effect that resolves to ParseResult containing found functions and type definitions
         * @since 1.0.0
         */
        extract: Effect.gen(function* () {
          const { convexDir } = yield* CliOptions;
          yield* Console.log("🔍 Extracting types from Confect functions...");

          const result: ParseResult = {
            functions: [],
            typeDefinitions: new Map(),
          };
          const entries = yield* fileSystem.readDirectory(convexDir);

          for (const entryName of entries) {
            const fullPath = pathService.join(convexDir, entryName);
            const stat = yield* fileSystem.stat(fullPath);

            if (stat.type === "Directory") {
              if (entryName === "_generated" || entryName === "node_modules") {
                continue;
              }
              // TODO: Implement recursive directory scanning
              // yield* scanDirectoryEffect(fullPath, convexDir, result)
            } else if (stat.type === "File" && entryName.endsWith(".ts")) {
              yield* parseFileEffect(fullPath, result);
            }
          }

          yield* Console.log(
            "🔍 Found " + result.functions.length + " Confect functions",
          );
          yield* Console.log(
            "🔍 Found " + result.typeDefinitions.size + " type definitions",
          );
          yield* findUsedTypeDefinitionsEffect;
          return result;
        }),
      };
    }),
  },
) {}

/**
 * Recursively scans a directory for TypeScript files (placeholder implementation).
 *
 * @param dir - Directory path to scan
 * @param convexDir - Root Convex directory path
 * @param result - ParseResult object to populate with findings
 * @returns Effect that completes when directory scanning is done
 * @since 1.0.0
 * @internal
 */
// const scanDirectoryEffect = (
//   _dir: string,
//   _convexDir: string,
//   _result: ParseResult,
// ) =>
//   Effect.gen(function* () {
//     // TODO: Implement recursive directory scanning
//   });

/**
 * Parses a TypeScript file to extract Confect function definitions.
 *
 * Reads the file content, creates a TypeScript AST, and traverses it to find
 * exported variables that use confectQuery, confectMutation, or confectAction.
 *
 * @param filePath - Path to the TypeScript file to parse
 * @param result - ParseResult object to populate with found functions
 * @returns Effect that completes when file parsing is done
 * @since 1.0.0
 * @internal
 */
const parseFileEffect = (filePath: string, result: ParseResult) =>
  Effect.gen(function* () {
    const { convexDir } = yield* CliOptions;
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const content = yield* fileSystem.readFileString(filePath);
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    const relativePath = pathService.relative(convexDir, filePath);
    visitNode(sourceFile, filePath, convexDir, result, relativePath);
  });

/**
 * Scans for type definitions used by Confect functions (placeholder implementation).
 *
 * This function would typically scan TypeScript files to find type definitions
 * referenced by error schemas in Confect functions.
 *
 * @returns Effect that completes when type definition scanning is done
 * @since 1.0.0
 * @internal
 */
const findUsedTypeDefinitionsEffect = Effect.gen(function* () {
  const { convexDir } = yield* CliOptions;
  yield* Effect.sync(() => {
    console.log(`Scanning for type definitions in ${convexDir}`);
  });
});

/**
 * Recursively visits TypeScript AST nodes to find exported Confect functions.
 *
 * Traverses the AST looking for exported variable statements that use
 * confectQuery, confectMutation, or confectAction function calls.
 *
 * @param node - TypeScript AST node to visit
 * @param filePath - Path to the source file being processed
 * @param convexDir - Root Convex directory path
 * @param result - ParseResult object to populate with found functions
 * @param relativePath - Relative path from convexDir to the source file
 * @since 1.0.0
 * @internal
 */
const visitNode = (
  node: ts.Node,
  filePath: string,
  convexDir: string,
  result: ParseResult,
  relativePath: string,
) => {
  /**
   * Checks if a variable statement has an export modifier.
   * @param node - Variable statement to check
   * @returns True if the statement is exported
   */
  const hasExportModifier = (node: ts.VariableStatement): boolean => {
    return (
      node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ??
      false
    );
  };

  if (ts.isVariableStatement(node) && hasExportModifier(node)) {
    processVariableStatement(node, result, relativePath);
  }

  let children: ts.Node[] = [];

  if (ts.isSourceFile(node)) {
    children = Array.from(node.statements);
  } else {
    ts.forEachChild(node, (child) => children.push(child));
  }

  for (const child of children) {
    visitNode(child, filePath, convexDir, result, relativePath);
  }
};

/**
 * Processes an exported variable statement to extract Confect function information.
 *
 * Examines variable declarations to identify Confect functions (confectQuery, confectMutation, confectAction)
 * and extracts their metadata including error schemas and return types.
 *
 * @param node - TypeScript variable statement node to process
 * @param result - ParseResult object to populate with found function data
 * @param relativePath - Relative path from convexDir to the source file
 * @since 1.0.0
 * @internal
 */
const processVariableStatement = (
  node: ts.VariableStatement,
  result: ParseResult,
  relativePath: string,
) => {
  for (const declaration of node.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.initializer) {
      const functionName = declaration.name.text;
      const confectInfo = extractConfectFunction(declaration.initializer);

      if (confectInfo) {
        const errorTypes = extractErrorTypes(confectInfo.errorSchema);
        const { moduleName, fullKey } = generateModuleInfo(
          functionName,
          relativePath,
        );

        result.functions.push({
          name: functionName,
          type: confectInfo.type,
          errorSchema: confectInfo.errorSchema,
          returnsSchema: confectInfo.returnsSchema,
          filePath: relativePath,
          moduleName,
          fullKey,
          errorTypes,
        });
      }
    }
  }
};

/**
 * Generates module information for a Confect function.
 *
 * Creates a module name and full key identifier based on the file path
 * and function name for use in type generation.
 *
 * @param functionName - Name of the Confect function
 * @param relativePath - Relative path from convexDir to the source file
 * @returns Object containing moduleName and fullKey
 * @since 1.0.0
 * @internal
 */
const generateModuleInfo = (functionName: string, relativePath: string) => {
  const modulePathWithoutExt = relativePath
    .replace(/\.ts$/, "")
    .replace(/\\/g, "/");
  const moduleName = modulePathWithoutExt;
  const fullKey = `${moduleName}.${functionName}`;

  return { moduleName, fullKey };
};

/**
 * Extracts metadata from a Confect function call expression.
 *
 * Analyzes a TypeScript call expression to determine if it's a Confect function
 * (confectQuery, confectMutation, confectAction) and extracts its error schema
 * and return type information.
 *
 * @param node - TypeScript expression node to analyze
 * @returns Object containing function type and schema information, or null if not a Confect function
 * @since 1.0.0
 * @internal
 */
const extractConfectFunction = (
  node: ts.Expression,
): {
  type: "query" | "mutation" | "action";
  errorSchema: string | null;
  returnsSchema: string | null;
} | null => {
  if (!ts.isCallExpression(node)) return null;

  const expression = node.expression;
  if (!ts.isIdentifier(expression)) return null;

  let type: "query" | "mutation" | "action" | null = null;
  if (expression.text === "confectQuery") type = "query";
  else if (expression.text === "confectMutation") type = "mutation";
  else if (expression.text === "confectAction") type = "action";

  if (!type) return null;

  const configArg = node.arguments[0]!;
  if (!ts.isObjectLiteralExpression(configArg)) return null;

  const errorsProperty = configArg.properties.find(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "errors",
  ) as ts.PropertyAssignment | undefined;

  const returnsProperty = configArg.properties.find(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "returns",
  ) as ts.PropertyAssignment | undefined;

  let errorSchema: string | null = null;
  if (errorsProperty) {
    errorSchema = extractErrorSchema(errorsProperty.initializer);
  }

  let returnsSchema: string | null = null;
  if (returnsProperty) {
    returnsSchema = extractErrorSchema(returnsProperty.initializer);
  }

  return { type, errorSchema, returnsSchema };
};

/**
 * Extracts error schema as a string from a TypeScript expression node.
 *
 * @param node - TypeScript expression node containing the error schema
 * @returns String representation of the error schema
 * @since 1.0.0
 * @internal
 */
const extractErrorSchema = (node: ts.Expression): string => {
  const sourceFile = node.getSourceFile();
  return node.getText(sourceFile);
};

/**
 * Extracts individual error type names from a schema string.
 *
 * Parses schema strings to identify error types, handling both single types
 * and union types (Schema.Union(...)).
 *
 * @param schema - Schema string to parse for error types
 * @returns Set of error type names found in the schema
 * @since 1.0.0
 * @internal
 */
const extractErrorTypes = (schema: string | null): Set<string> => {
  const types = new Set<string>();

  if (!schema) return types;

  const unionMatch = schema.match(/Schema\.Union\((.*)\)/);
  if (unionMatch) {
    const unionContent = unionMatch[1]!;
    const parts = unionContent.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      const type = extractSingleType(trimmed);
      if (type) types.add(type);
    }
  } else {
    const type = extractSingleType(schema);
    if (type) types.add(type);
  }

  return types;
};

/**
 * Extracts a single custom error type name from a schema expression.
 *
 * Filters out built-in schema types (Number, String, Boolean) and extracts
 * custom error type names that start with a capital letter.
 *
 * @param expression - Schema expression string to parse
 * @returns Error type name if found, null if it's a built-in type or invalid
 * @since 1.0.0
 * @internal
 */
const extractSingleType = (expression: string): string | null => {
  const trimmed = expression.trim();

  if (
    trimmed.includes("Schema.Number") ||
    trimmed.includes("Schema.String") ||
    trimmed.includes("Schema.Boolean")
  ) {
    return null;
  }

  const match = trimmed.match(/^([A-Z][a-zA-Z0-9_]*)/);
  return match ? match[1]! : null;
};
