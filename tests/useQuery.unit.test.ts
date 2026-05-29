import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { CancelledError, createQueryClient } from '../src/useQuery';
import { sleep } from './utils';

const findQuery = (queryClient: ReturnType<typeof createQueryClient>, key: string) =>
  [...queryClient.getQueryCache().values()].find(
    (q) => Array.isArray(q.resolvedOptions.queryKey) && q.resolvedOptions.queryKey[0] === key,
  );

test('useQuery basic functionality', async () => {
  const queryClient = createQueryClient();

  const result = await queryClient.fetchQuery({
    queryKey: ['test'],
    queryFn: async () => {
      return 'test data';
    },
    staleTime: 0,
  });

  expect(result).toBe('test data');

  const cachedData = queryClient.getQueryData(['test']);
  expect(cachedData).toBe('test data');
});

test('queryClient.getQuerySnapshots exposes debug-friendly query state', async () => {
  const queryClient = createQueryClient();

  expect(queryClient.getQueryCache().version()).toBe(0);

  await queryClient.fetchQuery({
    queryKey: ['snapshot-test', 1],
    queryFn: async () => ({ id: 1, label: 'alpha' }),
    staleTime: 60_000,
  });

  expect(queryClient.getQueryCache().version()).toBe(1);

  const [snapshot] = queryClient.getQuerySnapshots<{ id: number; label: string }>({
    queryKey: ['snapshot-test'],
  });

  expect(snapshot).toMatchObject({
    queryHash: '["snapshot-test",1]',
    queryKey: ['snapshot-test', 1],
    status: 'success',
    fetchStatus: 'idle',
    enabled: true,
    isActive: false,
    isCancelled: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    isLoading: false,
    isStale: false,
    isInvalidated: false,
    observers: 0,
    hasData: true,
    data: { id: 1, label: 'alpha' },
    gcTime: 300000,
    staleTime: 60000,
    networkMode: 'online',
  });

  await queryClient.invalidateQueries({ queryKey: ['snapshot-test'], refetchType: 'none' });

  const [invalidatedSnapshot] = queryClient.getQuerySnapshots({ queryKey: ['snapshot-test'] });
  expect(invalidatedSnapshot.isInvalidated).toBe(true);
  expect(invalidatedSnapshot.isStale).toBe(true);

  queryClient.removeQueries({ queryKey: ['snapshot-test'] });

  expect(queryClient.getQueryCache().version()).toBe(2);
  expect(queryClient.getQuerySnapshots({ queryKey: ['snapshot-test'] })).toEqual([]);
});

test('useQuery error handling', async () => {
  const queryClient = createQueryClient();

  try {
    await queryClient.fetchQuery({
      queryKey: ['error'],
      queryFn: async () => {
        throw new Error('Test error');
      },
      staleTime: 0,
      throwOnError: true,
    });
  } catch (error: any) {
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
  }
});

test('useQuery refetch', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  const result1 = await queryClient.fetchQuery({
    queryKey: ['refetch'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 0,
  });

  expect(result1).toBe('data 1');

  const cachedData1 = queryClient.getQueryData(['refetch']);
  expect(cachedData1).toBe('data 1');

  await queryClient.invalidateQueries({ queryKey: ['refetch'] });

  const result2 = await queryClient.fetchQuery({
    queryKey: ['refetch'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 0,
  });

  expect(result2).toBe('data 2');

  const cachedData2 = queryClient.getQueryData(['refetch']);
  expect(cachedData2).toBe('data 2');
});

test('queryClient.prefetchQuery basic functionality', async () => {
  const queryClient = createQueryClient();
  const queryFnMock = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
    return 'prefetched data';
  });

  // Scenario 1: Prefetch with a long staleTime
  await queryClient.prefetchQuery({
    queryKey: ['prefetch-test-1'],
    queryFn: queryFnMock,
    staleTime: 1000 * 60, // 1 minute
  });

  expect(queryFnMock).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(['prefetch-test-1'])).toBe('prefetched data');

  // Calling fetchQuery immediately should use the cached data and not call queryFn again
  const dataFromFetch = await queryClient.fetchQuery({
    queryKey: ['prefetch-test-1'],
    queryFn: queryFnMock, // Pass the same mock
  });
  expect(dataFromFetch).toBe('prefetched data');
  expect(queryFnMock).toHaveBeenCalledTimes(1); // Should not be called again

  // Scenario 2: Prefetch with staleTime: 0 (or default)
  const queryFnMock2 = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 'prefetched data stale';
  });
  await queryClient.prefetchQuery({
    queryKey: ['prefetch-test-2'],
    queryFn: queryFnMock2,
    staleTime: 0, // Explicitly stale
  });
  expect(queryFnMock2).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(['prefetch-test-2'])).toBe('prefetched data stale');

  // Calling fetchQuery should call queryFn again because data is stale
  const dataFromFetchStale = await queryClient.fetchQuery({
    queryKey: ['prefetch-test-2'],
    queryFn: queryFnMock2,
  });
  expect(dataFromFetchStale).toBe('prefetched data stale');
  expect(queryFnMock2).toHaveBeenCalledTimes(2); // Called again
});

