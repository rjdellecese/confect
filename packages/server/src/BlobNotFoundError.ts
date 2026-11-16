import * as Schema from "effect/Schema";

/**
 * A storage download or URL lookup found no blob, or a delete operation failed.
 * The `id` payload identifies the requested storage object. Catch the
 * `BlobNotFoundError` tag in the operation's Effect error channel.
 */
export class BlobNotFoundError extends Schema.TaggedError<
  BlobNotFoundError,
  {}
>()("BlobNotFoundError", {
  /**
   * ID supplied to the failed storage operation.
   */
  id: Schema.String,
}) {
  /**
   * Human-readable description containing the requested ID.
   */
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
