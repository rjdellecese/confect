# Technical Writing Reference

Detailed reference material from [Mintlify's Guide to Technical Writing](https://www.mintlify.com/guides/introduction). This supplements the main SKILL.md with expert quotes, expanded guidance, and full examples.

## Content Types — Expanded

### Selecting a content type

| Question | Tutorial | How-To | Reference | Explanation |
|----------|----------|--------|-----------|-------------|
| What is the user's goal? | Learn through practice | Solve a specific problem | Find precise information | Understand concepts |
| How knowledgeable is the user? | Beginner | Intermediate | Experienced | Any level |
| How is the content structured? | Step-by-step | Problem-solution | Organized facts | Conceptual explanations |
| Is it task-oriented? | Yes, guided tasks | Yes, specific tasks | No, informational | No, conceptual |
| Is it designed for linear progression? | Yes | No | No | No |

### Expert advice

> Reference documentation should be super scannable. As a developer, you want to find "How do I do this specific task?" When I get there, I want to be able to clearly understand the parameters.
> — **Sarah Edwards, Documentation Engineer at Datastax**

> For complex or multi-threaded releases that touch many parts of your product, you need to provide both practical guidance and conceptual understanding in your documentation. Users need to grasp when and why to use something, not just how.
> — **CT Smith, Head of Docs at Payabli**

> The trap is to think one framework can rule them all. Don't be so inflexible in enforcing content types that you forget the reader.
> — **CT Smith, Head of Docs at Payabli**

### Content freshness

Optimize for evergreen documentation. If something represents a moment in time, it's better suited for a blog post. If something changes frequently (e.g., pricing), avoid putting it directly in docs.

---

## Audience — Expanded

### The curse of knowledge

> You have the curse of knowledge. You know how everything works, but that's detrimental to your end user.
> — **CT Smith, Head of Docs at Payabli**

### User research questions

Talk to users to understand:
- How do they describe your product functionality?
- Do they use unexpected words or names?
- What do they wish they had more knowledge of?
- What is explicitly missing from your documentation?

### Feedback mechanisms

- Incorporate thumbs up/down or open-ended surveys directly in docs
- Use analytics: page views, search queries, drop-off rates
- Embed in support channels to see user pain points firsthand
- Test your docs with AI agents — if an AI struggles to answer questions using your docs, that signals improvement areas

### When to stop

> There can be an urge to document every single thing because all information is potentially valuable to someone. But too much content becomes difficult to navigate and maintain. Use communities—like socials or Slack—to serve niche use cases.
> — **Ethan Palm, Senior Manager of Docs at GitHub**

---

## Navigation — Expanded

### Why navigation matters

> Your navigation is like a subway map. It tells you how the whole system hangs together, which is crucial for users evaluating your product.
> — **CT Smith, Head of Docs at Payabli**

### Mapping the foundation

Align with stakeholders (founders, PMs, engineering leads) on:
- What is the simplest way to explain how the product works?
- What are the core features?
- How do users typically adopt the product? Where do they get stuck?
- How does the architecture influence usage?
- What are the most important integrations or dependencies?
- What is changing or evolving?
- How do people conceptualize the product — by features, use cases, or technical details?

### Validating structure

Track real user journeys with analytics tools:
- **Entry points**: Where do users start? Search, support ticket, or in-product link?
- **Navigation patterns**: Do they follow the expected hierarchy or take detours?
- **Friction points**: Where do users pause, loop back, or abandon?
- **Search behavior**: Are they searching for terms that don't exist in your docs?

> If you're able to hop on a call and ask users, "Show me how you find answers," you might be surprised. They're often using documentation in ways you don't understand.
> — **Sarah Edwards, Documentation Engineer at Datastax**

### Testing with fresh eyes

New hires are great proxies for new users. Before they become familiar with the product, ask them to complete a task using only the documentation and narrate their thought process.

> Creating a nav structure that makes sense to everyone can be difficult, but try to find something that works for a majority of customers.
> — **Brody Klapko, Technical Writer at Stash**

> You don't have to be right on the first try. Use all available tools and perspectives to inform your decisions, but be ready to adjust based on how users actually interact with your documentation.
> — **Ethan Palm, Senior Manager of Docs at GitHub**

---

## Style and Tone — Expanded

### Enforcing style

Leverage established style guides:
- [Microsoft Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/)
- [Splunk Style Guide](https://docs.splunk.com/Documentation/StyleGuide/current/StyleGuide/Howtouse)
- [Google Developer Documentation Style Guide](https://developers.google.com/style)

Automate enforcement with linters like [Vale](https://vale.sh) or CI checks from your documentation provider.

### Consistency

> Consistency is key! You may not be complimented on your consistency, but people will absolutely notice and be frustrated by a lack thereof.
> — **CT Smith, Head of Docs at Payabli**

---

## Media — Expanded

### Decision table

| Media Type | When to use | Example | Update time |
|------------|-------------|---------|-------------|
| Screenshots | Tasks difficult to explain with words | Hidden UI element, obscure button | ~5 min |
| GIFs | Promotional purposes, short complex workflows | Product changelog | ~1 hour |
| Videos | Abstract concepts, long workflows | Tutorials | Several hours |

*Table courtesy of Idan Englander, Manager of Technical Writing at Anaconda.*

### Guidelines

- Media should be supplementary — if the workflow is clear in text alone, skip visuals
- Always provide alt text, subtitles, and transcripts for accessibility
- Balance clarity with maintainability — frequent UI changes make screenshots stale quickly

---

## SEO — Expanded

### Content basics
- Use clear H1, H2, H3 with keywords in headings
- Short paragraphs and bullet points
- Internal linking with descriptive anchor text ("Learn more about rate limiting" not "Click here")

### Technical SEO
- Meta titles: 50-60 characters; descriptions: 150-160 characters
- Descriptive alt text on images (e.g., "OAuth 2.0 API authentication flow" not "diagram")
- Mobile-friendly layout
- Up-to-date sitemap

### Advanced
- Compress images (WebP/AVIF), target page load under 3 seconds
- Add schema markup (HowTo, FAQ) for richer search results
- Keyword research with tools like Google Keyword Planner or Keywords Everywhere
- Integrate keywords naturally — never stuff

### Answer Engine Optimization (AEO)

For AI-powered search (ChatGPT, Google AI Overviews, Perplexity):

- Use clear, descriptive headings (no clever/vague labels)
- Define terms and concepts explicitly on first use
- Include specific, complete, runnable code examples
- Make each section self-contained (AI often retrieves individual sections)
- Structure data logically with tables, lists, code blocks
- Be explicit about prerequisites and requirements
- Document errors, edge cases, causes, and solutions
- Keep content current; mark deprecated features clearly

---

## Maintenance — Expanded

### Automation strategies
- **Track stale content**: Flag docs not updated in X days
- **Detect product changes**: Monitor engineering artifacts (OpenAPI specs, etc.) for changes
- **Enforce standards**: Use linters (Vale) or CI checks on every PR
- **AI maintenance**: Use AI tools to identify outdated content and suggest improvements

### Review process
- Trigger reviews based on relevance (usage, search demand, product changes), not just time
- Focus on the top 10 most-viewed pages
- Empower community contributors via open-source PRs

### When to rewrite
- Plan periodic resets every 1-2 years
- Start with a structured audit: interview support teams, analyze feedback, document gaps
- Tackle rewrites in focused sprints, prioritizing highest-impact sections

### The golden rule
Outdated or misleading documentation is worse than no documentation. If a doc is inaccurate and unfixable short-term, remove it entirely.

---

## Measuring Success

### Quantitative metrics (with context)

> Metrics that work for the sales website may not translate well for docs: is a high "time spent on page" count actually good? Were they really digging into the content, or were they struggling to find the answers?
> — **Idan Englander, Manager of Technical Writing at Anaconda**

- **Page views**: Good proxy, but could be bots or repeat visitors. High views on error pages may signal product issues.
- **Time on page**: Could mean engagement or that users are stuck.
- **CTR**: Higher clicks might mean engagement, but verify users reach the right resources.

> In general, don't fall into the trap that a bigger number means better performance.
> — **Ethan Palm, Senior Manager of Docs at GitHub**

### Qualitative signals
- User ratings and open-ended surveys
- Stakeholder input from support, engineering, customer success
- Usability testing
- AI assistant analytics (what questions do users ask?)

### Business alignment
- **Support efficiency**: Does documentation reduce ticket volume?
- **Onboarding/adoption**: Do docs help new users get up to speed faster?
- **Retention**: Do well-maintained docs reduce churn?
