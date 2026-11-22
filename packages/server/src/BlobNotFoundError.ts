import * as Schema from "effect/Schema";

/**
 * Tagged failure of a storage operation that could not read a blob or its
 * download URL. The `id` identifies the requested storage object.
 *
 * **Gotchas**
 *
 * Deletion also fails with `BlobNotFoundError` for any Convex rejection, so
 * catching this tag after a delete does not prove the blob was missing.
 *
 * @category Errors
 */
export class BlobNotFoundError extends Schema.TaggedError<
  BlobNotFoundError,
  {}
>()("BlobNotFoundError", {
  /**
   * Storage ID supplied to the operation that failed.
   *
   * @category Errors
   */
  id: Schema.String,
}) {
  /**
   * Returns a message containing the requested storage ID.
   *
   * @category Getters
   */
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
