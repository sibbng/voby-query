import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '../src';
import { QueryObserver } from '../src/queryObserver';
import { queryKey, sleep } from './utils';

describe('queryObserver stale timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not expose internal query state fields in results', async () => {
    const queryClient = new QueryClient();
    const key = queryKey();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
    });

    const query = (queryClient.getQueryCache() as any).find({ queryKey: key });
    const result = new QueryObserver(query, {}).getCurrentResult() as Record<string, unknown>;

    expect(result).not.toHaveProperty('dataUpdateCount');
    expect(result).not.toHaveProperty('fetchMeta');
    expect(result).not.toHaveProperty('isInvalidated');
    expect(result).not.toHaveProperty('isIdle');
    expect(result).not.toHaveProperty('cancel');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('isFetched');
    expect(result).toHaveProperty('isEnabled');
  });

  it('arms the stale timer relative to dataUpdatedAt when staleTime shortens', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 100,
    });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, { staleTime: 100 });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);

    // Initial result notification from subscribe (no fetch on mount, data fresh)
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(40);
    expect(listener).toHaveBeenCalledTimes(1);

    observer.setOptions({ staleTime: 50 });

    await vi.advanceTimersByTimeAsync(10);
    expect(listener).toHaveBeenCalledTimes(2);

    // Timer re-armed at dataUpdatedAt + 50 (+1ms), i.e. t=51, not t=90
    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it('should allow staleTime as a function', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () =>
        sleep(5).then(() => ({
          data: 'data',
          staleTime: 20,
        })),
    });

    const observer = new QueryObserver(query, {
      staleTime: (q: any) => q.state.data()?.staleTime ?? 0,
    });
    const results: Array<any> = [];
    const unsubscribe = observer.subscribe((x) => {
      if ((x.data as (() => unknown) | undefined)?.()) {
        results.push(observer.getCurrentResult());
      }
    });

    await vi.advanceTimersByTimeAsync(25);
    expect(results[0]?.isStale).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(results[1]?.isStale).toBe(true);

    unsubscribe();
  });

  it('should not see queries as stale is staleTime is Static', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () =>
        sleep(5).then(() => ({
          data: 'data',
        })),
    });

    const observer = new QueryObserver(query, { staleTime: 'static' });
    const result = observer.getCurrentResult();
    expect(result.isStale).toBe(true); // no data = stale

    const results: Array<any> = [];
    const unsubscribe = observer.subscribe((x) => {
      if ((x.data as (() => unknown) | undefined)?.()) {
        results.push(observer.getCurrentResult());
      }
    });

    await vi.advanceTimersByTimeAsync(5);
    expect(results[0]?.isStale).toBe(false);

    unsubscribe();
  });

  it('should track error prop when throwOnError is true', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () => Promise.reject('error'),
      retry: false,
    });

    const observer = new QueryObserver(query, {
      throwOnError: true,
    });

    const trackedResult = observer.trackResult(observer.getCurrentResult(), (prop) => {
      if (prop === 'data' || prop === 'status') {
        observer.trackProp(prop);
      }
    });

    void trackedResult.data;
    void trackedResult.status;

    const results: Array<any> = [];
    const unsubscribe = observer.subscribe((result) => results.push(result));

    await vi.advanceTimersByTimeAsync(0);
    const lastResult = results[results.length - 1];
    expect(lastResult?.status()).toBe('error');

    expect(results.length).toBe(1);
    expect(results[0].error().message).toBe('error');
    expect(results[0].isError()).toBe(true);

    unsubscribe();
  });

  it('should not track error prop when throwOnError is not set', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () => Promise.reject('error'),
      retry: false,
    });

    const observer = new QueryObserver(query, {});

    const trackedResult = observer.trackResult(observer.getCurrentResult(), (prop) => {
      if (prop === 'data') {
        observer.trackProp(prop);
      }
    });

    void trackedResult.data;

    const results: Array<any> = [];
    const unsubscribe = observer.subscribe((result) => results.push(result));

    await vi.advanceTimersByTimeAsync(0);

    // Without throwOnError, `error` is not auto-added to trackedProps.
    // Since only `data` is tracked and it did not change (stayed undefined),
    // the listener is not invoked even though `error` prop changed.
    expect(results.length).toBe(0);

    unsubscribe();
  });

  it('keeps the result promise stable through retries', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();
    let attempts = 0;

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () => {
        attempts++;
        return attempts < 3 ? Promise.reject(new Error('rejected')) : Promise.resolve('data');
      },
      retry: 2,
      retryDelay: 10,
    });
    const observer = new QueryObserver(query, {});
    const unsubscribe = observer.subscribe(() => {});
    const promises = [observer.getCurrentResult().promise];

    await vi.advanceTimersByTimeAsync(0);
    promises.push(observer.getCurrentResult().promise);
    await vi.advanceTimersByTimeAsync(10);
    promises.push(observer.getCurrentResult().promise);
    await vi.advanceTimersByTimeAsync(10);

    await expect(promises[0]).resolves.toBe('data');
    expect(new Set(promises).size).toBe(1);

    unsubscribe();
  });

  it('creates a new result promise after recovering from an error', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();
    let succeeds = false;
    let attempts = 0;

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () => {
        if (succeeds) return Promise.resolve('data');
        return Promise.reject(new Error(`rejected #${++attempts}`));
      },
      retry: false,
    });
    const observer = new QueryObserver(query, {});
    const unsubscribe = observer.subscribe(() => {});
    const firstPromise = observer.getCurrentResult().promise;

    await vi.advanceTimersByTimeAsync(0);
    await expect(firstPromise).rejects.toThrow('rejected #1');

    const failedRefetch = observer.refetch();
    const secondPromise = observer.getCurrentResult().promise;
    await vi.advanceTimersByTimeAsync(0);
    await failedRefetch;
    await expect(secondPromise).rejects.toThrow('rejected #2');

    succeeds = true;
    const successfulRefetch = observer.refetch();
    const thirdPromise = observer.getCurrentResult().promise;
    await vi.advanceTimersByTimeAsync(0);
    await successfulRefetch;

    await expect(thirdPromise).resolves.toBe('data');
    expect(new Set([firstPromise, secondPromise, thirdPromise]).size).toBe(3);

    unsubscribe();
  });

  it('should notify when a prop in the notifyOnChangeProps array changes', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn: () => sleep(5).then(() => 'data'),
    });

    const observer = new QueryObserver(query, {
      notifyOnChangeProps: ['data'],
    });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('should not notify when the included props did not change', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 100,
    });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 100,
      notifyOnChangeProps: ['data'],
    });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);

    await vi.advanceTimersByTimeAsync(200);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('should not re-arm the refetch interval when setOptions is called on an unmounted observer', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    const query = queryCache.build(queryClient, { queryKey: key, queryFn });

    // A mounted observer keeps the query active
    const active = new QueryObserver(query, {});
    const unsubscribeActive = active.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);

    // An unmounted observer calling setOptions must not arm an interval
    const detached = new QueryObserver(query, {});
    detached.setOptions({ refetchInterval: 50 });

    await vi.advanceTimersByTimeAsync(200);

    expect(queryFn).toHaveBeenCalledTimes(1);

    detached.destroy();
    unsubscribeActive();
  });

  it('should not arm the stale timer when setOptions is called on an unmounted observer', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 100,
    });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {});

    const spy = vi.fn();
    const unsubscribeCache = queryCache.subscribe(spy);

    observer.setOptions({ staleTime: 1000 });

    // setOptions synchronously emits observerOptionsUpdated + one
    // observerResultsUpdated notify — but no stale timer may be armed,
    // so no second observerResultsUpdated may arrive once it would fire.
    const resultsUpdated = () =>
      spy.mock.calls.filter((c) => (c[0] as any)?.type === 'observerResultsUpdated').length;

    expect(resultsUpdated()).toBe(1);

    await vi.advanceTimersByTimeAsync(1100);

    expect(resultsUpdated()).toBe(1);

    observer.destroy();
    unsubscribeCache();
  });

  it('should not refetch when enabled switches to true and data is fresh', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 1000 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, { enabled: false });
    const unsubscribe = observer.subscribe(() => {});

    observer.setOptions({ enabled: true, staleTime: 1000 });

    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('should refetch when enabled switches to true and data is stale', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 100 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, { enabled: false });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(200);

    observer.setOptions({ enabled: true, staleTime: 100 });

    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('should not cancel an in-flight fetch when the interval ticks', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const resolvers: Array<(v: string) => void> = [];
    const queryFn = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));

    const query = queryCache.build(queryClient, { queryKey: key, queryFn });
    const observer = new QueryObserver(query, { refetchInterval: 50 });
    const unsubscribe = observer.subscribe(() => {});

    // t=0: mount fetch starts
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    // First tick while the initial fetch is in-flight (no data yet): dedup
    await vi.advanceTimersByTimeAsync(50);
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Complete the first fetch; the next tick starts a background refetch
    resolvers[0]('data');
    await vi.advanceTimersByTimeAsync(50);
    expect(queryFn).toHaveBeenCalledTimes(2);

    // Tick while that refetch is in-flight: must dedup, not cancel + restart
    await vi.advanceTimersByTimeAsync(50);
    expect(queryFn).toHaveBeenCalledTimes(2);

    // Cleanup: settle any pending fetch so no timers leak
    for (const resolve of resolvers.slice(1)) resolve('data');
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    observer.destroy();
  });

  it('should not cancel an in-flight fetch on window focus', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const resolvers: Array<(v: string) => void> = [];
    const queryFn = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));

    const query = queryCache.build(queryClient, { queryKey: key, queryFn });
    const observer = new QueryObserver(query, {});
    const unsubscribe = observer.subscribe(() => {});

    // t=0: mount fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Complete the mount fetch so the query has data
    resolvers[0]('data');
    await vi.advanceTimersByTimeAsync(0);

    // Start a background refetch (in-flight when focus fires)
    void observer.refetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);

    // Focus event: must leave the in-flight fetch alone
    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    for (const resolve of resolvers.slice(1)) resolve('data');
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    observer.destroy();
  });

  it('should not cancel an in-flight fetch on reconnect', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const resolvers: Array<(v: string) => void> = [];
    const queryFn = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));

    const query = queryCache.build(queryClient, { queryKey: key, queryFn });
    const observer = new QueryObserver(query, {});
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    resolvers[0]('data');
    await vi.advanceTimersByTimeAsync(0);

    void observer.refetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);

    // Reconnect event: must leave the in-flight fetch alone
    (query as any).onOnline();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    for (const resolve of resolvers.slice(1)) resolve('data');
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on reconnect by default for networkMode always', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();
    const queryFn = vi.fn(async () => 'data');

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn,
      networkMode: 'always',
    });
    const observer = new QueryObserver(query, {});
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onOnline();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on mount when refetchOnMount is "always" and staleTime is "static"', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.setQueryData(key, 'initial');

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 'static',
      refetchOnMount: 'always',
      queryFn,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(0);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on window focus when refetchOnWindowFocus is "always" and staleTime is "static"', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 'static',
      refetchOnWindowFocus: 'always',
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on reconnect when refetchOnReconnect is "always" and staleTime is "static"', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 'static',
      refetchOnReconnect: 'always',
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onOnline();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on window focus when staleTime is "static" and query has a background error', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    let callCount = 0;
    const queryFn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return 'data';
      throw new Error('background error');
    });

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn,
      retry: false,
    });
    const observer = new QueryObserver(query, {
      staleTime: 'static',
      refetchOnWindowFocus: true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect((observer.getCurrentResult().data as any)?.()).toBe('data');
    expect((observer.getCurrentResult().status as any)()).toBe('success');

    await observer.refetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect((observer.getCurrentResult().status as any)()).toBe('error');
    expect((observer.getCurrentResult().data as any)?.()).toBe('data');

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
    observer.destroy();
  });

  it('should refetch on window focus when query has a background error and staleTime is not static', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    let callCount = 0;
    const queryFn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return 'data';
      if (callCount === 2) throw new Error('background error');
      return 'new data';
    });

    const query = queryCache.build(queryClient, {
      queryKey: key,
      queryFn,
      retry: false,
    });
    const observer = new QueryObserver(query, {
      staleTime: 1000,
      refetchOnWindowFocus: true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect((observer.getCurrentResult().data as any)?.()).toBe('data');
    expect((observer.getCurrentResult().status as any)()).toBe('success');

    await observer.refetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect((observer.getCurrentResult().status as any)()).toBe('error');
    expect((observer.getCurrentResult().data as any)?.()).toBe('data');

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(3);
    expect((observer.getCurrentResult().data as any)?.()).toBe('new data');

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on mount when refetchOnMount is a function returning true and data is fresh', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 1000 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 1000,
      refetchOnMount: () => true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on window focus when refetchOnWindowFocus is a function returning true and data is fresh', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 1000 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 1000,
      refetchOnWindowFocus: () => true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on reconnect when refetchOnReconnect is a function returning true and data is fresh', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 1000 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 1000,
      refetchOnReconnect: () => true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onOnline();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should refetch on window focus when refetchOnWindowFocus is a function returning true and data is stale', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 0,
      refetchOnMount: false,
      refetchOnWindowFocus: () => true,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
    observer.destroy();
  });

  it('should not refetch on window focus when refetchOnWindowFocus is a function returning false and data is stale', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 0,
      refetchOnMount: false,
      refetchOnWindowFocus: () => false,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(1);

    unsubscribe();
    observer.destroy();
  });

  it('should refetch on window focus when refetchOnWindowFocus is a function returning "always" and data is fresh', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 1000 });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 1000,
      refetchOnWindowFocus: () => 'always' as const,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
    observer.destroy();
  });

  it('should refetch on window focus when refetchOnWindowFocus is a function returning undefined and data is stale', async () => {
    const queryClient = new QueryClient();
    const queryCache = queryClient.getQueryCache() as any;
    const key = queryKey();

    const queryFn = vi.fn(async () => 'data');
    await queryClient.fetchQuery({ queryKey: key, queryFn });

    const query = queryCache.find({ queryKey: key }) as any;
    const observer = new QueryObserver(query, {
      staleTime: 0,
      refetchOnMount: false,
      refetchOnWindowFocus: () => undefined as any,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    (query as any).onFocus();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
    observer.destroy();
  });
});
