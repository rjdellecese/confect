import { Predicate } from "effect";

export const TypeId = "@confect/server/DatabaseSchema";
export type TypeId = typeof TypeId;

export interface Any {
  readonly [TypeId]: TypeId;
}

export const isDatabaseSchema = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);
