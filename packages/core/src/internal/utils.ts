/**
 * Install a lazy memoised property on `target`. The first access runs
 * `compute()` and replaces the getter with a plain, non-writable data
 * property whose value is the computed result. Subsequent accesses hit
 * the V8 fast path for own data properties — no function call, identical
 * returned reference — so first and second-and-subsequent accesses are
 * observably indistinguishable.
 *
 * The replacement property is `enumerable: true` so the lazy property
 * still participates in `Object.keys` / `JSON.stringify` after it
 * materialises, matching the shape of a plain data property. The property
 * is also `enumerable` before materialising, so presence checks
 * (`"key" in target`, `Object.hasOwn(target, key)`) observe it without
 * forcing the computation.
 */
export const defineLazy = <T extends object, K extends PropertyKey>(
  target: T,
  key: K,
  compute: () => unknown,
): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get(this: T) {
      const value = compute();
      Object.defineProperty(this, key, {
        value,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      return value;
    },
  });
};
