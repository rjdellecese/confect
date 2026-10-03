import type { Options as CodeBlockWriterOptions } from "code-block-writer";
import CodeBlockWriter_ from "code-block-writer";
import * as Effect from "effect/Effect";

const indentWriter = Effect.fnUntraced(function* <E, R>(
  writer: CodeBlockWriter_,
  effect: Effect.Effect<void, E, R>,
): Effect.fn.Return<void, E, R> {
  const indentationLevel = writer.getIndentationLevel();
  writer.setIndentationLevel(indentationLevel + 1);
  yield* effect;
  writer.setIndentationLevel(indentationLevel);
});

export class CodeBlockWriter {
  private readonly writer: CodeBlockWriter_;

  constructor(opts?: Partial<CodeBlockWriterOptions>) {
    this.writer = new CodeBlockWriter_(opts);
  }

  indent<E = never, R = never>(
    effect: Effect.Effect<void, E, R>,
  ): Effect.Effect<void, E, R> {
    return indentWriter(this.writer, effect);
  }

  writeLine<E = never, R = never>(line: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.writeLine(line);
    });
  }

  write<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.write(text);
    });
  }

  quote<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.quote(text);
    });
  }

  conditionalWriteLine<E = never, R = never>(
    condition: boolean,
    text: string,
  ): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.conditionalWriteLine(condition, text);
    });
  }

  newLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.newLine();
    });
  }

  blankLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.blankLine();
    });
  }

  toString<E = never, R = never>(): Effect.Effect<string, E, R> {
    return Effect.sync(() => this.writer.toString());
  }
}
