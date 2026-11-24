import { bench } from "confect-bench-harness";
import type { IsRecursive } from "@confect/core/Types";

void (false satisfies IsRecursive<any>);

bench("IsRecursive<string>", () => false satisfies IsRecursive<string>).types([
  19,
  "instantiations",
]);

type DeepObject = { a: { b: { c: { d: { e: { value: string } } } } } };

bench("IsRecursive (deep object)", () =>
  false satisfies IsRecursive<DeepObject>).types([375, "instantiations"]);

type OptionalObject = {
  status?: string;
  archived?: boolean;
  saved?: Array<{ status?: string }>;
};

bench("IsRecursive (assignable optional structures)", () =>
  false satisfies IsRecursive<OptionalObject>).types([321, "instantiations"]);

type SharedChild = { value: string; items: ReadonlyArray<number> };
type SharedObject = {
  a: SharedChild;
  b: SharedChild;
  c: SharedChild;
  d: SharedChild;
};

bench("IsRecursive (shared subtrees)", () =>
  false satisfies IsRecursive<SharedObject>).types([280, "instantiations"]);

type ObjectUnion =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "array"; values: ReadonlyArray<SharedChild> }
  | { kind: "object"; value: SharedObject }
  | { kind: "optional"; value?: OptionalObject };

bench("IsRecursive (object union)", () =>
  false satisfies IsRecursive<ObjectUnion>).types([1236, "instantiations"]);

type RecursiveObject = { next?: RecursiveObject };
type RecursiveArray = Array<RecursiveArray>;
type RecursiveUnion = string | { children: ReadonlyArray<RecursiveUnion> };

bench("IsRecursive (recursive object)", () =>
  true satisfies IsRecursive<RecursiveObject>).types([132, "instantiations"]);

bench("IsRecursive (recursive array)", () =>
  true satisfies IsRecursive<RecursiveArray>).types([89, "instantiations"]);

bench("IsRecursive (recursive union)", () =>
  true satisfies IsRecursive<RecursiveUnion>).types([334, "instantiations"]);
