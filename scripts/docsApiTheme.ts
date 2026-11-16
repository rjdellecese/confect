import {
  DeclarationReflection,
  Comment,
  ReferenceType,
  ReferenceReflection,
  IntersectionType,
  UnionType,
  ConditionalType,
  ReflectionKind,
  ReflectionType,
  type Reflection,
  type RouterTarget,
  type TypeDocOptions,
  type ProjectReflection,
  type Context,
  type ContainerReflection,
  type SomeType,
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

const isCallable = (
  type: SomeType | undefined,
  seen = new Set<SomeType>(),
): boolean => {
  if (type === undefined || seen.has(type)) return false;
  seen.add(type);
  if (type instanceof ReflectionType)
    return (type.declaration.signatures?.length ?? 0) > 0;
  if (type instanceof IntersectionType || type instanceof UnionType)
    return Array.some(type.types, (member) => isCallable(member, seen));
  if (type instanceof ConditionalType)
    return isCallable(type.trueType, seen) || isCallable(type.falseType, seen);
  if (
    type instanceof ReferenceType &&
    type.reflection instanceof DeclarationReflection
  ) {
    return (
      (type.reflection.signatures?.length ?? 0) > 0 ||
      isCallable(type.reflection.type, seen)
    );
  }
  return false;
};

const declarationKind = (model: DeclarationReflection): string => {
  if (model instanceof ReferenceReflection) {
    const target = model.getTargetReflectionDeep();
    if (target instanceof DeclarationReflection) return declarationKind(target);
  }
  return model.kindOf(ReflectionKind.Interface | ReflectionKind.TypeAlias)
    ? "type"
    : model.kindOf(ReflectionKind.Class)
      ? "class"
      : model.kindOf(ReflectionKind.Namespace)
        ? "namespace"
        : model.kindOf(ReflectionKind.Function | ReflectionKind.Method) ||
            isCallable(model.type)
          ? "function"
          : "value";
};

const categoryOf = (
  owner: ContainerReflection,
  model: Reflection,
): string | undefined =>
  Option.getOrUndefined(
    Array.findFirst(owner.categories ?? [], (group) =>
      Array.some(group.children, (child) => child === model),
    ),
  )?.title;

const serviceContract = (
  model: DeclarationReflection,
): DeclarationReflection | undefined => {
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
    return undefined;
  const service = type.typeArguments?.[1];
  return service instanceof ReflectionType ? service.declaration : undefined;
};

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
    const title = Str.slice(contentStart, contentEnd)(markdown);
    rendered = `${Str.slice(0, start)(rendered)}**${title}**${Str.slice(end)(rendered)}`;
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
    if (
      reflection instanceof ReferenceReflection &&
      reflection.comment?.getTag("@category") === undefined
    ) {
      const target = reflection.getTargetReflectionDeep();
      const tag =
        target.comment?.getTag("@category") ??
        (target instanceof DeclarationReflection
          ? target.signatures?.[0]?.comment?.getTag("@category")
          : undefined);
      if (tag !== undefined) {
        reflection.comment ??= new Comment();
        reflection.comment.blockTags.push(tag.clone());
      }
    }
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
    const urlTo = context.urlTo.bind(context);
    context.urlTo = (reflection) =>
      Str.replace(/\.mdx(?=#|$)/, "")(urlTo(reflection));
    const entries = new Map<
      DeclarationReflection,
      { name: string; category: string; anchor: string }
    >();
    const addEntry = (
      model: DeclarationReflection,
      name: string,
      owner: ContainerReflection,
    ): void => {
      if (entries.has(model) || context.router.hasOwnDocument(model)) return;
      const target =
        model instanceof ReferenceReflection
          ? model.getTargetReflectionDeep()
          : undefined;
      const category =
        categoryOf(owner, model) ??
        (target?.parent instanceof DeclarationReflection
          ? categoryOf(target.parent, target)
          : undefined) ??
        "Other";
      const anchor = context.router.hasUrl(model)
        ? context.router.getAnchor(model)
        : undefined;
      entries.set(model, {
        name,
        category,
        anchor:
          anchor ??
          `api-${context.router.getSlugger(page.model).slug(`operation.${name}`)}`,
      });
      if (model.kindOf(ReflectionKind.Namespace)) {
        for (const child of model.children ?? [])
          addEntry(child, `${name}.${child.name}`, model);
        return;
      }
      const containers = [model];
      const service = serviceContract(model);
      if (service !== undefined) containers.push(service);
      for (const type of model.type instanceof IntersectionType
        ? model.type.types
        : [model.type]) {
        if (
          type instanceof ReflectionType &&
          type.declaration.children !== undefined
        )
          containers.push(type.declaration);
      }
      for (const container of containers) {
        for (const child of container.children ?? []) {
          if (
            child.inheritedFrom === undefined &&
            declarationKind(child) === "function"
          )
            addEntry(child, `${name}.${child.name}`, container);
        }
      }
    };
    if (
      page.model instanceof DeclarationReflection &&
      page.model.kindOf(ReflectionKind.Module | ReflectionKind.Namespace)
    ) {
      for (const child of page.model.children ?? [])
        addEntry(child, child.name, page.model);
    }
    let currentEntry: DeclarationReflection | undefined;
    const body = context.partials.body;
    context.partials.body = (model, options) => {
      if (model !== page.model || entries.size === 0)
        return body(model, options);
      const groups = new Map<string, DeclarationReflection[]>();
      for (const [declaration, entry] of entries) {
        const group = groups.get(entry.category) ?? [];
        group.push(declaration);
        groups.set(entry.category, group);
      }
      const rendered: string[] = [];
      for (const [category, declarations] of Array.sort(
        Array.fromIterable(groups),
        (
          a: [string, DeclarationReflection[]],
          b: [string, DeclarationReflection[]],
        ) => Str.localeCompare(b[0])(a[0]),
      )) {
        rendered.push(`## ${category}`);
        for (const declaration of Array.sort(
          declarations,
          (a: DeclarationReflection, b: DeclarationReflection) =>
            Str.localeCompare(entries.get(b)?.name ?? b.name)(
              entries.get(a)?.name ?? a.name,
            ),
        )) {
          currentEntry = declaration;
          rendered.push(
            context.partials.memberContainer(declaration, { headingLevel: 3 }),
          );
          rendered.push("---");
        }
      }
      currentEntry = undefined;
      return Array.join(rendered, "\n\n");
    };
    const memberContainer = context.partials.memberContainer;
    context.partials.memberContainer = (model, options) => {
      const entry = entries.get(model);
      if (entry !== undefined && currentEntry !== model)
        return `See [${entry.name}](#${entry.anchor}).`;
      const rendered = memberContainer(model, options);
      return entry !== undefined && !context.router.hasUrl(model)
        ? `<a id="${entry.anchor}"></a>\n\n${rendered}`
        : rendered;
    };
    const member = context.partials.member;
    context.partials.member = (model, options) => {
      let rendered = model.kindOf(ReflectionKind.Namespace)
        ? context.partials.memberWithGroups(model, {
            headingLevel: options.headingLevel + 1,
          })
        : member(model, options);
      if (currentEntry === model) {
        rendered = `<Badge color="gray" size="sm">${declarationKind(model)}</Badge>\n\n${rendered}`;
      }
      const service = serviceContract(model);
      if (service === undefined) return rendered;
      const headingLevel = options.headingLevel + 1;
      return `${rendered}\n\n${Str.repeat(headingLevel)("#")} Service operations\n\n${context.partials.typeDeclarationContainer(model, service, { headingLevel })}`;
    };
    const memberTitle = context.partials.memberTitle;
    context.partials.memberTitle = (model) => {
      const entry = entries.get(model);
      const title =
        entry !== undefined && entry.name !== model.name
          ? `${Str.slice(0, entry.name.length - model.name.length)(entry.name)}${memberTitle(model)}`
          : memberTitle(model);
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
