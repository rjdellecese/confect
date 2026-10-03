# Confect 🧁

Confect is a framework that deeply integrates Effect with Convex. It's more than just Effect bindings! Confect allows you to:

- Define your Convex database schema using Effect schemas.
- Write Convex function args and returns validators using Effect's schema library.
- Use Confect functions to automatically decode and encode your data according to your Effect schema definitions for end-to-end rich types, from client to function to database (and back).
- Add reusable, type-safe middleware to function groups or individual functions to provide Effect services and run logic around handlers.
- Declare typed errors on functions and middleware using Effect schemas, then handle the decoded errors at every call site.
- Use Effect's native HTTP API modules to define your HTTP API.
- Access Convex platform capabilities via Effect services.

Want to learn more? Read the [docs](https://confect.dev)!
