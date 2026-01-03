const RESERVED_KEYWORDS = new Set([
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

const jsIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const matchesJsIdentifierPattern = (identifier: string) =>
  jsIdentifierRegex.test(identifier);

const isReservedKeyword = (identifier: string) =>
  RESERVED_KEYWORDS.has(identifier);

export const validateJsIdentifier = (identifier: string) => {
  if (!matchesJsIdentifierPattern(identifier)) {
    throw new Error(
      `Expected a valid JavaScript identifier, but received: "${identifier}". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.`,
    );
  }

  if (isReservedKeyword(identifier)) {
    throw new Error(
      `Expected a valid JavaScript identifier, but received: "${identifier}". "${identifier}" is a reserved keyword.`,
    );
  }
};
