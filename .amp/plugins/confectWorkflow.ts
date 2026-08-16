import type { PluginAPI } from "@ampcode/plugin";
import { extname } from "node:path";

export const description =
  "Protects local secrets and dependency sources, then formats and lints files modified by Amp.";

const FORMATTED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".json",
  ".jsonc",
  ".json5",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".htm",
  ".vue",
  ".css",
  ".scss",
  ".less",
  ".md",
  ".mdx",
  ".graphql",
  ".gql",
  ".hbs",
]);

const LINTED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

const READ_TOOLS = new Set(["finder", "shell_command", "view_media"]);
const DEPENDENCY_SOURCE_PATTERN = /node_modules|\.pnpm-store|\.pnpm(?:[\\/]|$)/;

export default function (amp: PluginAPI) {
  amp.on("tool.call", (event) => {
    if (!READ_TOOLS.has(event.tool)) {
      return { action: "allow" };
    }

    const input = JSON.stringify(event.input);

    if (input.includes(".env.local")) {
      return {
        action: "reject-and-continue",
        message: "Do not read `.env.local`; it may contain local secrets.",
      };
    }

    if (DEPENDENCY_SOURCE_PATTERN.test(input)) {
      return {
        action: "reject-and-continue",
        message:
          "Do not read dependency source from `node_modules` or pnpm stores. Use Librarian for external repositories or run `pnpm opensrc path <package>` and inspect the returned source directory.",
      };
    }

    return { action: "allow" };
  });

  amp.on("tool.result", async (event, ctx) => {
    if (event.status !== "done") {
      return;
    }

    const uris = amp.helpers.filesModifiedByToolCall(event);
    if (uris === null) {
      return;
    }

    await Promise.all(
      uris.map(async (uri) => {
        const filePath = amp.helpers.filePathFromURI(uri);
        if (!(await Bun.file(filePath).exists())) {
          return;
        }

        const extension = extname(filePath).toLowerCase();

        if (FORMATTED_EXTENSIONS.has(extension)) {
          const result = await ctx.$`pnpm oxfmt --write ${filePath}`;
          if (result.exitCode !== 0) {
            ctx.logger.log(result.stderr);
          }
        }

        if (LINTED_EXTENSIONS.has(extension)) {
          const result = await ctx.$`pnpm oxlint --fix ${filePath}`;
          if (result.stderr.length > 0) {
            ctx.logger.log(result.stderr);
          }
        }
      }),
    );
  });
}
