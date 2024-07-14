import { describe, expect } from "@effect/vitest";
import { Array, Cause, Console, Effect, Exit, Option, pipe } from "effect";

import { test } from "~/test/convex-effect-test";
import { api } from "~/test/convex/_generated/api";
import type { Id } from "~/test/convex/_generated/dataModel";
import {
	type TableName,
	tableName,
} from "~/test/convex/schemas/basic_schema_operations";
import { TestConvexService } from "~/test/test-convex-service";
import { NotUniqueError } from "../src/database";

test("insert", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const text = "Hello, world!";

		const noteId: Id<TableName<"notes">> = yield* c.mutation(
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

		yield* c.run(({ db }) => db.insert(tableName("notes"), { text }));

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
				db.insert(tableName("notes"), { text: text1 }),
				db.insert(tableName("notes"), { text: text2 }),
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
			db.insert(tableName("notes"), {
				text: text,
			}),
		);

		const note = yield* c.query(api.basic_schema_operations.withIndexFirst, {
			text: text,
		});

		expect(note?.text).toEqual(text);
	}));

test("order desc + collect", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		const firstText = "A";
		const secondText = "B";
		const thirdText = "C";

		yield* c.run(({ db }) =>
			Promise.all([
				// Insert in reverse of desired sort order
				db.insert(tableName("notes"), { text: thirdText }),
				db.insert(tableName("notes"), { text: secondText }),
				db.insert(tableName("notes"), { text: firstText }),
			]),
		);

		const notes = yield* c.query(
			api.basic_schema_operations.orderDescCollect,
			{},
		);

		expect(notes.length).toEqual(3);
		expect(Array.map(notes, ({ text }) => text)).toStrictEqual([
			firstText,
			secondText,
			thirdText,
		]);
	}));

test("take", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		yield* c.run(({ db }) =>
			Promise.all(
				Array.map(Array.range(1, 5), (n) =>
					db.insert(tableName("notes"), { text: `Note ${n}` }),
				),
			),
		);

		const oneNote = yield* c.query(api.basic_schema_operations.take, {
			n: 1,
		});
		const twoNotes = yield* c.query(api.basic_schema_operations.take, {
			n: 2,
		});
		const threeNotes = yield* c.query(api.basic_schema_operations.take, {
			n: 3,
		});

		expect(oneNote.length).toEqual(1);
		expect(twoNotes.length).toEqual(2);
		expect(threeNotes.length).toEqual(3);
	}));

test("paginate", () =>
	Effect.gen(function* () {
		const c = yield* TestConvexService;

		yield* c.run(({ db }) =>
			Promise.all(
				Array.map(Array.range(1, 9), (n) =>
					db.insert(tableName("notes"), { text: `Note ${n}` }),
				),
			),
		);

		const paginationResult = yield* c.query(
			api.basic_schema_operations.paginate,
			{
				cursor: null,
				numItems: 5,
			},
		);

		expect(paginationResult.page.length).toEqual(5);
		expect(paginationResult.isDone).toEqual(false);

		const paginationResult2 = yield* c.query(
			api.basic_schema_operations.paginate,
			{
				cursor: paginationResult.continueCursor,
				numItems: 5,
			},
		);

		expect(paginationResult2.page.length).toEqual(4);
		expect(paginationResult2.isDone).toEqual(true);
	}));

describe("unique", () => {
	test("when one note exists", () =>
		Effect.gen(function* () {
			const c = yield* TestConvexService;

			yield* c.run(({ db }) =>
				db.insert(tableName("notes"), { text: "Hello, world!" }),
			);

			const note = yield* c.query(api.basic_schema_operations.unique, {});

			expect(note).toMatchObject({ text: "Hello, world!" });
		}));

	test("when more than two notes exist", () =>
		Effect.gen(function* () {
			const c = yield* TestConvexService;

			const text = "Hello, world!";

			yield* c.run(({ db }) =>
				Promise.all([
					db.insert(tableName("notes"), { text }),
					db.insert(tableName("notes"), { text }),
				]),
			);

			const note = yield* c.query(api.basic_schema_operations.unique, {});

			expect(note).toEqual(new NotUniqueError()._tag);
		}));

	test("when zero notes exist", () =>
		Effect.gen(function* () {
			const c = yield* TestConvexService;

			const note = yield* c.query(api.basic_schema_operations.unique, {});

			expect(note).toEqual(null);
		}));
});
