/// <reference types="vite/client" />

import { TestConfect as TestConfect_ } from "@confect/test";

import confectSchema from "./fixtures/confect/schema";

export const TestConfect = TestConfect_.TestConfect<typeof confectSchema>();

export const layer = TestConfect_.layer(
  confectSchema,
  import.meta.glob("./fixtures/convex/**/!(*.*.*)*.*s"),
);
