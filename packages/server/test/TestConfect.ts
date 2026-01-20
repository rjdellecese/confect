/// <reference types="vite/client" />

import { TestConfect as TestConfect_ } from "@confect/test";
import { convexTest as convexTest_ } from "convex-test";

import confectSchema from "./confect/schema";
import schema from "./convex/schema";

export const TestConfect = TestConfect_.TestConfect<typeof confectSchema>();

export const convexTest = convexTest_(
  schema,
  import.meta.glob("./convex/**/!(*.*.*)*.*s"),
);

export const layer = TestConfect_.layer(confectSchema, convexTest);
