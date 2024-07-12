import { expect } from "@effect/vitest";
import { Effect } from "effect";

import { test } from "~/test/convex-effect-test";
import { api } from "~/test/convex/_generated/api";
import type { Id } from "~/test/convex/_generated/dataModel";
import { schema } from "~/test/convex/basic_schema_operations__schema";
import { TestConvexService } from "~/test/test-convex-service";

test("insert", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const text = "Hello, world!";

		const noteId: Id<"basic_schema_operations__notes"> = yield* c.mutation(
			api.basic_schema_operations.insert,
			{
				text,
			},
		);

		const note = yield* c.run(({ db }) => db.get(noteId));

		expect(note?.text).toEqual(text);
	}));

test("collect", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const text = "Hello, world!";

		yield* c.run(({ db }) =>
			db.insert("basic_schema_operations__notes", { text }),
		);

		const notes = yield* c.query(api.basic_schema_operations.collect, {});

		expect(notes.length).toEqual(1);
		expect(notes[0]?.text).toEqual(text);
	}));

test("filter + first", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const text1 = "Hello, Earth!";
		const text2 = "Hello, Mars!";

		yield* c.run(({ db }) =>
			Promise.all([
				db.insert(schema.tableName("notes"), { text: text1 }),
				db.insert(schema.tableName("notes"), { text: text2 }),
			]),
		);

		const note = yield* c.query(api.basic_schema_operations.filterFirst, {
			text: text1,
		});

		expect(note?.text).toEqual(text1);
	}));

test("withIndex + first", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const text = "Hello, world!";

		yield* c.run(({ db }) =>
			db.insert(schema.tableName("notes"), {
				text: text,
			}),
		);

		const note = yield* c.query(api.basic_schema_operations.withIndexFirst, {
			text: text,
		});

		expect(note?.text).toEqual(text);
	}));
