import { $$, untrack } from 'voby';
import { focusManager } from './focusManager.ts';
import { onlineManager } from './onlineManager.ts';
import type { Query } from './query.ts';
import type { QueryKey } from './types.ts';
import { timeoutManager, type ManagedTimerId } from './timeoutManager.ts';
import type { ObserverOptions, ResolvedObserverOptions } from './types.ts';

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
  #focusCleanup?: () => void;
  #onlineCleanup?: () => void;
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
      this.#subscribeToManagers();
      this.#updateStaleTimeout();
      this.#updateRefetchInterval();
    }

    return () => {
      this.#listeners.delete(listener);

      if (this.#listeners.size === 0) {
        this.#query.removeObserver(this);
        this.#clearTimers();
        this.#clearManagerSubscriptions();
      }
    };
  }

  #subscribeToManagers(): void {
    this.#clearManagerSubscriptions();

    this.#focusCleanup = focusManager.subscribe(async () => {
      if (focusManager.isFocused() && this.shouldFetchOnWindowFocus()) {
        await this.#refetchObserverQuery();
      }
    });

    this.#onlineCleanup = onlineManager.subscribe(async () => {
      if (
        onlineManager.isOnline() &&
        this.#query.fetchMachine.getState() !== 'paused' &&
        this.shouldFetchOnReconnect()
      ) {
        await this.#refetchObserverQuery();
      }
    });
  }

  #clearManagerSubscriptions(): void {
    this.#focusCleanup?.();
    this.#focusCleanup = undefined;
    this.#onlineCleanup?.();
    this.#onlineCleanup = undefined;
  }

  #refetchObserverQuery(): Promise<void> {
    return this.#query.refetch({
      cancelRefetch: this.#query.resolvedOptions.cancelRefetch ?? true,
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
  }

  #resolveStaleTime(): number | 'static' {
    const staleTime = this.#resolvedOptions.staleTime;
    return typeof staleTime === 'function' ? staleTime(this.#query) : staleTime;
  }

  #updateStaleTimeout(): void {
    untrack(() => {
      this.#query.state.isStale(
        this.#resolvedOptions.enabled && this.#query.isStaleByTime(this.#resolveStaleTime()),
      );

      if (this.#staleTimeoutId !== undefined) {
        timeoutManager.clearTimeout(this.#staleTimeoutId);
        this.#staleTimeoutId = undefined;
      }

      const query = this.#query;
      if (query.state.data() === undefined) return;

      const staleTime = this.#resolveStaleTime();
      if (staleTime === 'static' || staleTime === Infinity || staleTime <= 0) return;

      this.#staleTimeoutId = timeoutManager.setTimeout(() => {
        this.#staleTimeoutId = undefined;
        this.#notify();
      }, staleTime);
    });
  }

  #resolveRefetchInterval(): number | false {
    const interval = this.#resolvedOptions.refetchInterval;
    const resolved = typeof interval === 'function' ? interval(this.#query) : interval;
    return resolved ?? false;
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
    const refetchOnMount = this.#resolvedOptions.refetchOnMount;
    if (typeof refetchOnMount === 'function') {
      return !!refetchOnMount(this.#query);
    }
    if (refetchOnMount === 'always') return true;
    if (refetchOnMount === false && !this.#query.state.isPending()) return false;
    if (this.#query.state.isStale() || this.#query.state.isPending()) return true;
    return false;
  }

  shouldFetchOnWindowFocus(): boolean {
    const refetchOnWindowFocus = this.#resolvedOptions.refetchOnWindowFocus;
    if (typeof refetchOnWindowFocus === 'function') {
      return !!refetchOnWindowFocus(this.#query);
    }
    if (refetchOnWindowFocus === 'always') return true;
    if (refetchOnWindowFocus && this.#query.state.isStale()) return true;
    return false;
  }

  shouldFetchOnReconnect(): boolean {
    const refetchOnReconnect = this.#resolvedOptions.refetchOnReconnect;
    if (typeof refetchOnReconnect === 'function') {
      return !!refetchOnReconnect(this.#query);
    }
    if (refetchOnReconnect === 'always') return true;
    return !!refetchOnReconnect;
  }

  isEnabled(): boolean {
    return this.#resolvedOptions.enabled;
  }

  isStale(): boolean {
    const staleTime = this.#resolveStaleTime();
    return this.#query.isStaleByTime(staleTime);
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
    this.#resolvedOptions = this.#resolveOptions(options);
    this.#updateStaleTimeout();
    this.#updateRefetchInterval();
    this.#notify();
  }

  destroy(): void {
    this.#clearTimers();
    this.#clearManagerSubscriptions();
    this.#listeners.clear();
  }
}
