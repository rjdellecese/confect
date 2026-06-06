---
name: writing-commit-messages
description: >-
  Write thoughtful, prose-style git commit messages with a sentence-case
  imperative-mood subject under 50 characters, a blank line, then a
  Markdown-formatted body that explains *why* the change was needed — never just
  *what* it did. Use this skill whenever writing a commit message, running `git
  commit`, preparing to commit code on the user's behalf, or drafting PR
  descriptions that follow commit-message conventions — even when the user
  doesn't explicitly ask for commit-message help. Also use when the user asks
  about git commit style or conventions.
---

# Commit Messages

A commit message is documentation written for your future self and your colleagues. The diff already shows _what_ changed; the message exists to explain _why_ it needed to change, what was wrong before, and what reviewers or future readers should watch for. The size of the diff has nothing to do with the appropriate size of the message — a one-character whitespace fix may deserve three paragraphs of context, and a 500-line mechanical refactor may need only two sentences.

## Structure

Every commit message has this shape:

```
Subject line in sentence case, imperative mood, under 50 chars

A body that explains the motivation for this change. Use as many paragraphs as you need.

If the old behavior was wrong, describe what it was and why. Then describe the new behavior and how it addresses the problem.

Mention tradeoffs, alternatives considered, or side effects that reviewers should watch for.

Refs: #123
```

The blank line between subject and body is required. Many tools (GitHub, `git log --oneline`, `git shortlog`) depend on it to distinguish the two.

## Markdown

The body is rendered as Markdown by GitHub, GitLab, and most code-review tools. Use formatting — inline `code` for symbols and paths, fenced code blocks for commands or output, lists for enumerated points, links for issues and external references — where it aids readability. Don't decorate prose with bold or headings for their own sake.

## Rules

1. **Separate subject from body with a blank line.**
2. **Limit the subject line to 50 characters.** 72 is the hard ceiling; GitHub truncates beyond that.
3. **Use sentence case for the subject.** Capitalize only the first word. Leave the rest lowercase, except proper nouns, acronyms (`API`, `README`), and code identifiers (`useState`, `CartContext`, file paths), which keep their natural casing.
4. **Do not end the subject line with a period.**
5. **Use the imperative mood in the subject.** Write "Fix bug" not "Fixed bug" or "Fixes bug". A reliable test: the subject should complete the sentence "If applied, this commit will \_\_\_".
6. **Use the body to explain _what_ and _why_, not _how_.** The how is in the diff.

## Writing the subject

The subject is the highest-leverage part of the message — it's what shows up in `git log --oneline`, GitHub PR titles, blame views, and `git bisect` output. Treat it like a headline.

- Be specific. "Fix login bug" → "Fix logout redirect when session has expired".
- Drop filler verbs like "Update", "Change", "Modify" when you can name what you actually did.
- Don't invent a scope prefix (`[auth]:`, `auth:`) unless the surrounding history uses one.
- If you can't fit the subject in 50 chars, the commit is probably doing too much — consider splitting it.

## Writing the body

A good body answers three questions, in roughly this order:

1. **Why was this change needed?** What problem does it solve? What was the symptom, motivation, or upstream request?
2. **What was wrong with the old behavior?** Describe it concretely. This is the hardest thing to reconstruct from the diff later, so it's the highest-value content.
3. **What does the new behavior do?** A high-level description — not a line-by-line walkthrough of the diff.

Then add anything else a reviewer or future reader needs:

- Tradeoffs and alternatives considered
- Side effects, edge cases, performance implications
- Follow-ups that are intentionally out of scope
- Links to issues, RFCs, related commits, or external discussion

If the change is genuinely trivial and self-explanatory ("Fix typo in README"), the body is optional. For anything non-obvious, write it. A useful test: would a reader five years from now understand this commit without any other context?

## Examples

**Bad — subject only, no context:**

```
Update files
```

**Bad — narrates the diff instead of explaining motivation:**

```
Change useState to useReducer in CartContext

Refactored the cart state management to use useReducer instead of useState. Added an action dispatcher and moved the state updates into a reducer function. Updated all the consumers.
```

A reader can see all of that themselves. The message adds nothing.

**Good — explains why, what was wrong, and tradeoffs considered:**

```
Switch cart state to useReducer

The cart was using `useState` with deeply nested updates, which made several recent bugs (#412, #418) hard to trace — each consumer was mutating state in slightly different ways and the order of updates mattered.

Moving to a reducer centralizes the transitions and makes the valid state machine explicit. As a side effect, this also fixes #412 by serializing the "add item" and "apply coupon" actions.

Considered Zustand but kept the change minimal to avoid pulling in a new dependency for one context.
```

**Good — trivial change, body legitimately omitted:**

```
Fix typo in installation docs
```

## When committing on the user's behalf

If running `git commit` as part of an agentic task:

- Stage and review the diff first; the message should reflect what's actually in the diff, not what was planned.
- If the change touches multiple unrelated concerns, propose splitting it into multiple commits before writing the message.
- Use `git commit -F <file>` or a heredoc rather than `-m "..."` for multi-line messages — `-m` makes multi-paragraph bodies awkward.
- Never invent issue numbers, ticket IDs, or co-author trailers. Only include them if the user provided them or they're visible in the repo context.
