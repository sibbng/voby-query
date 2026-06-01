import type { Observable } from 'voby';
import { createCacheState } from './cache.ts';
import {
  createMutation,
  resolveMutationHash,
  resolveMutationOptions,
  type Mutation,
} from './mutation.ts';
import type {
  MutationCache as MutationCacheType,
  MutationFilters,
  MutationOptions,
  QueryClient,
} from './types.ts';
import { partialMatchKey } from './utils.ts';

const matchesMutationFilters = <TMutation extends Mutation<any, any, any, any>>(
  mutation: TMutation,
  filters?: MutationFilters,
) => {
  if (!filters) return true;

  const { mutationKey, exact = false, status, predicate } = filters;

  if (mutationKey) {
    const currentMutationKey = mutation.resolvedOptions.mutationKey;
    if (!currentMutationKey) return false;

    const matchesKey = exact
      ? resolveMutationHash(currentMutationKey) === resolveMutationHash(mutationKey)
      : partialMatchKey(mutationKey, currentMutationKey);
    if (!matchesKey) return false;
  }

  if (status && mutation.state.status() !== status) return false;
  if (predicate && !predicate(mutation)) return false;

  return true;
};

export class MutationCache<
  TMutation extends Mutation<any, any, any, any> = Mutation<any, any, any, any>,
> {
  readonly version: Observable<number>;

  private readonly mutations: Map<string, TMutation>;
  private readonly bump: () => void;
  private nextId: number;

  constructor(cache?: Map<string, TMutation>) {
    const { map, version, bump } = createCacheState(
      cache as (Map<string, TMutation> & { version?: Observable<number> }) | undefined,
    );
    this.mutations = map;
    this.version = version;
    this.bump = bump;
    this.nextId = 0;
  }

  get size() {
    return this.mutations.size;
  }

  has(cacheKey: string) {
    return this.mutations.has(cacheKey);
  }

  get(cacheKey: string) {
    return this.mutations.get(cacheKey);
  }

  set(cacheKey: string, mutation: TMutation) {
    this.mutations.set(cacheKey, mutation);
    this.bump();
    return this;
  }

  delete(cacheKey: string) {
    const mutation = this.mutations.get(cacheKey);
    if (!mutation) return false;

    this.remove(mutation);
    return true;
  }

  keys() {
    return this.mutations.keys();
  }

  values() {
    return this.mutations.values();
  }

  entries() {
    return this.mutations.entries();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  getAll() {
    return Array.from(this.mutations.values());
  }

  findAll(filters?: MutationFilters) {
    return this.getAll().filter((mutation) => matchesMutationFilters(mutation, filters));
  }

  build<TData = unknown, TError = unknown, TVariables = TData, TContext = unknown>(
    queryClient: QueryClient,
    options: MutationOptions<TData, TError, TVariables, TContext>,
  ) {
    const resolvedOptions = resolveMutationOptions(queryClient, options);
    const mutationHash = resolveMutationHash(resolvedOptions.mutationKey);
    const existingMutation = mutationHash
      ? (this.get(mutationHash) as Mutation<TData, TError, TVariables, TContext> | undefined)
      : undefined;

    if (existingMutation) {
      existingMutation.resolvedOptions = resolvedOptions;
      return existingMutation;
    }

    const cacheKey = mutationHash ?? `mutation:${++this.nextId}`;
    const mutation = createMutation({
      mutationCache: this as unknown as MutationCacheType,
      cacheKey,
      mutationHash,
      resolvedOptions,
    });

    this.set(cacheKey, mutation as unknown as TMutation);

    return mutation;
  }

  remove(mutation: TMutation) {
    const cachedMutation = this.mutations.get(mutation.cacheKey);
    if (cachedMutation !== mutation) return;

    this.mutations.delete(mutation.cacheKey);
    mutation.destroy();
    this.bump();
  }

  clear() {
    const mutations = this.getAll();
    if (mutations.length === 0) return;

    this.mutations.clear();

    for (const mutation of mutations) {
      mutation.destroyDisposer();
      if (mutation.instances === 0) {
        mutation.destroy();
      }
    }

    this.bump();
  }
}

export const createMutationCache = <TMutation extends Mutation<any, any, any, any>>(
  cache?: MutationCache<TMutation> | Map<string, TMutation>,
) => {
  return cache instanceof MutationCache ? cache : new MutationCache(cache);
};
