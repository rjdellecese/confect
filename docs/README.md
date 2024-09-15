# Introduction

{% hint style="warning" %}
Confect is pre-1.0 and its API is not yet stable.
{% endhint %}

Confect is a framework that deeply integrates [Effect](https://effect.website) with [Convex](https://convex.dev). But it's more than just Effect bindings! Confect allows you to:

* Define your Convex database schema using Effect schemas.
* Use Confect functions to automatically decode and encode your data according to your Effect schema definitions when reading from and writing to the database.
* Write Convex function `args` and `returns` validators using Effect's Schema library.
* Use Effect-ified versions of all of the Convex server APIs (`Promise`s become `Effect`s, `A | null`s becomes `Option<A>`s, etc.).

It's recommended that you have some familiarity with both Effect and Convex, including the vanilla `convex-js` APIs, before getting started with Confect.
