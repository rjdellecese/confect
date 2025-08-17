import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

export const CliOptions = Context.GenericTag<{
  convexDir: string;
  output: string;
}>("@rjdellecese/confect/CliOptions");

export const cliOptionsLayer = (cliOptions: {
  convexDir: string;
  output: string;
}) => Layer.succeed(CliOptions, CliOptions.of(cliOptions));
