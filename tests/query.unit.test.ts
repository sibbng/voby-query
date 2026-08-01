import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient, onlineManager } from '../src/index.ts';
import { QueryObserver } from '../src/queryObserver.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

let keyCounter = 0;
const queryKey = () => [`query_${keyCounter++}`];

describe('query', () => {
  it('pauses an offline query and resumes the original fetch when online', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue('data');

    onlineManager.setOnline(false);
    const promise = queryClient.fetchQuery({ queryKey: key, queryFn });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    await Promise.resolve();

    expect(queryFn).not.toHaveBeenCalled();
    expect(query.state.fetchStatus()).toBe('paused');
    expect(query.state.isPaused()).toBe(true);

    onlineManager.setOnline(true);

    await expect(promise).resolves.toBe('data');
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(query.state.fetchStatus()).toBe('idle');
  });

  it('runs the first offlineFirst attempt but pauses its retry while offline', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline failure'))
      .mockResolvedValue('data');

    onlineManager.setOnline(false);
    const promise = queryClient.fetchQuery({
      queryKey: key,
      queryFn,
      networkMode: 'offlineFirst',
      retry: 1,
      retryDelay: 0,
    });

    await vi.advanceTimersByTimeAsync(0);

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(query.state.fetchStatus()).toBe('paused');

    onlineManager.setOnline(true);

    await expect(promise).resolves.toBe('data');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('cancels a paused initial fetch when the last observer unsubscribes', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue('data');

    onlineManager.setOnline(false);

    const query = queryClient.getQueryCache().build(queryClient, {
      queryKey: key,
      queryFn,
      networkMode: 'online',
    });
    const observer = new QueryObserver(query as any, {
      queryFn,
    });
    const unsubscribe = observer.subscribe(() => {});

    await Promise.resolve();
    expect(query.state.fetchStatus()).toBe('paused');

    unsubscribe();
    expect(query.state.fetchStatus()).toBe('idle');

    onlineManager.setOnline(true);
    queryClient.getQueryCache().onOnline();
    await vi.advanceTimersByTimeAsync(0);

    expect(queryFn).not.toHaveBeenCalled();
  });

  it('should provide context to queryFn', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue('data');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    const args = queryFn.mock.calls[0]![0];
    expect(args).toBeDefined();
    expect(args.queryKey).toEqual(key);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('cancelling a resolved query should not have any effect', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
    });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    await query.cancel({ revert: false, silent: true }).catch(() => {});

    expect(query.state.data()).toBe('data');
  });

  it('cancelling a rejected query should not have any effect', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const error = new Error('error');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        throw error;
      },
    });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    await query.cancel({ revert: false, silent: true }).catch(() => {});

    expect(query.state.error()).toBe(error);
  });

  it('stores meta object in query options', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => 'data',
      meta,
    });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBe(meta);
  });

  it('updates meta object on change', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = async () => 'data';

    await queryClient.prefetchQuery({ queryKey: key, queryFn, meta });

    await queryClient.prefetchQuery({ queryKey: key, queryFn, meta: undefined });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBeUndefined();
  });

  it('should not change state on invalidate() if already invalidated', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    void queryClient.invalidateQueries({ queryKey: key });
    expect(query.state.isInvalidated()).toBeTruthy();

    void queryClient.invalidateQueries({ queryKey: key });
    expect(query.state.isInvalidated()).toBeTruthy();
  });

  it('should error if reset while pending', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockImplementation(async () => {
      await new Promise((_resolve) => {});
      throw new Error();
    });

    queryClient
      .fetchQuery({
        queryKey: key,
        queryFn,
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('pending');

    query.reset();

    expect(query.state.data()).toBeUndefined();
    expect(query.state.error()).toBeNull();
    expect(query.state.status()).toBe('pending');
    expect(query.state.fetchStatus()).toBe('idle');
  });

  it('initialDataUpdatedAt: 0 sets dataUpdatedAt to 0', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const cache = queryClient.getQueryCache();

    cache.build(queryClient, {
      queryKey: key,
      queryFn: async () => 'data',
      staleTime: 1000000,
      initialData: 'initial',
      initialDataUpdatedAt: 0,
    } as any);

    const query = cache.find({ queryKey: key })!;
    expect(query.state.data()).toBe('initial');
    expect(query.state.status()).toBe('success');
    expect(query.state.dataUpdatedAt()).toBe(0);
  });

  it('the previous query status should be kept when refetching', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('success');

    await queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => {
        throw 'reject';
      },
      retry: false,
    });
    expect(query.state.status()).toBe('error');

    void queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => new Promise((_resolve) => {}),
    });
    expect(query.state.status()).toBe('error');
  });

  it('should be able to refetch a cancelled query', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'data';
    });

    const prefetchPromise = queryClient.prefetchQuery({ queryKey: key, queryFn });
    await vi.advanceTimersByTimeAsync(60);
    await prefetchPromise;
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    await query.cancel({ revert: false, silent: true }).catch(() => {});

    const refetchPromise = query.fetch({ force: true });
    await vi.advanceTimersByTimeAsync(60);
    await refetchPromise;
    expect(query.state.data()).toBe('data');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on the server', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    let count = 0;

    const query = queryClient.getQueryCache().build(queryClient, {
      queryKey: key,
      queryFn: () => {
        count++;
        return Promise.reject(new Error('error'));
      },
      retry: 3,
    });
    const observer = new QueryObserver(query as any, {});

    await observer.refetch();

    expect(count).toBe(1);
  });

  it('should provide an AbortSignal that gets aborted on cancel', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const onAbort = vi.fn();

    const queryFn = vi.fn().mockImplementation(async ({ signal }) => {
      signal.addEventListener('abort', onAbort);
      await new Promise((r) => setTimeout(r, 100));
      return 'data';
    });

    const promise = queryClient.fetchQuery({
      queryKey: key,
      queryFn,
      retry: false,
    });
    await vi.advanceTimersByTimeAsync(10);

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    const signal = queryFn.mock.calls[0]![0].signal;
    expect(signal.aborted).toBe(false);

    await query.cancel({ revert: false, silent: true }).catch(() => {});
    await vi.advanceTimersByTimeAsync(110);
    await promise.catch(() => {});

    expect(signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalled();
  });

  it('aborts and reverts a signal-aware fetch when the last observer unsubscribes', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    let abortCount = 0;
    let resolveRefetch: (value: string) => void = () => {};

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'original data',
      staleTime: 1000,
    });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    const observer = new QueryObserver(query as any, {
      queryFn: async () => 'original data',
      staleTime: 1000,
    });
    const unsubscribe = observer.subscribe(() => {});

    const promise = queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        new Promise<string>((resolve) => {
          resolveRefetch = resolve;
          signal.addEventListener(
            'abort',
            () => {
              abortCount++;
            },
            { once: true },
          );
        }),
      staleTime: 0,
    });

    await Promise.resolve();
    expect(query.state.fetchStatus()).toBe('fetching');

    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);
    resolveRefetch('refetched data');

    const result = await promise;
    expect(abortCount).toBe(1);
    expect(result).toBe('original data');
    expect(query.state.data()).toBe('original data');
  });

  it('continues a signal-unused fetch when the last observer unsubscribes', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => 'original data',
      staleTime: 1000,
    });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    const observer = new QueryObserver(query as any, {
      queryFn: async () => 'original data',
      staleTime: 1000,
    });
    const unsubscribe = observer.subscribe(() => {});

    const promise = queryClient.fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('refetched data'), 10)),
      staleTime: 0,
    });

    await Promise.resolve();
    unsubscribe();

    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe('refetched data');
    expect(query.state.data()).toBe('refetched data');
  });

  it('can use default meta', async () => {
    const meta = { it: 'works' };
    const key = queryKey();
    const queryClient = new QueryClient();

    queryClient.setQueryDefaults(key, { meta } as any);

    await queryClient.prefetchQuery({ queryKey: key, queryFn: async () => 'data' });

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.resolvedOptions.meta).toBe(meta);
  });

  it('should have an error status when queryFn data causes structural sharing error', async () => {
    const data = {
      get foo(): never {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.foo;
        return this.foo as never;
      },
    };

    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => data,
        initialData: { foo: 'bar' } as any,
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('error');
  });

  it('should have an error status when structuralSharing throws', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => 'data',
        structuralSharing: () => {
          throw new Error('Any error');
        },
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    expect(query.state.status()).toBe('error');
  });

  it('fetch should dispatch an error if the queryFn returns undefined', async () => {
    const consoleMock = vi.spyOn(console, 'error');
    consoleMock.mockImplementation(() => undefined);
    const key = queryKey();
    const queryClient = new QueryClient();

    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () => undefined,
        retry: false,
      })
      .catch(() => {});

    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    const error = new Error(`${JSON.stringify(key)} data is undefined`);

    expect(query.state.status()).toBe('error');
    expect(query.state.error()).toEqual(error);

    expect(consoleMock).toHaveBeenCalledWith(
      `Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ["${key}"]`,
    );
    consoleMock.mockRestore();
  });

  it('should use exponential backoff starting at 1s for the first retry', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockRejectedValue(new Error('err'));

    const promise = queryClient.fetchQuery({ queryKey: key, queryFn, retry: 2 }).catch(() => {});

    await vi.advanceTimersByTimeAsync(999);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(queryFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(queryFn).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(30000);
    await promise;
  });

  it('should pass a 0-based attempt count to retryDelay', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockRejectedValue(new Error('err'));
    const retryDelay = vi.fn().mockReturnValue(10);

    const promise = queryClient
      .fetchQuery({ queryKey: key, queryFn, retry: 2, retryDelay })
      .catch(() => {});

    await vi.advanceTimersByTimeAsync(30);
    await promise;

    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(retryDelay.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
  });

  it('fetch should not dispatch duplicate events when already fetching', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(r, 100)).then(() => 'data'));

    const prefetchPromise = queryClient.prefetchQuery({ queryKey: key, queryFn });
    await vi.advanceTimersByTimeAsync(110);
    await prefetchPromise;
    const query = queryClient.getQueryCache().find({ queryKey: key })!;

    const updates: string[] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      updates.push(event.type);
    });

    void query.fetch({ force: true });
    const fetchPromise = query.fetch({ force: true });
    await vi.advanceTimersByTimeAsync(110);
    await fetchPromise;

    expect(updates).toContain('updated');
    unsubscribe();
  });

  it('should use queryFn from observer if not provided in options', async () => {
    const key = queryKey();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue('data');

    const query = queryClient.getQueryCache().build(queryClient, { queryKey: key });
    const observer = new QueryObserver(query as any, {
      queryFn,
    });

    (query as any).addObserver(observer);

    await query.fetch();

    expect(queryClient.getQueryData(key)).toBe('data');
    expect(query.resolvedOptions.queryFn).toBe(queryFn);
  });
});
