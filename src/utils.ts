import { $$ } from 'voby';
import type { Mutation } from './mutation.ts';
import type { Query } from './query.ts';
import type { FetchStatus, MutationKey, QueryKey } from './types.ts';

// #region Utils

export function noop(): undefined {
  return undefined;
}

export function functionalUpdate<TInput, TOutput>(
  updater: TOutput | ((input: TInput) => TOutput),
  input: TInput,
): TOutput {
  return typeof updater === 'function' ? (updater as (input: TInput) => TOutput)(input) : updater;
}

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

export const hashKey = hashFn;

export function hashQueryKeyByOptions<TQueryKey extends QueryKey = QueryKey>(
  queryKey: TQueryKey,
  options?: { queryKeyHashFn?: (key: TQueryKey) => string },
): string {
  const hashFnOption = options?.queryKeyHashFn || hashKey;
  return hashFnOption(queryKey);
}

const resolveKey = (queryKey: QueryKey | MutationKey): unknown[] => {
  const resolved = $$(queryKey);
  return Array.isArray(resolved) ? resolved.map((item) => $$(item)) : [];
};

export const partialMatchKey = (
  filterKey: QueryKey | MutationKey,
  queryKey: QueryKey | MutationKey,
): boolean => {
  const resolvedFilterKey = resolveKey(filterKey);
  const resolvedQueryKey = resolveKey(queryKey);

  if (resolvedFilterKey.length > resolvedQueryKey.length) return false;

  return resolvedFilterKey.every((value, index) =>
    partialDeepMatch(value, resolvedQueryKey[index]),
  );
};

const partialDeepMatch = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length > b.length) return false;
    return a.every((value, index) => partialDeepMatch(value, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    return aKeys.every((key) =>
      partialDeepMatch((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
};

interface QueryFilters<TQueryKey extends QueryKey = QueryKey> {
  type?: 'all' | 'active' | 'inactive';
  exact?: boolean;
  predicate?: (query: Query) => boolean;
  queryKey?: TQueryKey;
  stale?: boolean;
  fetchStatus?: FetchStatus;
}

export function matchQuery<TQuery extends Query>(
  filters: QueryFilters | undefined,
  query: TQuery,
): boolean {
  if (!filters) return true;
  const { type = 'all', exact, fetchStatus, predicate, queryKey, stale } = filters;

  if (queryKey) {
    if (exact) {
      if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.resolvedOptions)) {
        return false;
      }
    } else if (!partialMatchKey(queryKey, query.resolvedOptions.queryKey)) {
      return false;
    }
  }

  if (type !== 'all') {
    const isActive = query.isActive;
    if (type === 'active' && !isActive) return false;
    if (type === 'inactive' && isActive) return false;
  }

  if (typeof stale === 'boolean' && query.state.isStale() !== stale) return false;

  if (fetchStatus && fetchStatus !== query.state.fetchStatus()) return false;

  if (predicate && !predicate(query)) return false;

  return true;
}

interface MutationFilters<TMutation extends Mutation = Mutation> {
  exact?: boolean;
  predicate?: (mutation: TMutation) => boolean;
  mutationKey?: MutationKey;
  status?: string;
}

export function matchMutation<TMutation extends Mutation>(
  filters: MutationFilters<TMutation> | undefined,
  mutation: TMutation,
): boolean {
  if (!filters) return true;

  const { exact, status, predicate, mutationKey } = filters;

  if (mutationKey) {
    if (!mutation.resolvedOptions.mutationKey) return false;

    if (exact) {
      if (hashFn(mutation.resolvedOptions.mutationKey) !== hashFn(mutationKey)) return false;
    } else if (!partialMatchKey(mutationKey, mutation.resolvedOptions.mutationKey)) {
      return false;
    }
  }

  if (status && mutation.state.status() !== status) return false;

  if (predicate && !predicate(mutation)) return false;

  return true;
}

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

export function replaceData<TData>(
  prevData: TData | undefined,
  data: TData,
  options: { structuralSharing?: unknown },
): TData {
  if (typeof options.structuralSharing === 'function') {
    return options.structuralSharing(prevData, data) as TData;
  }
  if (options.structuralSharing !== false) {
    return replaceEqualDeep(prevData, data);
  }
  return data;
}

export function addToEnd<T>(items: Array<T>, item: T, max = 0): Array<T> {
  const newItems = [...items, item];
  return max && newItems.length > max ? newItems.slice(1) : newItems;
}

export function addToStart<T>(items: Array<T>, item: T, max = 0): Array<T> {
  const newItems = [item, ...items];
  return max && newItems.length > max ? newItems.slice(0, -1) : newItems;
}

export const skipToken = Symbol('skipToken');

export function shouldThrowError<T extends (...args: Array<any>) => boolean>(
  throwOnError: boolean | T | undefined,
  params: Parameters<T>,
): boolean {
  if (typeof throwOnError === 'function') {
    return throwOnError(...params);
  }
  return !!throwOnError;
}

export function ensureSuspenseTimers<
  T extends {
    staleTime?: number | 'static' | ((...args: any[]) => number | 'static');
    gcTime?: number;
  },
>(options: T): T {
  const clamp = (value: number | 'static' | undefined) =>
    value === 'static' ? value : Math.max(value ?? 1000, 1000);

  const originalStaleTime = options.staleTime;
  return {
    ...options,
    staleTime: (typeof originalStaleTime === 'function'
      ? (((...args: Parameters<typeof originalStaleTime>) => {
          const result = originalStaleTime(...args);
          return typeof result === 'number' ? Math.max(result, 1000) : result;
        }) as typeof originalStaleTime)
      : clamp(originalStaleTime)) as T['staleTime'],
    ...(options.gcTime !== undefined && { gcTime: Math.max(options.gcTime, 1000) }),
  };
}

export function ensureQueryFn(
  options: { queryFn?: unknown; queryHash?: string },
  fetchOptions?: { initialPromise?: Promise<unknown> },
): (...args: Array<unknown>) => Promise<unknown> {
  if (options.queryFn === skipToken) {
    console.error(
      `Attempted to invoke queryFn when set to skipToken. This is likely a configuration error. Query hash: '${options.queryHash}'`,
    );
  }

  if (!options.queryFn && fetchOptions?.initialPromise) {
    return () => fetchOptions.initialPromise!;
  }

  if (!options.queryFn || options.queryFn === skipToken) {
    return () => Promise.reject(new Error(`Missing queryFn: '${options.queryHash}'`));
  }

  return options.queryFn as (...args: Array<unknown>) => Promise<unknown>;
}
