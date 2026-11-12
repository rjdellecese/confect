---
"@confect/server": minor
---

Add `.filter` to queries returned by `index` and `search`, accepting native Convex expressions over encoded fields before any terminal operation while returning decoded documents. These query builders can be branched and executed repeatedly without consuming the original builder.
