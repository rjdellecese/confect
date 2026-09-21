---
"@confect/server": patch
---

Reject negative, fractional, or non-finite read limits in `QueryStream.paginate` before reading documents.
