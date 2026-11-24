# Tags, Modules, And Links

## Declaration Shape

Use a multiline JSDoc block for a public declaration:

````ts
/**
 * Short description as one paragraph.
 *
 * **When to use**
 *
 * Optional practical usage guidance.
 *
 * **Details**
 *
 * Optional details for complex behavior.
 *
 * **Gotchas**
 *
 * Optional concrete caveats.
 *
 * **Example** (Parsing JSON)
 *
 * ```ts
 * operation();
 * ```
 *
 * @category Constructors
 */
````

Write practical English about the public concept, not its implementation. Start
functions and methods with a present-tense action such as `Creates`, `Returns`,
or `Converts`; match nearby noun families for values, such as `Schema for`,
`Layer that`, or `Service that`.

Optional non-empty sections appear once in this order: `**When to use**`,
`**Details**`, `**Gotchas**`. Separate descriptions, sections, examples, and
tags with exactly one blank line. Use prose for one fact and bullets for
parallel facts. Do not add other headings.

`**When to use**` states a positive use case distinct from the description and
begins with `Use to`, `Use when`, `Use as`, or `Use with`. Put sibling
comparisons in `@see`. Reserve `**Gotchas**` for concrete preconditions, edge
cases, surprising behavior, and important failure modes.

## Tags

Use this order for shared declaration metadata, subject to Oxfmt:

1. `@deprecated`
2. `@default`
3. `@see`
4. `@stability`
5. `@category`
6. `@since`

- Roots reject `@default`; category requirements live in
  [categories.md](categories.md).
- Namespaces and their declarations permit `@category` and reject `@default`.
- Member JSDoc is optional; when present it permits non-empty `@default` and
  follows the prose contract. Retain `@category` on public members used for
  reference navigation.
- Any declaration permits one non-empty `@deprecated` and repeated non-empty
  `@see` tags.
- Use stable-semver `@since` only for a verified Confect release. Add stability
  metadata only for an established Confect guarantee, not because the API
  exposes a dependency. Preserve existing `@public` and `@experimental` tags.
  In Confect, `@experimental` means breaking changes may occur in patch releases.
- Retain useful `@param` and `@returns` contracts. Use `@throws` only for an
  actual throw; distinguish typed Effect failures from defects. For services,
  state which function contexts supply them.

Use canonical `**Example**` sections rather than `@example` tags or loose code
fences.

## Modules And Links

When present, the first top-level JSDoc is the module block unless TypeScript
attaches it to a non-import first declaration. An `@internal` module is omitted.
Module prose does not use the declaration template. Its tags are optional
non-empty `@deprecated`, repeated non-empty `@see`, then stability and release
metadata only when verified as above. Its examples and links follow the
declaration contracts.

Inline `{@link Symbol}` targets must resolve to TypeScript symbols; use normal
Markdown links for URLs. Prefer code formatting when navigation does not help a
reader understand or choose the API.

Use `@see` only for a verified related public API: a close alternative,
inverse, complement, level variant, or closely returned, consumed, or
configured type. Explain non-obvious relationships. Exclude implementation
dependencies, broad concepts, example-only helpers, private APIs, and merely
lexical matches.
