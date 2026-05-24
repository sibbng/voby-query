import { $$, useResolved } from 'voby';
import type { MutationKey } from './useMutation';
import type { QueryKey, QueryOptions } from './useQuery';

export function queryOptions<Q extends QueryOptions>(options: Q): Q {
  return options;
}

// #region Utils

export const hashFn = (queryKey: QueryKey | MutationKey): string => {
  return JSON.stringify(resolveKey(queryKey), (_, val) => {
    return isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce(
            (result, key) => {
              result[key] = (val as Record<string, unknown>)[key];
              return result;
            },
            {} as Record<string, unknown>,
          )
      : val;
  });
};

export const resolveKey = (queryKey: QueryKey | MutationKey): unknown[] => {
  const resolved = useResolved($$(queryKey));
  return Array.isArray(resolved) ? resolved.map((item) => $$(item)) : [];
};

export const partialMatchKey = (
  filterKey: QueryKey | MutationKey,
  queryKey: QueryKey | MutationKey,
): boolean => {
  const resolvedFilterKey = resolveKey(filterKey);
  const resolvedQueryKey = resolveKey(queryKey);

  if (resolvedFilterKey.length > resolvedQueryKey.length) return false;

  return resolvedFilterKey.every((value, index) => deepEqual(value, resolvedQueryKey[index]));
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
};

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any): o is object {
  if (!hasObjectPrototype(o)) {
    return false;
  }

  // If has no constructor
  const ctor = o.constructor;
  if (ctor === undefined) {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  }

  // Handles Objects created by Object.create(<arbitrary prototype>)
  if (Object.getPrototypeOf(o) !== Object.prototype) {
    return false;
  }

  // Most likely a plain Object
  return true;
}

function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === '[object Object]';
}

export function isPlainArray(value: unknown) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep<T>(a: unknown, b: T): T;
export function replaceEqualDeep(a: any, b: any): any {
  if (a === b) {
    return a;
  }

  const array = isPlainArray(a) && isPlainArray(b);

  if (array || (isPlainObject(a) && isPlainObject(b))) {
    const aItems = array ? a : Object.keys(a);
    const aSize = aItems.length;
    const bItems = array ? b : Object.keys(b);
    const bSize = bItems.length;
    const copy: any = array ? [] : {};

    let equalItems = 0;

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i];
      if (
        ((!array && aItems.includes(key)) || array) &&
        a[key] === undefined &&
        b[key] === undefined
      ) {
        copy[key] = undefined;
        equalItems++;
      } else {
        copy[key] = replaceEqualDeep(a[key], b[key]);
        if (copy[key] === a[key] && a[key] !== undefined) {
          equalItems++;
        }
      }
    }

    return aSize === bSize && equalItems === aSize ? a : copy;
  }

  return b;
}
