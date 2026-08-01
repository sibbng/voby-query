import { $$, untrack } from 'voby';
import { focusManager } from './focusManager.ts';
import type { Query } from './query.ts';
import type { QueryKey } from './types.ts';
import { timeoutManager, type ManagedTimerId } from './timeoutManager.ts';
import type { ObserverOptions, ResolvedObserverOptions } from './types.ts';
import { shallowEqualObjects } from './utils.ts';

export class QueryObserver<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> {
  #query: Query<TQueryFnData, TError, TData, TQueryKey>;
  #resolvedOptions: ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey>;
  #listeners: Set<() => void> = new Set();
  #staleTimeoutId?: ManagedTimerId;
  #refetchIntervalId?: ManagedTimerId;
  constructor(
    query: Query<TQueryFnData, TError, TData, TQueryKey>,
    options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>,
  ) {
    this.#query = query;
    this.#resolvedOptions = this.#resolveOptions(options);
  }

  get query(): Query<TQueryFnData, TError, TData, TQueryKey> {
    return this.#query;
  }

  get resolvedOptions(): ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey> {
    return this.#resolvedOptions;
  }

  #resolveOptions(
    options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey> {
    return {
      enabled: $$(options.enabled) ?? true,
      staleTime: options.staleTime ?? 0,
      refetchInterval: options.refetchInterval ?? false,
      refetchIntervalInBackground: options.refetchIntervalInBackground ?? false,
      refetchOnWindowFocus: options.refetchOnWindowFocus ?? true,
      refetchOnReconnect: options.refetchOnReconnect ?? true,
      refetchOnMount: options.refetchOnMount ?? true,
      retryOnMount: options.retryOnMount ?? true,
      throwOnError: options.throwOnError ?? false,
      select: options.select,
      queryFn: options.queryFn,
      structuralSharing: options.structuralSharing,
      placeholderData: options.placeholderData,
      notifyOnChangeProps: options.notifyOnChangeProps ?? 'all',
      subscribed: options.subscribed ?? false,
      suspense: options.suspense ?? false,
    };
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);

