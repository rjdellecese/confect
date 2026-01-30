/// <reference types="vite/client" />

import { TestConfect as TestConfect_ } from "@confect/test";

import confectSchema from "./confect/schema";

export const TestConfect = TestConfect_.TestConfect<typeof confectSchema>();

export const layer = TestConfect_.layer(
  confectSchema,
  import.meta.glob("./convex/**/!(*.*.*)*.*s"),
);
