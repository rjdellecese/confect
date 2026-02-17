import { Schema } from "effect";
import * as GroupPath from "./GroupPath";

/**
 * The path to a function in the Confect API.
 */
export class FunctionPath extends Schema.Class<FunctionPath>("FunctionPath")({
  groupPath: GroupPath.GroupPath,
  name: Schema.NonEmptyString,
}) {}

/**
 * Get the group path from a function path.
 */
export const groupPath = (functionPath: FunctionPath): GroupPath.GroupPath =>
  functionPath.groupPath;

/**
 * Get the function name from a function path.
 */
export const name = (functionPath: FunctionPath): string => functionPath.name;

/**
 * Get the function path as a string.
 */
export const toString = (functionPath: FunctionPath): string =>
  `${GroupPath.toString(functionPath.groupPath)}.${functionPath.name}`;