    if (this.#listeners.size === 1) {
      this.#query.addObserver(this);

      const shouldFetchOnSubscribe = untrack(() => {
        if (!this.#resolvedOptions.enabled) return false;
        if (this.#query.state.fetchStatus() === 'paused') return false;

        return this.shouldFetchOnMount();
      });

      this.#updateStaleTimeout();
      this.#updateRefetchInterval();

      if (shouldFetchOnSubscribe) {
        untrack(() => {
          void this.#refetchObserverQuery();
        });
      }
    }

    return () => {
      this.#listeners.delete(listener);

      if (this.#listeners.size === 0) {
        this.#query.removeObserver(this);
        this.#clearTimers();
      }
    };
  }

  #refetchObserverQuery(): Promise<void> {
    return this.#query.refetch({
      cancelRefetch: this.#query.resolvedOptions.cancelRefetch ?? true,
    });
  }

  refetch(options?: { cancelRefetch?: boolean }): Promise<void> {
    return this.#query.refetch({
      cancelRefetch: options?.cancelRefetch ?? true,
    });
  }

  #clearTimers(): void {
    if (this.#staleTimeoutId !== undefined) {
      timeoutManager.clearTimeout(this.#staleTimeoutId);
      this.#staleTimeoutId = undefined;
    }
    if (this.#refetchIntervalId !== undefined) {
      timeoutManager.clearInterval(this.#refetchIntervalId);
      this.#refetchIntervalId = undefined;
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
    if (this.#query.cache.hasListeners()) {
      this.#query.cache.notify({
        type: 'observerResultsUpdated',
        query: this.#query as any,
      });
    }
  }

  #resolveStaleTime(): number | 'static' {
    const staleTime = this.#resolvedOptions.staleTime;
    return typeof staleTime === 'function' ? staleTime(this.#query) : staleTime;
  }

  #updateStaleTimeout(): void {
    untrack(() => {
      if (this.#staleTimeoutId !== undefined) {
        timeoutManager.clearTimeout(this.#staleTimeoutId);
        this.#staleTimeoutId = undefined;
      }

      const query = this.#query;
      const state = query.state;
      if (state.data() === undefined) return;
      if (state.isInvalidated()) return;

      const staleTime = this.#resolveStaleTime();
      if (staleTime === 'static' || staleTime === Infinity || staleTime <= 0) return;
      if (this.isStale()) return;

      this.#staleTimeoutId = timeoutManager.setTimeout(() => {
        this.#staleTimeoutId = undefined;
        this.#notify();
      }, staleTime + 1);
    });
  }

  #resolveRefetchInterval(): number | false {
    const interval = this.#resolvedOptions.refetchInterval;
    const resolved = typeof interval === 'function' ? interval(this.#query) : interval;
    return resolved ?? false;
  }

  #shouldLoadOnMount(): boolean {
    if (this.#query.state.data() !== undefined) return false;

    if (this.#query.state.status() === 'error') {
      const retryOnMount = this.#resolvedOptions.retryOnMount;
      const shouldRetryOnMount =
        typeof retryOnMount === 'function' ? retryOnMount(this.#query) : retryOnMount;

      return shouldRetryOnMount !== false;
    }

    return true;
  }

  #updateRefetchInterval(): void {
    untrack(() => {
      if (this.#refetchIntervalId !== undefined) {
        timeoutManager.clearInterval(this.#refetchIntervalId);
        this.#refetchIntervalId = undefined;
      }

      const interval = this.#resolveRefetchInterval();
      if (!interval) return;

      this.#refetchIntervalId = timeoutManager.setTimeout(() => {
        void this.#refetchObserverQuery();
        this.#refetchIntervalId = timeoutManager.setInterval(async () => {
          if (this.#resolvedOptions.refetchIntervalInBackground || focusManager.isFocused()) {
            await this.#refetchObserverQuery();
          }
        }, interval as number) as any;
      }, interval as number) as any;
    });
  }

  shouldFetchOnMount(): boolean {
    if (this.#shouldLoadOnMount()) return true;

    if (this.#query.state.data() === undefined) return false;

    const refetchOnMount = this.#resolvedOptions.refetchOnMount;
    if (typeof refetchOnMount === 'function') {
      return !!refetchOnMount(this.#query);
    }
    if (refetchOnMount === 'always') return true;
    if (refetchOnMount === false) return false;
    return this.isStale();
  }

  shouldFetchOnWindowFocus(): boolean {
    const refetchOnWindowFocus = this.#resolvedOptions.refetchOnWindowFocus;
    if (typeof refetchOnWindowFocus === 'function') {
      return !!refetchOnWindowFocus(this.#query);
    }
    if (refetchOnWindowFocus === 'always') return true;
    if (refetchOnWindowFocus && this.isStale()) return true;
    return false;
  }

  shouldFetchOnReconnect(): boolean {
    const refetchOnReconnect = this.#resolvedOptions.refetchOnReconnect;
    if (typeof refetchOnReconnect === 'function') {
      return !!refetchOnReconnect(this.#query);
    }
    if (refetchOnReconnect === 'always') return true;
    if (refetchOnReconnect && this.isStale()) return true;
    return false;
  }

  isEnabled(): boolean {
    return this.#resolvedOptions.enabled;
  }

  isStale(): boolean {
    if (!this.#resolvedOptions.enabled) return false;
    const staleTime = this.#resolveStaleTime();
    return this.#query.isStaleByTime(staleTime);
  }

  onQueryUpdate(): void {
    this.#updateStaleTimeout();
  }

  isPlaceholderData(): boolean {
    return this.#query.state.isPending() && this.#resolvedOptions.placeholderData !== undefined;
  }

  getCurrentResult() {
    const query = this.#query;
    const state = query.state;
    const options = this.#resolvedOptions;

    const result = {
      ...state,
      isEnabled: options.enabled,
      isStale: this.isStale(),
      isPlaceholderData: this.isPlaceholderData(),
      refetch: query.refetch,
      cancel: query.cancel,
      promise: (): Promise<Awaited<TData>> => {
        const d = state.data();
        if (d !== undefined) return Promise.resolve(d as Awaited<TData>);
        return (query.fetchPromise ?? query.fetch()).then(() => state.data()! as Awaited<TData>);
      },
    };

    return result;
  }

  setOptions(options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>): void {
    const previousOptions = this.#resolvedOptions;
    this.#resolvedOptions = this.#resolveOptions(options);

    if (!shallowEqualObjects(previousOptions, this.#resolvedOptions)) {
      this.#query.cache.notify({
        type: 'observerOptionsUpdated',
        query: this.#query as any,
        observer: this,
      });
    }

    const shouldFetchOnOptionsUpdate = untrack(
      () =>
        this.#listeners.size > 0 &&
        previousOptions.enabled === false &&
        this.#resolvedOptions.enabled &&
        this.#query.state.fetchStatus() !== 'paused',
    );

    this.#updateStaleTimeout();
    this.#updateRefetchInterval();

    if (shouldFetchOnOptionsUpdate) {
      untrack(() => {
        void this.#refetchObserverQuery();
      });
    }

    this.#notify();
  }

  destroy(): void {
    this.#clearTimers();
    this.#listeners.clear();
  }
}
