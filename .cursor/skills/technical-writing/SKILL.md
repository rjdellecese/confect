---
name: technical-writing
description: Guides writing clear, well-structured technical documentation following Mintlify's best practices (Diátaxis framework, audience awareness, style/tone, navigation, SEO/AEO). Use when writing, reviewing, or improving documentation, guides, tutorials, API references, or any user-facing technical content.
---

# Technical Writing

Best practices for technical documentation, distilled from [Mintlify's Guide to Technical Writing](https://www.mintlify.com/guides/introduction).

## Content Types (Diátaxis Framework)

Categorize every page into exactly one type before writing:

| Type             | Reader Goal              | Structure                          | Assumed Knowledge         |
| ---------------- | ------------------------ | ---------------------------------- | ------------------------- |
| **Tutorial**     | Learn through practice   | Sequential steps, guided tasks     | None (beginner)           |
| **How-to guide** | Solve a specific problem | Problem-solution, logical sequence | Some (intermediate)       |
| **Reference**    | Look up precise details  | Scannable facts, tables, specs     | Significant (experienced) |
| **Explanation**  | Understand concepts      | Conceptual discussion, background  | Any level                 |

### Writing approach per type

**Tutorials**: Set expectations upfront on what the reader will achieve. Use incremental steps. Minimize choices. Point out milestones. Focus on actions over theory.

**How-to guides**: Write from the user's perspective, not the product's. Describe a logical sequence. Skip obvious steps ("Press enter to submit"). Minimize extraneous context.

**Reference**: Optimize for scannability. Prioritize consistency (tables, naming, specs). Avoid explanatory prose. Provide copy-paste-ready examples.

**Explanation**: Provide background context and design decisions. Acknowledge alternatives. Connect to other product areas or industry concepts.

## Know Your Audience

Each piece of content should target **one specific persona**. Common personas:

- **Technical decision maker** evaluating architecture
- **End user** learning to get started or complete tasks
- **Developer** integrating the product
- **AI agents/LLMs** retrieving structured answers

Before writing, answer: _What is the reader trying to accomplish? How much do they already know?_

### Writing for AI agents

Practices that help LLMs also help humans:

- Clear, descriptive headings
- Correct semantic markup
- Explicit prerequisites
- No vague references ("this", "it" without clear antecedent)
- Consistent terminology
- Defined acronyms and jargon
- Complete, runnable code examples

## Style and Tone

### Core principles

1. **Be concise**—readers want to achieve a goal, not read prose. Cut unnecessary words.
2. **Clarity over cleverness**—simple, direct language. Avoid jargon and complex sentences.
3. **Active voice**—"Create a configuration file" not "A configuration file should be created."
4. **Skimmable**—use headings to orient. Break up text-heavy paragraphs.
5. **Second person**—address the reader as "you."

### Common mistakes to avoid

- Spelling and grammar errors (erode trust in the product)
- Inconsistent terminology ("API key" in one place, "API token" in another)
- Product-centric language the user wouldn't understand
- "Duh" documentation ("Click Save to save")
- Colloquialisms (hurt clarity, especially with localization)

### Style guide references

When standardizing, lean on established guides:

- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Microsoft Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/)

## Navigation and Organization

### Structural principles

- **Descriptive headings**: accurately describe what follows; avoid vague or clever labels.
- **Self-contained pages**: each page should be understandable independently (users and AI may land on any page).
- **Semantic markup**: use heading levels hierarchically; lists for lists, tables for tabular data, code blocks for code.
- **Logical ordering**: definitions before edge cases, common use case before advanced scenarios.
- **Consistent terminology**: one term per concept, everywhere.

### Common pitfalls

- Overloaded categories (too many top-level sections)
- Buried essential content
- Unclear section names
- Outdated or deprecated content left without markers

## Media

Use screenshots, GIFs, and videos **sparingly and intentionally**. Media is supplementary, not primary.

| Media      | When to use                                     | Maintenance cost       |
| ---------- | ----------------------------------------------- | ---------------------- |
| Screenshot | UI elements that are hard to describe in text   | Low (~5 min to update) |
| GIF        | Short, complex workflows or promotional content | Medium (~1 hour)       |
| Video      | Abstract concepts and long workflows            | High (several hours)   |

Always provide alt text for images, subtitles for videos, and transcripts for audio.

## SEO and Answer Engine Optimization

### Content SEO

- Clear H1/H2/H3 structure with keywords in headings
- Short paragraphs and bullet points
- Descriptive internal links ("Learn more about rate limiting" not "Click here")

### Technical SEO

- Meta titles (50-60 chars) and descriptions (150-160 chars) per page
- Descriptive alt text on images
- Mobile-friendly layout
- Up-to-date sitemap

### AEO (for AI-powered search)

- Define terms explicitly on first use
- Provide complete, runnable code examples
- Make each section self-contained (AI retrieves sections independently)
- Document errors and edge cases with causes and solutions
- Mark deprecated features clearly

## Maintenance

- **Automate**: track stale content, detect product changes, enforce standards with linters (e.g. Vale).
- **Prioritize**: focus review effort on high-traffic pages, not every page equally.
- **Remove wrong docs**: outdated/misleading content is worse than no content.
- **Plan periodic resets**: every 1-2 years, consider a structured audit and rewrite of the most impactful sections.

## Content Freshness

Optimize for evergreen content. If something represents a point-in-time snapshot, it's better as a blog post. Avoid embedding frequently-changing information (e.g. pricing) directly in docs.

## Additional Resources

For the full guide with expert quotes and detailed examples, see [reference.md](reference.md).
