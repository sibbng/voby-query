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
});