test('queryClient.removeQueries', async () => {
  const queryClient = createQueryClient();
  const queryKey = ['remove-test'];
  const queryFn = async () => 'data to remove';

  // 1. Fetch data
  await queryClient.fetchQuery({ queryKey, queryFn });

  // 2. Verify data is in cache
  expect(queryClient.getQueryData(queryKey)).toBe('data to remove');

  // 3. Call removeQueries
  queryClient.removeQueries({ queryKey });

  // 4. Verify data is undefined
  expect(queryClient.getQueryData(queryKey)).toBeUndefined();

  // Test removing non-existent query (should not throw)
  expect(() => queryClient.removeQueries({ queryKey: ['non-existent'] })).not.toThrow();
});

test('queryClient.clear', async () => {
  const queryClient = createQueryClient();
  const queryKey1 = ['clear-test-1'];
  const queryKey2 = ['clear-test-2'];
  const queryFn1 = async () => 'data 1';
  const queryFn2 = async () => 'data 2';

  // 1. Fetch data for multiple keys
  await queryClient.fetchQuery({ queryKey: queryKey1, queryFn: queryFn1 });
  await queryClient.fetchQuery({ queryKey: queryKey2, queryFn: queryFn2 });

  // 2. Verify data is in cache
  expect(queryClient.getQueryData(queryKey1)).toBe('data 1');
  expect(queryClient.getQueryData(queryKey2)).toBe('data 2');

  // 3. Call clear
  queryClient.clear();

  // 4. Verify data is undefined for all keys
  expect(queryClient.getQueryData(queryKey1)).toBeUndefined();
  expect(queryClient.getQueryData(queryKey2)).toBeUndefined();
});

test('queryClient.ensureQueryData fetches uncached queries', async () => {
  const queryClient = createQueryClient();
  const queryFnMock = vi.fn(async () => 'ensured data');

  const data = await queryClient.ensureQueryData({
    queryKey: ['ensure-query-data'],
    queryFn: queryFnMock,
  });

  expect(data).toBe('ensured data');
  expect(queryFnMock).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(['ensure-query-data'])).toBe('ensured data');
});

test('queryClient.fetchQuery deduplicates concurrent requests for the same key', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};
  const queryFnMock = vi.fn(
    async () =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
  );

  const firstFetch = queryClient.fetchQuery({
    queryKey: ['dedupe-fetch-query'],
    queryFn: queryFnMock,
  });

  await Promise.resolve();

  const secondFetch = queryClient.fetchQuery({
    queryKey: ['dedupe-fetch-query'],
    queryFn: queryFnMock,
  });

  resolveFetch('deduped data');

  await expect(Promise.all([firstFetch, secondFetch])).resolves.toEqual([
    'deduped data',
    'deduped data',
  ]);
  expect(queryFnMock).toHaveBeenCalledTimes(1);
});

test('queryClient.ensureQueryData deduplicates concurrent requests for the same key', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};
  const queryFnMock = vi.fn(
    async () =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
  );

  const firstFetch = queryClient.ensureQueryData({
    queryKey: ['dedupe-ensure-query-data'],
    queryFn: queryFnMock,
  });

  await Promise.resolve();

  const secondFetch = queryClient.ensureQueryData({
    queryKey: ['dedupe-ensure-query-data'],
    queryFn: queryFnMock,
  });

  resolveFetch('deduped ensure data');

  await expect(Promise.all([firstFetch, secondFetch])).resolves.toEqual([
    'deduped ensure data',
    'deduped ensure data',
  ]);
  expect(queryFnMock).toHaveBeenCalledTimes(1);
});

