import {
  createMutation,
  resolveMutationHash,
  resolveMutationOptions,
  type Mutation,
} from './mutation.ts';
import { Subscribable } from './subscribable.ts';
import type {
  MutationCache as MutationCacheType,
  MutationFilters,
  MutationFunctionContext,
  MutationOptions,
  QueryClient,
} from './types.ts';
import { matchMutation, noop } from './utils.ts';

export interface MutationCacheConfig {
  onError?: (
    error: unknown,
    variables: unknown,
    context: unknown,
    mutation: Mutation<any, any, any, any>,
    mutationFunctionContext: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onSuccess?: (
    data: unknown,
    variables: unknown,
    context: unknown,
    mutation: Mutation<any, any, any, any>,
    mutationFunctionContext: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onMutate?: (
    variables: unknown,
    mutation: Mutation<any, any, any, any>,
    mutationFunctionContext: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onSettled?: (
    data: unknown,
    error: unknown,
    variables: unknown,
    context: unknown,
    mutation: Mutation<any, any, any, any>,
    mutationFunctionContext: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
}

export type MutationCacheNotifyEvent =
  | { type: 'added'; mutation: Mutation<any, any, any, any> }
  | { type: 'removed'; mutation: Mutation<any, any, any, any> }
  | { type: 'updated'; mutation: Mutation<any, any, any, any> };

type MutationCacheListener = (event: MutationCacheNotifyEvent) => void;

export class MutationCache<
  TMutation extends Mutation<any, any, any, any> = Mutation<any, any, any, any>,
> extends Subscribable<MutationCacheListener> {
  public readonly config: MutationCacheConfig;
  private readonly mutations: Map<string, TMutation>;
  private readonly scopes: Map<string, TMutation[]>;
  private nextId: number;

  constructor(
    config: MutationCacheConfig | Map<string, TMutation> = {},
    cache?: Map<string, TMutation>,
  ) {
    super();
    const initialCache = config instanceof Map ? config : cache;
    this.config = config instanceof Map ? {} : config;
    this.mutations = new Map(initialCache);
    this.scopes = new Map();
    for (const mutation of this.mutations.values()) {
      this.addToScope(mutation);
    }
    this.nextId = 0;
  }

  notify(event: MutationCacheNotifyEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
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
    this.addToScope(mutation);
    this.notify({ type: 'added', mutation: mutation as Mutation<any, any, any, any> });
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

  resumePausedMutations(): Promise<unknown> {
    const pausedMutations = this.getAll().filter((mutation) => mutation.state.isPaused());
    return Promise.all(pausedMutations.map((mutation) => mutation.continue().catch(noop)));
  }

  findAll(filters?: MutationFilters) {
    return this.getAll().filter((mutation) => matchMutation(filters, mutation));
  }

  find(filters?: MutationFilters) {
    const defaultedFilters = { exact: true, ...filters };
    return this.getAll().find((mutation) => matchMutation(defaultedFilters, mutation));
  }

  canRun(mutation: Mutation<any, any, any, any>) {
    const scopeId = mutation.resolvedOptions.scope?.id;
    if (scopeId === undefined) return true;

    const firstPendingMutation = this.scopes
      .get(scopeId)
      ?.find((candidate) => candidate.state.isPending());
    return !firstPendingMutation || firstPendingMutation === mutation;
  }

  runNext(mutation: Mutation<any, any, any, any>): Promise<unknown> {
    const scopeId = mutation.resolvedOptions.scope?.id;
    if (scopeId === undefined) return Promise.resolve();

    const nextMutation = this.scopes
      .get(scopeId)
      ?.find((candidate) => candidate !== mutation && candidate.state.isPaused());
    return nextMutation?.continue() ?? Promise.resolve();
  }

  build<TData = unknown, TError = unknown, TVariables = TData, TContext = unknown>(
    queryClient: QueryClient,
    options: MutationOptions<TData, TError, TVariables, TContext>,
  ) {
    const resolvedOptions = resolveMutationOptions(queryClient, options);
    const mutationHash = resolveMutationHash(resolvedOptions.mutationKey);
    const cacheKey = `mutation:${++this.nextId}`;
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
    this.removeFromScope(mutation);
    mutation.destroy();
    this.notify({ type: 'removed', mutation: mutation as Mutation<any, any, any, any> });
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
    this.scopes.clear();
    this.notify({
      type: 'removed',
      mutation: mutations[mutations.length - 1] as Mutation<any, any, any, any>,
    });
  }

  private addToScope(mutation: TMutation) {
    const scopeId = mutation.resolvedOptions.scope?.id;
    if (scopeId === undefined) return;

    const scopedMutations = this.scopes.get(scopeId);
    if (scopedMutations) {
      scopedMutations.push(mutation);
    } else {
      this.scopes.set(scopeId, [mutation]);
    }
  }

  private removeFromScope(mutation: TMutation) {
    const scopeId = mutation.resolvedOptions.scope?.id;
    if (scopeId === undefined) return;

    const scopedMutations = this.scopes.get(scopeId);
    if (!scopedMutations) return;

    const index = scopedMutations.indexOf(mutation);
    if (index !== -1) scopedMutations.splice(index, 1);
    if (scopedMutations.length === 0) this.scopes.delete(scopeId);
  }
}

export const createMutationCache = <TMutation extends Mutation<any, any, any, any>>(
  config?: MutationCacheConfig | MutationCache<TMutation> | Map<string, TMutation>,
  cache?: Map<string, TMutation>,
) => {
  if (config instanceof MutationCache) return config;
  if (typeof config === 'object' && config !== null && !(config instanceof Map)) {
    return new MutationCache<TMutation>(config, cache);
  }
  return new MutationCache<TMutation>({}, config as Map<string, TMutation> | undefined);
};
