# Getting started

## Installation

```bash
npm install @rjdellecese/confect
```

```bash
yarn add @rjdellecese/confect
```

```bash
pnpm add @rjdellecese/confect
```

### `exactOptionalPropertyTypes`

Normally when using the Effect schema library,  it's recommended to set `exactOptionalPropertyTypes` in your `tsconfig.json` to `true`. However, this configuration is not supported by `convex-js` at the moment, so to use Confect, you must set it to `false` instead.

To understand the implications of this, see [this explanation](https://effect.website/docs/guides/schema/introduction#understanding-exactoptionalpropertytypes) in the Effect docs.

## Setup

### 1. Define your database schema

{% hint style="info" %}
Not every Effect `Schema` is valid for use in Confect. See [schema-restrictions.md](schema-restrictions.md "mention") for more information about what's permitted and what's not.
{% endhint %}

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/schema.ts" fullWidth="false" %}

### 2. Generate your Convex function constructors and types.

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/confect.ts" %}

### 3. Write some Convex functions!

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/functions.ts" %}

## Example project

The above files are pulled from a real example project. Check it out [here](https://github.com/rjdellecese/confect/tree/main/example).
