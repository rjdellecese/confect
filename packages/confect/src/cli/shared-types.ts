/**
 * @fileoverview Shared TypeScript interfaces for Confect type extraction and generation.
 *
 * This module defines the core data structures used throughout the Confect CLI
 * for representing extracted function metadata and parsing results.
 *
 * @since 1.0.0
 */

/**
 * Result of parsing Confect functions from TypeScript files.
 *
 * Contains all extracted functions and their associated type definitions
 * found during the scanning process.
 *
 * @since 1.0.0
 */
export interface ParseResult {
  /** Array of extracted Confect functions with their metadata */
  functions: ExtractedFunction[];
  /** Map of type names to their TypeScript definitions */
  typeDefinitions: Map<string, string>;
}

/**
 * Metadata for a single extracted Confect function.
 *
 * Represents a confectQuery, confectMutation, or confectAction function
 * with all its associated type and schema information.
 *
 * @since 1.0.0
 */
export interface ExtractedFunction {
  /** Function name as declared in the source code */
  name: string;
  /** Type of Confect function (query, mutation, or action) */
  type: "query" | "mutation" | "action";
  /** Error schema string if present, null otherwise */
  errorSchema: string | null;
  /** Return type schema string if present, null otherwise */
  returnsSchema: string | null;
  /** Relative file path from the Convex directory */
  filePath: string;
  /** Module name derived from file path (e.g., "functions", "admin/functions") */
  moduleName: string;
  /** Full key for namespacing (e.g., "functions.insertTodo", "admin/functions.insertTodo") */
  fullKey: string;
  /** Set of custom error type names extracted from the error schema */
  errorTypes: Set<string>;
}
