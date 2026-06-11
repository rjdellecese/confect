const RESERVED_JS_IDENTIFIERS = new Set([
  // Reserved keywords
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  // Future reserved keywords
  "await",
  "enum",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  // Literal values that cannot be reassigned
  "null",
  "true",
  "false",
  // Global objects that shouldn't be shadowed
  "undefined",
]);

const RESERVED_CONVEX_FILE_NAMES = new Set(["schema", "http", "crons"]);

const jsIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// Stricter than `jsIdentifierRegex`: tables cannot start with `_` (Convex
// reserves leading underscores for system tables) or `$` (Convex's table
// naming grammar does not accept it). Letters/digits/underscore only,
// letter-leading.
const tableNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const isReservedJsIdentifier = (identifier: string) =>
  RESERVED_JS_IDENTIFIERS.has(identifier);

const isReservedConvexFileName = (fileName: string) =>
  RESERVED_CONVEX_FILE_NAMES.has(fileName);

const matchesJsIdentifierPattern = (identifier: string) =>
  jsIdentifierRegex.test(identifier);

const matchesTableNamePattern = (identifier: string) =>
  tableNameRegex.test(identifier);

export const validateConfectFunctionIdentifier = (identifier: string) => {
  if (!matchesJsIdentifierPattern(identifier)) {
    throw new Error(
      `Expected a valid Confect function identifier, but received: "${identifier}". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.`,
    );
  }

  if (isReservedJsIdentifier(identifier)) {
    throw new Error(
      `Expected a valid Confect function identifier, but received: "${identifier}". "${identifier}" is a reserved JavaScript identifier.`,
    );
  }

  if (isReservedConvexFileName(identifier)) {
    throw new Error(
      `Expected a valid Confect function identifier, but received: "${identifier}". "${identifier}" is a reserved Convex file name.`,
    );
  }
};

/**
 * Validate that `identifier` is suitable as a Convex table name (and, equivalently,
 * as a `confect/tables/<identifier>.ts` filename).
 *
 * Rules:
 * - Must match `/^[A-Za-z][A-Za-z0-9_]*$/` — letter-leading, alphanumeric plus
 *   underscore. No `$` (not a valid Convex table name character); no leading
 *   `_` (Convex reserves `_<name>` for its system tables).
 * - Must not be a reserved JavaScript identifier, so the name can also be used
 *   as a binding name in generated code without escaping.
 */
export const validateConfectTableIdentifier = (identifier: string) => {
  if (!matchesTableNamePattern(identifier)) {
    throw new Error(
      `Expected a valid Confect table identifier, but received: "${identifier}". Valid table identifiers must start with a letter and can only contain letters, numbers, and underscores. Leading underscores are reserved for Convex system tables.`,
    );
  }

  if (isReservedJsIdentifier(identifier)) {
    throw new Error(
      `Expected a valid Confect table identifier, but received: "${identifier}". "${identifier}" is a reserved JavaScript identifier.`,
    );
  }
};
