# Confect 🧁

Confect is a framework that deeply integrates Effect with Convex. It's more than just Effect bindings! Confect allows you to:

* Define your Convex database schema using Effect schemas.
* Use Confect functions to automatically decode and encode your data according to your Effect schema definitions when reading from and writing to the database.
* Write Convex function args and returns validators using Effect's schema library.
* Use Effect-ified versions of all of the Convex server APIs (`Promises` become `Effect`s, `A | null`s becomes `Option<A>`s, etc.).

Want to learn more? Read the [docs](https://rjdellecese.gitbook.io/confect)!
