import {
  DeclarationReflection,
  ReferenceType,
  ReflectionKind,
  ReflectionType,
  type Reflection,
  type RouterTarget,
  type TypeDocOptions,
} from "typedoc";
import {
  MarkdownTheme,
  ModuleRouter,
  type MarkdownPageEvent,
  type PluginOptions,
} from "typedoc-plugin-markdown";
import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as Effect from "effect/Effect";

const JsonString = Schema.fromJsonString(Schema.String);

export const presentationOptions = {
  categorizeByGroup: false,
  defaultCategory: "Other",
  hideGroupHeadings: true,
  parametersFormat: "table",
} satisfies Partial<TypeDocOptions & PluginOptions>;

export class MintlifyRouter extends ModuleRouter {
  protected override getPageKind(reflection: Reflection) {
    if (
      reflection.kindOf(ReflectionKind.Namespace) &&
      reflection.parent?.kindOf(ReflectionKind.Namespace) === true
    )
      return undefined;
    return super.getPageKind(reflection);
  }

  override getIdealBaseName(reflection: Reflection): string {
    const names: string[] = [];
    for (
      let current: Reflection | undefined = reflection;
      current?.parent;
      current = current.parent
    ) {
      names.unshift(current.name);
    }
    if (reflection.kindOf(ReflectionKind.Module)) names.push("index");
    return names.length > 0 ? Array.join(names, "/") : "index";
  }
}

export class MintlifyTheme extends MarkdownTheme {
  override getRenderContext(page: MarkdownPageEvent<Reflection>) {
    const context = super.getRenderContext(page);
    const member = context.partials.member;
    context.partials.member = (model, options) =>
      model.kindOf(ReflectionKind.Namespace)
        ? context.partials.memberWithGroups(model, {
            headingLevel: options.headingLevel + 1,
          })
        : member(model, options);
    const memberTitle = context.partials.memberTitle;
    context.partials.memberTitle = (model) => {
      const title = memberTitle(model);
      return model.parent?.kindOf(
        ReflectionKind.Module | ReflectionKind.Namespace,
      ) === true
        ? `${title} (${Str.toLowerCase(ReflectionKind.singularString(model.kind))})`
        : title;
    };
    const commentParts = context.helpers.getCommentParts;
    context.helpers.getCommentParts = (parts) =>
      commentParts(
        Array.map(parts, (part) =>
          part.kind === "text"
            ? {
                ...part,
                text: Str.replace(
                  /</g,
                  "&lt;",
                )(
                  Str.replace(
                    /\{/g,
                    "&#123;",
                  )(Str.replace(/\}/g, "&#125;")(part.text)),
                ),
              }
            : part,
        ),
      );
    const declaration = context.partials.declaration;
    context.partials.declaration = (model, options = { headingLevel: 2 }) => {
      const rendered = declaration(model, options);
      const type = model.type;
      if (
        !(type instanceof ReferenceType) ||
        type.package !== "effect" ||
        type.name !== "Service"
      ) {
        return rendered;
      }
      const service = type.typeArguments?.[1];
      if (!(service instanceof ReflectionType)) return rendered;
      return `${rendered}\n\n${Str.repeat(options.headingLevel)("#")} Service operations\n\n${context.partials.typeDeclarationContainer(model, service.declaration, options)}`;
    };
    return context;
  }

  override render(page: MarkdownPageEvent): string {
    const body = Str.replace(
      /<a id="([^"]+)"><\/a>/g,
      '<span id="$1"></span>',
    )(super.render(page));
    const model = page.model;
    const names: string[] = [];
    for (
      let current: RouterTarget = model;
      current?.parent;
      current = current.parent
    ) {
      names.unshift(current.name);
    }
    const importPath =
      names.length > 0
        ? `@confect/${Array.join(Array.take(names, 2), "/")}`
        : undefined;
    const title =
      model instanceof DeclarationReflection
        ? model.kindOf(ReflectionKind.Module)
          ? (importPath ?? model.name)
          : model.name
        : "Package reference";
    const introduction =
      importPath !== undefined ? `Import path: \`${importPath}\`.\n\n` : "";
    return `---\ntitle: ${Effect.runSync(Schema.encodeEffect(JsonString)(title))}\ndescription: ${Effect.runSync(Schema.encodeEffect(JsonString)(importPath !== undefined ? `API reference for ${importPath}.` : "Confect package API reference."))}\n---\n\n${introduction}${body}`;
  }
}
