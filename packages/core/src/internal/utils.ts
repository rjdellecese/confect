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

const isReservedJsIdentifier = (identifier: string) =>
  RESERVED_JS_IDENTIFIERS.has(identifier);

const isReservedConvexFileName = (fileName: string) =>
  RESERVED_CONVEX_FILE_NAMES.has(fileName);

const matchesJsIdentifierPattern = (identifier: string) =>
  jsIdentifierRegex.test(identifier);

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
