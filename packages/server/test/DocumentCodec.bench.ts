/**
 * Runtime cost of Confect document decode/encode (`Document.decode` /
 * `Document.encode`) for non-trivial Effect table schemas.
 *
 * Run: `pnpm --filter @confect/server bench:document`
 *
 * Median per document (Node 22, Linux; @ark/attest batches of 1k calls):
 *
 * | Operation | Users | Notes sparse | Notes full (+1536 embedding) | Large synthetic |
 * |---|---|---|---|---|
 * | Document.decode | ~33 µs | ~37 µs | ~130 µs | ~51 µs |
 * | Document.encode | ~2.4 µs | ~2.7 µs | ~74 µs | ~11 µs |
 *
 * Notes full ×50 batch: ~6.4 ms (~128 µs/doc). Embedding array dominates full Notes cost.
 * `extendWithSystemFields` per decode: ~20 µs (cacheable). Document wrapper adds ~55 µs over raw Schema.decode.
 */
import { bench } from "@ark/attest";
import * as SystemFields from "@confect/core/SystemFields";
import { Document } from "@confect/server";
import { Effect, pipe, Schema } from "effect";
import { Notes } from "./mock-backend/fixtures/confect/tables/Notes";
import { Users } from "./mock-backend/fixtures/confect/tables/Users";

const runSync = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);

const tableName = Notes.name;
const notesFields = Notes.Fields;
const usersFields = Users.Fields;

// Pre-compute extended schema once (what a cached implementation could reuse).
const notesSchemaWithSystemFields = SystemFields.extendWithSystemFields(
  tableName,
  notesFields,
);
const usersSchemaWithSystemFields = SystemFields.extendWithSystemFields(
  Users.name,
  usersFields,
);

// --- Sample Convex documents (encoded / wire shape) ---

const userConvexDoc = {
  _id: "jd7f2k8m3n4p5q6r7s8t9u0v1w2x3y4",
  _creationTime: 1_700_000_000_000,
  username: "alice",
} as const;

const notesConvexDocSparse = {
  _id: "kh7f2k8m3n4p5q6r7s8t9u0v1w2x3y4z5",
  _creationTime: 1_700_000_001_000,
  text: "A short note",
} as const;

const notesConvexDocRich = {
  _id: "kh7f2k8m3n4p5q6r7s8t9u0v1w2x3y4z5",
  _creationTime: 1_700_000_001_000,
  userId: "jd7f2k8m3n4p5q6r7s8t9u0v1w2x3y4",
  text: "A longer note with nested author metadata (no embedding vector)",
  tag: "benchmark",
  author: { role: "admin" as const, name: "Alice Example" },
} as const;

const notesConvexDocFull = {
  ...notesConvexDocRich,
  text: "Note with a 1536-dimensional embedding vector",
  // Realistic embedding size for the Notes table vector index (1536 dims).
  embedding: Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.01)),
} as const;

// Large synthetic schema: nested objects, unions, arrays, many optionals.
const LargeDocFields = Schema.Struct({
  title: Schema.String,
  status: Schema.Literal("draft", "published", "archived"),
  priority: Schema.Number,
  tags: Schema.Array(Schema.String),
  metadata: Schema.Struct({
    source: Schema.String,
    revision: Schema.Number,
    flags: Schema.Struct({
      pinned: Schema.Boolean,
      reviewed: Schema.Boolean,
    }),
  }),
  contributors: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      role: Schema.Union(
        Schema.Literal("owner"),
        Schema.Literal("editor"),
        Schema.Literal("viewer"),
      ),
    }),
  ),
  history: Schema.optionalWith(
    Schema.Array(
      Schema.Struct({
        at: Schema.Number,
        action: Schema.String,
        payload: Schema.optionalWith(
          Schema.Record({ key: Schema.String, value: Schema.String }),
          {
            exact: true,
          },
        ),
      }),
    ),
    { exact: true },
  ),
});

const largeTableName = "largeDocs";
const largeSchemaWithSystemFields = SystemFields.extendWithSystemFields(
  largeTableName,
  LargeDocFields,
);

const largeConvexDoc = {
  _id: "lg7f2k8m3n4p5q6r7s8t9u0v1w2x3y4z5a6",
  _creationTime: 1_700_000_002_000,
  title: "Quarterly report",
  status: "published" as const,
  priority: 2,
  tags: ["finance", "q1", "internal"],
  metadata: {
    source: "import",
    revision: 4,
    flags: { pinned: true, reviewed: false },
  },
  contributors: [
    { name: "Alice", role: "owner" as const },
    { name: "Bob", role: "editor" as const },
    { name: "Carol", role: "viewer" as const },
  ],
  history: Array.from({ length: 20 }, (_, i) => {
    const entry: {
      at: number;
      action: string;
      payload?: { readonly [key: string]: string };
    } = {
      at: 1_700_000_000_000 + i * 60_000,
      action: i % 2 === 0 ? "edit" : "review",
    };
    if (i % 3 === 0) {
      entry.payload = { field: "title", value: `revision-${i}` };
    }
    return entry;
  }),
} as const;

// Decoded shapes for encode benches (Confect document type, includes system fields).
const userDecodedDoc = runSync(
  Document.decode(userConvexDoc, Users.name, usersFields),
);
const notesDecodedSparse = runSync(
  Document.decode(notesConvexDocSparse, tableName, notesFields),
);
const notesDecodedRich = runSync(
  Document.decode(notesConvexDocRich, tableName, notesFields),
);
const notesDecodedFull = runSync(
  Document.decode(notesConvexDocFull, tableName, notesFields),
);
const largeDecodedDoc = runSync(
  Document.decode(largeConvexDoc, largeTableName, LargeDocFields),
);