test('queryClient matches partial query keys for invalidate and refetch', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['todos', 1],
    queryFn: async () => `todo ${++callCount}`,
    staleTime: 1000 * 60,
  });

  await queryClient.invalidateQueries({
    queryKey: ['todos'],
    refetchType: 'all',
  });

  expect(callCount).toBe(2);
  expect(queryClient.getQueryData(['todos', 1])).toBe('todo 2');
});

test('queryClient matches partial query keys for removeQueries', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['todos', 1],
    queryFn: async () => 'todo 1',
  });
  await queryClient.fetchQuery({
    queryKey: ['todos', 2],
    queryFn: async () => 'todo 2',
  });
  await queryClient.fetchQuery({
    queryKey: ['users', 1],
    queryFn: async () => 'user 1',
  });

  queryClient.removeQueries({ queryKey: ['todos'] });

  expect(queryClient.getQueryData(['todos', 1])).toBeUndefined();
  expect(queryClient.getQueryData(['todos', 2])).toBeUndefined();
  expect(queryClient.getQueryData(['users', 1])).toBe('user 1');
});

test('queryClient.removeQueries supports type and predicate filters', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['posts', 'active'],
    queryFn: async () => 'active post',
    staleTime: 1000,
  });
  await queryClient.fetchQuery({
    queryKey: ['posts', 'inactive'],
    queryFn: async () => 'inactive post',
    staleTime: 1000,
  });
  await queryClient.fetchQuery({
    queryKey: ['users', 'inactive'],
    queryFn: async () => 'inactive user',
    staleTime: 1000,
  });

  const activePostsQuery = [...queryClient.getQueryCache().values()].find(
    (query) =>
      Array.isArray(query.resolvedOptions.queryKey) &&
      query.resolvedOptions.queryKey[0] === 'posts' &&
      query.resolvedOptions.queryKey[1] === 'active',
  );

  if (!activePostsQuery) {
    throw new Error('Expected active posts query to exist in cache');
  }

  activePostsQuery.isActive = true;

  queryClient.removeQueries({
    queryKey: ['posts'],
    type: 'inactive',
    predicate: (query) =>
      Array.isArray(query.resolvedOptions.queryKey) && query.resolvedOptions.queryKey[1] === 'inactive',
  });

  expect(queryClient.getQueryData(['posts', 'active'])).toBe('active post');
  expect(queryClient.getQueryData(['posts', 'inactive'])).toBeUndefined();
  expect(queryClient.getQueryData(['users', 'inactive'])).toBe('inactive user');
});

test('queryClient applies partial query defaults', async () => {
  const queryClient = createQueryClient();
  const queryFnMock = vi.fn(async () => 'defaulted data');

  queryClient.setQueryDefaults(['defaults'], { staleTime: 0 });

  await queryClient.fetchQuery({
    queryKey: ['defaults', 1],
    queryFn: queryFnMock,
  });
  await queryClient.fetchQuery({
    queryKey: ['defaults', 1],
    queryFn: queryFnMock,
  });

  expect(queryFnMock).toHaveBeenCalledTimes(2);
});

test('queryClient refetchQueries cancels an in-flight request before fetching again', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;
  let abortCount = 0;

  const firstFetch = queryClient.fetchQuery({
    queryKey: ['cancel-before-refetch'],
    queryFn: async ({ signal }) => {
      callCount++;
      if (callCount === 1) {
        return new Promise<string>((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              abortCount++;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        });
      }
      return `data ${callCount}`;
    },
    staleTime: 0,
  });

  await Promise.resolve();
  await queryClient.refetchQueries({ queryKey: ['cancel-before-refetch'] });
  await firstFetch;

  expect(abortCount).toBe(1);
  expect(callCount).toBe(2);
  expect(queryClient.getQueryData(['cancel-before-refetch'])).toBe('data 2');
});

