import { Array, Effect, Record } from "effect";

//#region src/internal/utils.ts
const RESERVED_KEYWORDS = new Set([
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
	"null",
	"true",
	"false",
	"undefined"
]);
const jsIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const matchesJsIdentifierPattern = (identifier) => jsIdentifierRegex.test(identifier);
const isReservedKeyword = (identifier) => RESERVED_KEYWORDS.has(identifier);
const validateJsIdentifier = (identifier) => {
	if (!matchesJsIdentifierPattern(identifier)) throw new Error(`Expected a valid JavaScript identifier, but received: "${identifier}". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.`);
	if (isReservedKeyword(identifier)) throw new Error(`Expected a valid JavaScript identifier, but received: "${identifier}". "${identifier}" is a reserved keyword.`);
};
const mapLeaves = (obj, leafRefinement, f) => {
	const result = {};
	for (const key in obj) {
		const value = obj[key];
		if (leafRefinement(value)) result[key] = f(value);
		else result[key] = mapLeaves(value, leafRefinement, f);
	}
	return result;
};
const collectBranchLeaves = (obj, leafRefinement, path = []) => {
	const leaves = Record.filter(obj, leafRefinement);
	const currentBranch = Record.keys(leaves).length > 0 ? [{
		path,
		values: leaves
	}] : [];
	const nestedBranches = Array.flatMap(Record.keys(obj), (key) => {
		const value = obj[key];
		if (!leafRefinement(value) && typeof value === "object") return collectBranchLeaves(value, leafRefinement, [...path, key]);
		return [];
	});
	return [...currentBranch, ...nestedBranches];
};
const forEachBranchLeaves = (obj, leafRefinement, f) => {
	const branchLeaves = collectBranchLeaves(obj, leafRefinement);
	return Effect.forEach(branchLeaves, f, { discard: true });
};
const setNestedProperty = (obj, path, value) => {
	if (path.length === 0) return obj;
	if (path.length === 1) {
		const key$1 = path[0];
		return {
			...obj,
			[key$1]: value
		};
	}
	const [head, ...tail] = path;
	const key = head;
	return {
		...obj,
		[key]: setNestedProperty(obj[key] ?? {}, tail, value)
	};
};

//#endregion
export { forEachBranchLeaves, mapLeaves, setNestedProperty, validateJsIdentifier };
//# sourceMappingURL=utils.js.map