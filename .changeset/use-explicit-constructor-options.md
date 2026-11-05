---
"@confect/core": major
"@confect/server": major
---

Replace positional reference and provenance constructors, and the curried handler runner, with single options objects.

### Breaking Changes

- Call `Ref.make({ namespace, spec, groupMiddlewareAttachments? })` instead of passing the namespace, spec, and optional middleware attachments positionally.
- Call `FunctionProvenance.Confect({ args, returns, error? })` and `FunctionProvenance.ConfectPaginated({ userArgs, item, error? })`. Keep passing schema thunks; constructing provenance still does not evaluate them.
- Call `RegisteredFunction.runHandlerPromise({ effect, errorSchema, runOptions? })` instead of `runHandlerPromise(errorSchema, runOptions)(effect)`. Each invocation still runs independently with its own scheduler and console context.

To migrate, wrap each call's existing arguments in the named object; the old positional and curried signatures are no longer available.

**Before:**

```ts
Ref.make("notes", noteSpec);
FunctionProvenance.Confect(args, returns, error);
FunctionProvenance.ConfectPaginated(userArgs, item, error);
RegisteredFunction.runHandlerPromise(errorSchema, runOptions)(effect);
```

**After:**

```ts
Ref.make({ namespace: "notes", spec: noteSpec });
FunctionProvenance.Confect({ args, returns, error });
FunctionProvenance.ConfectPaginated({ userArgs, item, error });
RegisteredFunction.runHandlerPromise({ effect, errorSchema, runOptions });
```