// --- Document.decode / encode (production path) ---

const decodeUser = () =>
  runSync(Document.decode(userConvexDoc, Users.name, usersFields));

const decodeNotesSparse = () =>
  runSync(Document.decode(notesConvexDocSparse, tableName, notesFields));

const decodeNotesRich = () =>
  runSync(Document.decode(notesConvexDocRich, tableName, notesFields));

const decodeNotesFull = () =>
  runSync(Document.decode(notesConvexDocFull, tableName, notesFields));

const decodeLarge = () =>
  runSync(Document.decode(largeConvexDoc, largeTableName, LargeDocFields));

const encodeUser = () =>
  runSync(Document.encode(userDecodedDoc, Users.name, usersFields));

const encodeNotesSparse = () =>
  runSync(Document.encode(notesDecodedSparse, tableName, notesFields));

const encodeNotesFull = () =>
  runSync(Document.encode(notesDecodedFull, tableName, notesFields));

const encodeLarge = () =>
  runSync(Document.encode(largeDecodedDoc, largeTableName, LargeDocFields));

// --- Breakdown: isolate Schema vs Document wrapper vs extendWithSystemFields ---

const rawDecodeNotesFull = () =>
  runSync(
    pipe(
      notesConvexDocFull,
      Schema.decode(notesSchemaWithSystemFields),
      Effect.orDie,
    ),
  );

const rawEncodeNotesFull = () =>
  runSync(pipe(notesDecodedFull, Schema.encode(notesFields), Effect.orDie));

const extendSchemaPerCall = () => {
  const schema = SystemFields.extendWithSystemFields(tableName, notesFields);
  return schema;
};

const documentDecodeWithoutExtendPerCall = () =>
  runSync(
    pipe(
      notesConvexDocFull,
      Schema.decode(notesSchemaWithSystemFields),
      Effect.orDie,
    ),
  );

// Simulates loading a page of documents (e.g. query.collect()).
const COLLECT_BATCH = 50;

const decodeNotesFullBatch = () => {
  for (let i = 0; i < COLLECT_BATCH; i++) {
    decodeNotesFull();
  }
};

const decodeNotesSparseBatch = () => {
  for (let i = 0; i < COLLECT_BATCH; i++) {
    decodeNotesSparse();
  }
};

// --- Benchmarks: decode ---

bench("decode: Users (simple struct)", () => decodeUser()).mark({
  mean: [36.5, "us"],
  median: [33.22, "us"],
});

bench("decode: Notes sparse (required fields only)", () =>
  decodeNotesSparse(),
).mark({ mean: [38.67, "us"], median: [36.35, "us"] });

bench("decode: Notes rich (nested fields, no embedding)", () =>
  decodeNotesRich(),
).mark({ mean: [40.98, "us"], median: [37.94, "us"] });

bench("decode: Notes full (nested + 1536-dim embedding)", () =>
  decodeNotesFull(),
).mark({ mean: [133.02, "us"], median: [131.45, "us"] });

bench("decode: large synthetic doc (nested, unions, 20 history entries)", () =>
  decodeLarge(),
).mark({ mean: [55.07, "us"], median: [52.36, "us"] });

bench(`decode: Notes full ×${COLLECT_BATCH} (collect-like batch)`, () =>
  decodeNotesFullBatch(),
).mark({ mean: [7.11, "ms"], median: [7.11, "ms"] });

bench(`decode: Notes sparse ×${COLLECT_BATCH} (collect-like batch)`, () =>
  decodeNotesSparseBatch(),
).mark({ mean: [1.95, "ms"], median: [1.95, "ms"] });

// --- Benchmarks: encode ---

bench("encode: Users (simple struct)", () => encodeUser()).mark({
  mean: [2.89, "us"],
  median: [2.39, "us"],
});

bench("encode: Notes sparse", () => encodeNotesSparse()).mark({
  mean: [3.07, "us"],
  median: [2.66, "us"],
});

bench("encode: Notes full (nested + 1536-dim embedding)", () =>
  encodeNotesFull(),
).mark({ mean: [75.19, "us"], median: [75.01, "us"] });

bench("encode: large synthetic doc", () => encodeLarge()).mark({
  mean: [11.5, "us"],
  median: [11.22, "us"],
});

// --- Benchmarks: breakdown ---

bench("breakdown: Schema.decode Notes full (pre-extended schema)", () =>
  rawDecodeNotesFull(),
).mark({ mean: [74.02, "us"], median: [73.29, "us"] });

bench("breakdown: Schema.encode Notes full (user fields only)", () =>
  rawEncodeNotesFull(),
).mark({ mean: [72.14, "us"], median: [72.44, "us"] });

bench("breakdown: Document.decode Notes full (production path)", () =>
  decodeNotesFull(),
).mark({ mean: [132.81, "us"], median: [128.17, "us"] });

bench(
  "breakdown: extendWithSystemFields per call (not in production if cached)",
  () => extendSchemaPerCall(),
).mark({ mean: [20.87, "us"], median: [20.49, "us"] });

bench(
  "breakdown: decode without Document wrapper (schema only, pre-extended)",
  () => documentDecodeWithoutExtendPerCall(),
).mark({ mean: [76.08, "us"], median: [75.89, "us"] });
