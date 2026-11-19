import assert from "node:assert/strict";
import { $ } from "bun";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Obj from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

const sdkName = "@convex-dev/platform";
const sdkVersion = "0.1.11";
const sdk = `${sdkName}@${sdkVersion}`;
const revision = "4a3f005d9bcfc402c9619d07c2c3d03bfa59ee8f";
const documents = {
  management:
    "2ded7dd7ebcf5b68c324e11e685e32d02939cfa35889b122dcf360fa5461a320",
  deployment:
    "2f6ab217f52cdb21c4ce4d086f52c0a317a88028af3ad31c467c31b4106c6fe6",
};
const root = new URL("../", import.meta.url);
const manifest = await Bun.file(
  new URL("packages/platform/package.json", root),
).json();
assert.equal(
  manifest.dependencies[sdkName],
  sdkVersion,
  "Review and regenerate platform response schemas when changing the SDK pin",
);
const json = Schema.fromJsonString(Schema.Json);

function generate(api, document) {
  const components = new Map();
  const refName = (ref) => {
    const match = /^#\/components\/schemas\/([A-Za-z][A-Za-z0-9]*)$/.exec(ref);
    assert(
      match !== null && Obj.has(document.components.schemas, match[1]),
      ref,
    );
    return match[1];
  };

  function emit(node, name, operators = []) {
    if (Array.isArray(node.type)) {
      const base = Array.filter(node.type, (t) => t !== "null");
      assert(Array.contains(node.type, "null") && base.length === 1);
      return emit({ ...node, type: base[0] }, name, [
        "Schema.NullOr",
        ...operators,
      ]);
    }
    const code = expression(node, name);
    return operators.length === 0
      ? code
      : `${code}.pipe(${Array.join(operators, ", ")})`;
  }

  function expression(node, name) {
    const {
      description,
      title,
      example,
      format,
      $ref,
      oneOf,
      discriminator,
      allOf,
      type,
      enum: literals,
      minimum,
      items,
      properties,
      required,
      additionalProperties,
      propertyNames,
      ...other
    } = node;
    assert.deepEqual(Obj.keys(other), [], "Unsupported schema keyword");
    if ($ref !== undefined) {
      const ref = refName($ref);
      if (!components.has(ref)) {
        components.set(ref, emit(document.components.schemas[ref], ref));
      }
      return ref;
    }
    if (oneOf !== undefined) {
      if (discriminator !== undefined) {
        const { mapping, propertyName } = discriminator;
        assert.deepEqual(
          new Set(Obj.values(mapping)),
          new Set(Array.map(oneOf, (part) => part.$ref)),
        );
        for (const [tag, ref] of Obj.toEntries(mapping)) {
          const branch = document.components.schemas[refName(ref)];
          assert(branch.required.includes(propertyName));
          assert.deepEqual(
            branch.properties[propertyName].oneOf.map((part) => part.enum),
            [[tag]],
          );
        }
      }
      if (oneOf.length === 1) return emit(oneOf[0]);
      return `Schema.Union([${Array.join(
        Array.map(oneOf, (part) => emit(part)),
        ", ",
      )}], {mode: "oneOf"})`;
    }
    if (allOf !== undefined) {
      // Each intersection in these documents combines open objects with disjoint fields.
      const fields = {};
      const requiredFields = [];
      for (const part of allOf) {
        const object =
          part.$ref !== undefined
            ? document.components.schemas[refName(part.$ref)]
            : part;
        assert.equal(object.type, "object");
        assert.equal(object.additionalProperties, undefined);
        assert.equal(object.propertyNames, undefined);
        for (const [key, field] of Obj.toEntries(object.properties)) {
          assert(!Obj.has(fields, key));
          fields[key] = field;
        }
        requiredFields.push(...object.required);
      }
      return emit({
        type: "object",
        properties: fields,
        required: requiredFields,
      });
    }
    if (literals !== undefined) {
      assert.equal(type, "string");
      assert(literals.every((v) => typeof v === "string"));
      return literals.length === 1
        ? `Schema.Literal(${Result.getOrThrow(Schema.encodeResult(json)(literals[0]))})`
        : `Schema.Literals(${Result.getOrThrow(Schema.encodeResult(json)(literals))})`;
    }
    switch (type) {
      case "null":
        return "Schema.Null";
      case "boolean":
        return "Schema.Boolean";
      case "string":
        return "Schema.String";
      case "number":
        return "Schema.Finite";
      case "integer":
        return minimum === undefined
          ? "Integer"
          : `Integer.check(Schema.isGreaterThanOrEqualTo(${minimum}))`;
      case "array":
        return `Schema.Array(${emit(items)})`;
      case "object": {
        if (propertyNames !== undefined)
          assert.deepEqual(propertyNames, { type: "string" });
        if (properties === undefined) {
          return `Schema.Record(Schema.String, ${additionalProperties !== undefined ? emit(additionalProperties) : "Schema.Json"})`;
        }
        const fields = Array.join(
          Array.map(Obj.toEntries(properties), ([key, value]) => {
            if (
              api === "deployment" &&
              ((name === "DataSyncValue" && key === "ts") ||
                ((name === "DataSyncUpToDate" || name === "DataSyncStale") &&
                  key === "snapshotTs") ||
                ((name === "ActiveDataSyncUpToDate" ||
                  name === "ActiveDataSyncStale") &&
                  key === "syncedTs"))
            ) {
              assert.equal(value.type, "integer");
              assert.equal(value.format, "int64");
              assert(Array.contains(required, key));
              return `${key}: SyncTimestamp`;
            }
            let field = value;
            // Previously issued keys may report scopes newer than this client.
            // Keep the create-key input closed; only the metadata read is open.
            if (
              api === "management" &&
              name === "PlatformDeployKeyResponse" &&
              key === "allowedActions"
            ) {
              assert.deepEqual(
                value,
                document.components.schemas.PlatformCreateDeployKeyArgs
                  .properties.allowedActions,
              );
              assert.equal(value.type, "array");
              assert.equal(value.items.type, "string");
              assert(Array.contains(value.items.enum, "deployment:deploy"));
              field = { type: "array", items: { type: "string" } };
            }
            return `${Result.getOrThrow(Schema.encodeResult(json)(key))}: ${emit(field, undefined, Array.contains(required, key) ? [] : ["Schema.optionalKey"])}`;
          }),
          ", ",
        );
        return additionalProperties !== undefined
          ? `withAdditionalProperties({${fields}}, ${emit(additionalProperties)})`
          : `Schema.Struct({${fields}})`;
      }
      case undefined:
        assert.deepEqual(node, {});
        return "Schema.Json";
      default:
        assert.fail(`Unsupported type: ${type}`);
    }
  }

  const endpoints = [];
  for (const [path, methods] of Obj.toEntries(document.paths)) {
    for (const [method, operation] of Obj.toEntries(methods)) {
      const success = Array.filter(
        Obj.toEntries(operation.responses),
        ([status]) => /^2\d\d$/.test(status),
      );
      assert.equal(success.length, 1);
      const { content } = success[0][1];
      if (content !== undefined)
        assert.deepEqual(Obj.keys(content), ["application/json"]);
      endpoints.push(
        `${Result.getOrThrow(Schema.encodeResult(json)(`${method} ${path}`))}: ${content !== undefined ? emit(content["application/json"].schema) : "Schema.Void"}`,
      );
    }
  }
  return `// Generated by bun scripts/platformResponseSchemas.mjs (pass --check to verify). Do not edit.
// Wire structure from ${sdk}/${api}-openapi.json (OpenAPI document v${document.info.version}).
// Source: Convex, Inc.; specification license: ${document.info.license.identifier}.
${api === "deployment" ? "// License terms: https://fsl.software/FSL-1.1-Apache-2.0.txt\n" : ""}
import type { paths } from "@convex-dev/platform/${api}Api";
${api === "deployment" ? 'import * as Obj from "effect/Record";' : ""}
import * as Schema from "effect/Schema";
import type { Responses } from "./Client.js";

const Integer = Schema.Finite.check(Schema.makeFilter(Number.isInteger));

${
  api === "deployment"
    ? `const SyncTimestamp = Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: -(2n ** 63n), maximum: 2n ** 63n - 1n }));