test('queryClient.cancelQueries reverts an in-flight refetch to the previous state', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;
  let abortCount = 0;
  let resolveRefetch: (value: string) => void = () => {};

  await queryClient.fetchQuery({
    queryKey: ['cancel-revert'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'cancel-revert');
  expect(query?.state.status()).toBe('success');
  expect(query?.state.fetchStatus()).toBe('idle');
  expect(query?.state.data()).toBe('data 1');

  if (!query) {
    throw new Error('Expected query to exist in cache');
  }

  query.resolvedOptions.queryFn = async ({ signal }) => {
    callCount++;
    signal.addEventListener(
      'abort',
      () => {
        abortCount++;
      },
      { once: true },
    );

    return new Promise<string>((resolve) => {
      resolveRefetch = resolve;
    });
  };

  const refetchPromise = queryClient.refetchQueries({ queryKey: ['cancel-revert'] });
  await Promise.resolve();
  await Promise.resolve();

  expect(query.state.fetchStatus()).toBe('fetching');
  expect(query.state.status()).toBe('success');
  expect(query.state.data()).toBe('data 1');

  await queryClient.cancelQueries({
    queryKey: ['cancel-revert'],
    fetchStatus: 'fetching',
    predicate: (candidate) => candidate === query,
  });

  expect(abortCount).toBe(1);
  expect(query.state.fetchStatus()).toBe('idle');
  expect(query.state.status()).toBe('success');
  expect(query.state.data()).toBe('data 1');
  expect(queryClient.getQueryData(['cancel-revert'])).toBe('data 1');

  resolveRefetch('data 2');
  await refetchPromise;

  expect(query.state.fetchStatus()).toBe('idle');
  expect(query.state.status()).toBe('success');
  expect(query.state.data()).toBe('data 1');
  expect(queryClient.getQueryData(['cancel-revert'])).toBe('data 1');
});

test('queryClient.cancelQueries throws CancelledError for initial fetches unless silent', async () => {
  const queryClient = createQueryClient();

  const firstFetch = queryClient.fetchQuery({
    queryKey: ['cancel-initial'],
    queryFn: async ({ signal }) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true },
        );
      }),
  });

  await Promise.resolve();

  await expect(
    queryClient.cancelQueries({ queryKey: ['cancel-initial'], fetchStatus: 'fetching' }),
  ).rejects.toBeInstanceOf(CancelledError);
  await firstFetch;

  const cancelledInitialQuery = findQuery(queryClient, 'cancel-initial');
  expect(cancelledInitialQuery?.state.status()).toBe('pending');
  expect(cancelledInitialQuery?.state.fetchStatus()).toBe('idle');
  expect(cancelledInitialQuery?.state.data()).toBeUndefined();

  const silentFetch = queryClient.fetchQuery({
    queryKey: ['cancel-initial-silent'],
    queryFn: async ({ signal }) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true },
        );
      }),
  });

  await Promise.resolve();

  await expect(
    queryClient.cancelQueries(
      { queryKey: ['cancel-initial-silent'], fetchStatus: 'fetching' },
      { silent: true },
    ),
  ).resolves.toBeUndefined();
  await silentFetch;
});

test('queryClient isFetching uses partial and exact query-key filters', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};

  const fetchPromise = queryClient.fetchQuery({
    queryKey: ['loading', 1],
    queryFn: async () =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
  });

  await Promise.resolve();

  expect(queryClient.isFetching({ queryKey: ['loading'] })).toBe(1);
  expect(queryClient.isFetching({ queryKey: ['loading'], exact: true })).toBe(0);
  expect(queryClient.isFetching({ queryKey: ['loading', 1], exact: true })).toBe(1);

  resolveFetch('loaded');
  await fetchPromise;
});

test('queryClient getQueryData and setQueryData expose safe types and direct values', async () => {
  const queryClient = createQueryClient();

  expectTypeOf(queryClient.getQueryData<string>(['missing'])).toEqualTypeOf<string | undefined>();
  expect(queryClient.getQueryData<string>(['missing'])).toBeUndefined();

  await queryClient.fetchQuery({
    queryKey: ['set-data'],
    queryFn: async () => 'old value',
  });

  queryClient.setQueryData<string>(['set-data'], 'new value');
  expect(queryClient.getQueryData<string>(['set-data'])).toBe('new value');

  queryClient.setQueryData<string>(['set-data'], (previous) => `${previous} updated`);
  expect(queryClient.getQueryData<string>(['set-data'])).toBe('new value updated');
});

// #region staleTime tests

test('staleTime: 0 marks data as stale immediately after fetch', async () => {
  const queryClient = createQueryClient();
  await queryClient.fetchQuery({
    queryKey: ['stale-0'],
    queryFn: async () => 'data',
    staleTime: 0,
  });
  expect(findQuery(queryClient, 'stale-0')?.state.isStale()).toBe(true);
});

test('staleTime: static — data never goes stale', async () => {
  const queryClient = createQueryClient();
  await queryClient.fetchQuery({
    queryKey: ['stale-static'],
    queryFn: async () => 'data',
    staleTime: 'static',
  });
  expect(findQuery(queryClient, 'stale-static')?.state.isStale()).toBe(false);
});

