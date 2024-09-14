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

## Setup

### 1. Define your database schema

{% hint style="info" %}
Not every Effect `Schema` is valid for use in Confect. See [effect-schema-restrictions.md](effect-schema-restrictions.md "mention") for more information on what's permitted and what's not.
{% endhint %}

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/schema.ts" fullWidth="false" %}

### 2. Generate your Convex function constructors and types.

{% @github-files/github-code-block url="https://github.com/rjdellecese/confect/blob/main/example/convex/confect.ts" %}

3. Write some Convex functions!