const withAdditionalProperties = (fields: Schema.Struct.Fields, additional: Schema.Decoder<unknown>) => {
  const hasFields = Schema.is(Schema.Struct(fields));
  const isAdditional = Schema.is(additional);
  return Schema.Record(Schema.String, Schema.Unknown).check(Schema.makeFilter((record) =>
    hasFields(record) && Obj.every(record, (value, key) => Obj.has(fields, key) || isAdditional(value))
  ));
};\n`
    : ""
}
${Array.join(
  Array.map([...components], ([name, value]) =>
    api === "deployment" && name === "Selection"
      ? `export const Selection: Schema.Decoder<unknown> = ${value};`
      : `${api === "deployment" && ["DataSyncResponse", "ActiveDataSync", "ListActiveSyncsResponse"].includes(name) ? "export " : ""}const ${name} = ${value};`,
  ),
  "\n",
)}

export const ${api}: Record<Responses<paths>, Schema.Decoder<unknown>> = {
  ${Array.join(endpoints, ",\n")}
};
`;
}

assert(
  process.argv.length === 2 ||
    (process.argv.length === 3 && process.argv[2] === "--check"),
  "Usage: bun scripts/platformResponseSchemas.mjs [--check]",
);
await Effect.runPromise(
  Effect.forEach(
    Obj.toEntries(documents),
    ([api, sha256]) =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get(
          `https://raw.githubusercontent.com/get-convex/convex-backend/${revision}/npm-packages/@convex-dev/platform/${api}-openapi.json`,
        ).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
        const source = yield* response.arrayBuffer;
        assert.equal(
          new Bun.CryptoHasher("sha256").update(source).digest("hex"),
          sha256,
          `Unexpected ${api} spec for ${sdk}`,
        );
        const document = Result.getOrThrow(
          Schema.decodeResult(json)(new TextDecoder().decode(source)),
        );
        assert.equal(document.openapi, "3.1.0");
        assert.equal(document.info.version, "1.0.0");
        const file = Bun.file(
          new URL(
            `packages/platform/src/internal/${Str.capitalize(api)}Responses.ts`,
            root,
          ),
        );
        const sourceCode = new TextEncoder().encode(generate(api, document));
        const formatted = yield* Effect.promise(() =>
          $`pnpm exec oxfmt --stdin-filepath ${file.name} < ${sourceCode}`.text(),
        );
        if (process.argv[2] === "--check") {
          const existing = yield* Effect.promise(() => file.text());
          assert.equal(existing, formatted, `Regenerate ${file.name}`);
        } else yield* Effect.promise(() => Bun.write(file, formatted));
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.provide(FetchHttpClient.layer)),
);
