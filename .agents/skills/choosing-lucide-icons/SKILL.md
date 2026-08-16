---
name: choosing-lucide-icons
description: Finds Lucide icons, categories, and React usage examples. Use when selecting or implementing icons for the Mintlify documentation site.
mcpServers:
  lucide:
    command: bash
    args:
      - -lc
      - mise exec -- pnpm dlx lucide-icons-mcp --stdio
    includeTools:
      - search_icons
      - search_categories
      - fuzzy_search_icons
      - fuzzy_search_categories
      - get_icon_usage_examples
      - list_all_icons_by_category
      - list_all_categories
---

# Choosing Lucide icons

Use the Lucide MCP tools to find icons by name, concept, or category. Prefer an
existing icon whose established meaning matches the documentation concept over
a merely decorative choice.

When editing `apps/docs/docs.json`, use the icon's Lucide name in the form
expected by Mintlify. For React code, use `get_icon_usage_examples` to confirm
the component import and usage.
