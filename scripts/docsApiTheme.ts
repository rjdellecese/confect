import {
  DeclarationReflection,
  Comment,
  ReferenceType,
  IntersectionType,
  ReflectionKind,
  ReflectionType,
  type Reflection,
  type RouterTarget,
  type TypeDocOptions,
  type ProjectReflection,
  type Context,
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
import * as Record from "effect/Record";
import * as Option from "effect/Option";
import { fromMarkdown } from "mdast-util-from-markdown";

const JsonString = Schema.fromJsonString(Schema.String);

const declarationKind = (model: DeclarationReflection): string =>
  model.kindOf(ReflectionKind.Interface | ReflectionKind.TypeAlias)
    ? "type"
    : model.kindOf(ReflectionKind.Class)
      ? "class"
      : model.kindOf(ReflectionKind.Namespace)
        ? "namespace"
        : model.kindOf(ReflectionKind.Function) ||
            Array.some(
              model.type instanceof IntersectionType
                ? model.type.types
                : [model.type],
              (type) =>
                type instanceof ReflectionType &&
                (type.declaration.signatures?.length ?? 0) > 0,
            )
          ? "function"
          : "value";

export const formatDeclarationDetails = (markdown: string): string => {
  let rendered = markdown;
  for (const node of Array.reverse(fromMarkdown(markdown).children)) {
    if (node.type !== "heading" || node.depth < 4) continue;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const contentStart = node.children[0]?.position?.start.offset;
    const contentEnd = Option.getOrUndefined(Array.last(node.children))
      ?.position?.end.offset;
    if (
      start === undefined ||
      end === undefined ||
      contentStart === undefined ||
      contentEnd === undefined
    )
      continue;
    rendered = `${Str.slice(0, start)(rendered)}**${Str.slice(contentStart, contentEnd)(markdown)}**${Str.slice(end)(rendered)}`;
  }
  return rendered;
};

export const presentationOptions = {
  categorizeByGroup: false,
  defaultCategory: "Other",
  hideGroupHeadings: true,
  parametersFormat: "table",
  anchorPrefix: "api-",
} satisfies Partial<TypeDocOptions & PluginOptions>;

export const preserveReexportCategories = (
  context: Context,
  reflection: DeclarationReflection,
): void => {
  if (
    reflection.comment?.getTag("@category") !== undefined ||
    reflection.parent?.kindOf(
      ReflectionKind.Module | ReflectionKind.Namespace,
    ) !== true
  )
    return;
  const owner = context.getSymbolFromReflection(reflection.parent);
  if (
    owner === undefined ||
    context.converter.isExternal(owner, context.checker)
  )
    return;
  const exported = Option.getOrUndefined(
    Array.findFirst(
      context.checker.getExportsOfModule(owner),
      (symbol) => symbol.name === reflection.name,
    ),
  );
  if (
    exported === undefined ||
    context.resolveAliasedSymbol(exported) === exported
  )
    return;
  const category = context
    .getComment(exported, ReflectionKind.Reference)
    ?.getTag("@category");
  if (category === undefined) return;
  reflection.comment ??= new Comment();
  reflection.comment.blockTags.push(category.clone());
};

export const normalizeCategories = (project: ProjectReflection): void => {
  for (const reflection of Record.values(project.reflections)) {
    for (const tag of reflection.comment?.blockTags ?? []) {
      if (tag.tag === "@category") {
        tag.content = [
          {
            kind: "text",
            text: Str.capitalize(
              Str.trim(Comment.combineDisplayParts(tag.content)),
            ),
          },
        ];
      }
    }
  }
};

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
    context.partials.member = (model, options) => {
      let rendered = model.kindOf(ReflectionKind.Namespace)
        ? context.partials.memberWithGroups(model, {
            headingLevel: options.headingLevel + 1,
          })
        : member(model, options);
      if (
        model.parent?.kindOf(
          ReflectionKind.Module | ReflectionKind.Namespace,
        ) === true
      ) {
        rendered = `<Badge color="gray" size="sm">${declarationKind(model)}</Badge>\n\n${rendered}`;
      }
      const type =
        model.type instanceof ReferenceType && model.type.name === "Service"
          ? model.type
          : Option.getOrUndefined(
              Array.findFirst(
                model.extendedTypes ?? [],
                (base) =>
                  base instanceof ReferenceType &&
                  base.name === "Shape" &&
                  base.package === "effect",
              ),
            );
      if (!(type instanceof ReferenceType) || type.package !== "effect")
        return rendered;
      const service = type.typeArguments?.[1];
      if (!(service instanceof ReflectionType)) return rendered;
      const headingLevel = options.headingLevel + 1;
      return `${rendered}\n\n${Str.repeat(headingLevel)("#")} Service operations\n\n${context.partials.typeDeclarationContainer(model, service.declaration, { headingLevel })}`;
    };
    const memberTitle = context.partials.memberTitle;
    context.partials.memberTitle = (model) => {
      const title = memberTitle(model);
      const parent = model.parent;
      return parent instanceof DeclarationReflection &&
        parent.kindOf(ReflectionKind.Module | ReflectionKind.Namespace) &&
        Array.filter(
          parent.children ?? [],
          (child) => child.name === model.name,
        ).length > 1
        ? `${title} (${declarationKind(model)})`
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
    return context;
  }

  override render(page: MarkdownPageEvent): string {
    const body = Str.replace(
      /<a id="([^"]+)"><\/a>/g,
      '<span id="$1"></span>',
    )(formatDeclarationDetails(super.render(page)));
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
