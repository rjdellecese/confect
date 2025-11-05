const isValidJsIdentifier = (identifier: string) => {
  const jsIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

  return jsIdentifierRegex.test(identifier);
};

export const validateJsIdentifier = (identifier: string) => {
  if (!isValidJsIdentifier(identifier)) {
    throw new Error(
      `Expected a valid JavaScript identifier, but received: "${identifier}". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.`
    );
  }
};