test('staleTime: Infinity — data never goes stale', async () => {
  const queryClient = createQueryClient();
  await queryClient.fetchQuery({
    queryKey: ['stale-infinity'],
    queryFn: async () => 'data',
    staleTime: Infinity,
  });
  expect(findQuery(queryClient, 'stale-infinity')?.state.isStale()).toBe(false);
});

test('staleTime: function — computes staleTime and marks data as not stale when static returned', async () => {
  const queryClient = createQueryClient();
  const staleTimeFn = vi.fn(() => 'static' as const);

  await queryClient.fetchQuery({
    queryKey: ['stale-fn'],
    queryFn: async () => 'data',
    staleTime: staleTimeFn,
  });

  expect(staleTimeFn).toHaveBeenCalled();
  expect(findQuery(queryClient, 'stale-fn')?.state.isStale()).toBe(false);
});

test('staleTime: function — computes staleTime and marks data as stale when 0 returned', async () => {
  const queryClient = createQueryClient();
  await queryClient.fetchQuery({
    queryKey: ['stale-fn-0'],
    queryFn: async () => 'data',
    staleTime: () => 0,
  });
  expect(findQuery(queryClient, 'stale-fn-0')?.state.isStale()).toBe(true);
});

// #region gcTime tests

test('gcTime: Infinity — scheduleDestroy does not destroy the cache entry', async () => {
  const queryClient = createQueryClient();
  await queryClient.fetchQuery({
    queryKey: ['gc-infinity'],
    queryFn: async () => 'gc data',
    gcTime: Infinity,
  });

  const query = findQuery(queryClient, 'gc-infinity');
  query?.scheduleDestroy();
  await sleep(10);

  expect(queryClient.getQueryData(['gc-infinity'])).toBe('gc data');
});

// #region retry tests

test('retry: number — retries exactly N times', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  const fetchPromise = queryClient.fetchQuery({
    queryKey: ['retry-count'],
    queryFn: async () => {
      callCount++;
      throw new Error('fail');
    },
    retry: 3,
    retryDelay: 0,
  });

  // Patch isActive so retries can fire (fetch checks isActive for non-forced calls)
  const query = findQuery(queryClient, 'retry-count');
  if (query) query.isActive = true;

  await fetchPromise;
  await sleep(50);

  expect(callCount).toBe(4); // 1 initial + 3 retries
});

test('retry: function — called with failureCount (0-based) and error', async () => {
  const queryClient = createQueryClient();
  const thrownError = new Error('fail');
  const retryFn = vi.fn((_failureCount: number, _error: unknown) => true);

  const fetchPromise = queryClient.fetchQuery({
    queryKey: ['retry-fn-args'],
    queryFn: async () => {
      throw thrownError;
    },
    retry: retryFn,
    retryDelay: 0,
  });

  const query = findQuery(queryClient, 'retry-fn-args');
  if (query) query.isActive = true;

  await fetchPromise;
  await sleep(10); // let at least one retry fire

  expect(retryFn).toHaveBeenCalled();
  expect(retryFn.mock.calls[0][0]).toBe(0); // failureCount starts at 0
  expect(retryFn.mock.calls[0][1]).toBe(thrownError);
});

test('retry: function — stops retrying when it returns false', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  const fetchPromise = queryClient.fetchQuery({
    queryKey: ['retry-fn-stop'],
    queryFn: async () => {
      callCount++;
      throw new Error('fail');
    },
    retry: (failureCount) => failureCount < 2, // allow 2 retries
    retryDelay: 0,
  });

  const query = findQuery(queryClient, 'retry-fn-stop');
  if (query) query.isActive = true;

  await fetchPromise;
  await sleep(50);

  expect(callCount).toBe(3); // 1 initial + 2 retries
});

test('retryDelay: function — called with attempt number and error', async () => {
  const queryClient = createQueryClient();
  const retryDelayFn = vi.fn((_attempt: number, _error: unknown) => 0);

  const fetchPromise = queryClient.fetchQuery({
    queryKey: ['retry-delay-fn'],
    queryFn: async () => {
      throw new Error('fail');
    },
    retry: 1,
    retryDelay: retryDelayFn,
  });

  const query = findQuery(queryClient, 'retry-delay-fn');
  if (query) query.isActive = true;

  await fetchPromise;
  await sleep(10);

  expect(retryDelayFn).toHaveBeenCalled();
  expect(retryDelayFn.mock.calls[0][0]).toBe(1); // attempt starts at 1
  expect(retryDelayFn.mock.calls[0][1]).toBeInstanceOf(Error);
});
