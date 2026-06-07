import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { createQueryClient } from '../src';
import { CancelledError } from '../src/useQuery';
import { QueryCache } from '../src/queryCache';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const findQuery = (queryClient: ReturnType<typeof createQueryClient>, key: string) =>
  [...queryClient.getQueryCache().values()].find(
    (q) => Array.isArray(q.resolvedOptions.queryKey) && q.resolvedOptions.queryKey[0] === key,
  );

// ──────────────────────────────────────
// Section A — initialData & placeholderData
// ──────────────────────────────────────

test('initialData sets initial state to success with data', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['initial-data-success'],
    queryFn: async () => 'real data',
    initialData: 'init value',
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'initial-data-success')!;
  expect(query.state.status()).toBe('success');
  expect(query.state.data()).toBe('real data');
  expect(query.state.dataUpdateCount()).toBe(1);
});

test('initialDataUpdatedAt: 0 makes initial data stale', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['initial-data-stale'],
    queryFn: async () => 'real data',
    initialData: 'old value',
    initialDataUpdatedAt: 0,
  });

  const query = findQuery(queryClient, 'initial-data-stale')!;
  expect(query.state.isStale()).toBe(true);
});

test('isPlaceholderData is true while query is pending with placeholderData set', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['placeholder-pending'],
    queryFn: async () =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
    placeholderData: 'placeholder',
  });

  expect(query.state.isPlaceholderData()).toBe(true);

  const fetchPromise = query.fetch({ force: true });
  expect(query.state.isPlaceholderData()).toBe(true);

  resolveFetch('real data');
  await fetchPromise;

  expect(query.state.isPlaceholderData()).toBe(false);
  expect(query.state.data()).toBe('real data');
});

test('isPlaceholderData is false when placeholderData is not set', async () => {
  const queryClient = createQueryClient();

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['no-placeholder'],
    queryFn: async () => 'data',
  });

  expect(query.state.isPlaceholderData()).toBe(false);
});

// ──────────────────────────────────────
// Section B — invalidateQueries / refetchType
// ──────────────────────────────────────

test('invalidateQueries with refetchType: none marks stale but does not refetch', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['invalidate-none'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'invalidate-none')!;
  expect(query.state.isInvalidated()).toBe(false);
  expect(query.state.isStale()).toBe(false);

  await queryClient.invalidateQueries({ queryKey: ['invalidate-none'] }, { cancelRefetch: false });
  expect(query.state.isInvalidated()).toBe(true);
  expect(query.state.isStale()).toBe(true);
  expect(callCount).toBe(1);
});

test('invalidateQueries with refetchType: inactive refetches inactive queries', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['invalidate-inactive'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'invalidate-inactive')!;
  expect(query.state.isStale()).toBe(false);

  await queryClient.invalidateQueries({
    queryKey: ['invalidate-inactive'],
    refetchType: 'inactive',
  });

  expect(callCount).toBe(2);
  expect(query.state.isStale()).toBe(false);
});

test('invalidateQueries with refetchType: active does not refetch inactive queries', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['invalidate-active'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'invalidate-active')!;
  expect(query.state.isStale()).toBe(false);

  await queryClient.invalidateQueries({
    queryKey: ['invalidate-active'],
    refetchType: 'active',
  });

  expect(callCount).toBe(1);
  expect(query.state.isInvalidated()).toBe(true);
  expect(query.state.isStale()).toBe(true);
});

test('invalidateQueries with refetchType: all refetches inactive queries', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['invalidate-all'],
    queryFn: async () => {
      callCount++;
      return `data ${callCount}`;
    },
    staleTime: 1000,
  });

  await queryClient.invalidateQueries({
    queryKey: ['invalidate-all'],
    refetchType: 'all',
  });

  expect(callCount).toBe(2);
});

// ──────────────────────────────────────
// Section C — cancel & revert
// ──────────────────────────────────────

test('cancel with silent: true does not throw CancelledError', async () => {
  const queryClient = createQueryClient();
  let rejectFetch: (error: Error) => void = () => {};

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['cancel-silent'],
    queryFn: async ({ signal }) =>
      new Promise<string>((_resolve, reject) => {
        rejectFetch = reject;
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  });

  void query.fetch({ force: true });
  await Promise.resolve();

  await expect(query.cancel({ revert: true, silent: true })).resolves.toBeUndefined();
});

test('cancel with revert: true restores previous data state', async () => {
  const queryClient = createQueryClient();
  let resolveRefetch: (value: string) => void = () => {};

  await queryClient.fetchQuery({
    queryKey: ['cancel-revert-state'],
    queryFn: async () => 'original data',
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'cancel-revert-state')!;
  query.resolvedOptions.queryFn = async ({ signal }) =>
    new Promise<string>((resolve) => {
      resolveRefetch = resolve;
      signal.addEventListener('abort', () => {}, { once: true });
    });

  void query.refetch();
  await Promise.resolve();

  expect(query.state.data()).toBe('original data');
  expect(query.state.fetchStatus()).toBe('fetching');

  await query.cancel({ revert: true, silent: true });

  expect(query.state.data()).toBe('original data');
  expect(query.state.fetchStatus()).toBe('idle');
});

test('cancel with revert: false does not revert state', async () => {
  const queryClient = createQueryClient();

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['cancel-no-revert'],
    queryFn: async ({ signal }) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  });

  void query.fetch({ force: true });
  await Promise.resolve();

  query.state.data('new value');
  await query.cancel({ revert: false, silent: true });

  expect(query.state.data()).toBe('new value');
  expect(query.state.fetchStatus()).toBe('idle');
});

test('cancelQueries with revert: true on initial fetch throws CancelledError', async () => {
  const queryClient = createQueryClient();

  const firstFetch = queryClient.fetchQuery({
    queryKey: ['cancel-initial-revert'],
    queryFn: async ({ signal }) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  });

  await Promise.resolve();

  await expect(
    queryClient.cancelQueries(
      { queryKey: ['cancel-initial-revert'], fetchStatus: 'fetching' },
      { revert: true, silent: false },
    ),
  ).rejects.toBeInstanceOf(CancelledError);

  await firstFetch;
  const query = findQuery(queryClient, 'cancel-initial-revert')!;
  expect(query.state.data()).toBeUndefined();
});

// ──────────────────────────────────────
// Section D — reset()
// ──────────────────────────────────────

test('reset from success returns to pending state', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['reset-success'],
    queryFn: async () => 'data',
    staleTime: 1000,
  });

  const query = findQuery(queryClient, 'reset-success')!;
  expect(query.state.status()).toBe('success');
  expect(query.state.data()).toBe('data');

  queryClient.resetQueries({ queryKey: ['reset-success'] });
  expect(query.state.status()).toBe('pending');
  expect(query.state.data()).toBeUndefined();
  expect(query.state.fetchStatus()).toBe('idle');
});

test('reset from error clears error and returns to pending', async () => {
  const queryClient = createQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ['reset-error'],
    queryFn: async () => {
      throw new Error('fail');
    },
    retry: false,
  });

  const query = findQuery(queryClient, 'reset-error')!;
  expect(query.state.status()).toBe('error');
  expect(query.state.error()).toBeTruthy();

  queryClient.resetQueries({ queryKey: ['reset-error'] });
  expect(query.state.status()).toBe('pending');
  expect(query.state.error()).toBeNull();
});

test('reset clears isInvalidated flag', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['reset-invalidated'],
    queryFn: async () => 'data',
    staleTime: 1000,
  });

  await queryClient.invalidateQueries(
    { queryKey: ['reset-invalidated'] },
    { cancelRefetch: false },
  );

  const query = findQuery(queryClient, 'reset-invalidated')!;
  expect(query.state.isInvalidated()).toBe(true);

  queryClient.resetQueries({ queryKey: ['reset-invalidated'] });
  expect(query.state.isInvalidated()).toBe(false);
});

// ──────────────────────────────────────
// Section E — setQueryData & structuralSharing
// ──────────────────────────────────────

test('setQueryData with updater function', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['set-data-updater'],
    queryFn: async () => 'base value',
  });

  queryClient.setQueryData<string>(['set-data-updater'], (prev) => `${prev} + update`);
  expect(queryClient.getQueryData<string>(['set-data-updater'])).toBe('base value + update');
});

test('setQueryData with undefined updater result is a no-op', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['set-data-undefined'],
    queryFn: async () => 'original',
  });

  queryClient.setQueryData(['set-data-undefined'], () => undefined);
  expect(queryClient.getQueryData(['set-data-undefined'])).toBe('original');
});

test('setQueryData with structuralSharing: false returns fresh reference', async () => {
  const queryClient = createQueryClient({
    defaultOptions: {
      queries: { structuralSharing: false },
    },
  });

  const obj = { a: 1, b: 2 };
  await queryClient.fetchQuery({
    queryKey: ['structural-false'],
    queryFn: async () => obj,
  });

  const data1 = queryClient.getQueryData(['structural-false']);
  expect(data1).toEqual({ a: 1, b: 2 });

  queryClient.setQueryData(['structural-false'], { a: 1, b: 2 });
  const data2 = queryClient.getQueryData(['structural-false']);
  expect(data2).toEqual({ a: 1, b: 2 });
});

test('setQueryData with custom structuralSharing function', async () => {
  const customFn = vi.fn((_oldData: unknown, newData: unknown) => newData);
  const queryClient = createQueryClient({
    defaultOptions: {
      queries: { structuralSharing: customFn as any },
    },
  });

  await queryClient.fetchQuery({
    queryKey: ['custom-structural'],
    queryFn: async () => ({ value: 1 }),
  });

  expect(customFn).toHaveBeenCalled();
  expect(queryClient.getQueryData(['custom-structural'])).toEqual({ value: 1 });
});

// ──────────────────────────────────────
// Section F — Status flags
// ──────────────────────────────────────

test('isLoading is true only when status is pending and fetchStatus is fetching', async () => {
  const queryClient = createQueryClient();

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['is-loading'],
    queryFn: async () => 'data',
  });

  expect(query.state.isLoading()).toBe(false);
  expect(query.state.isPending()).toBe(true);
  expect(query.state.fetchStatus()).toBe('idle');

  const fetchPromise = query.fetch({ force: true });

  expect(query.state.isLoading()).toBe(true);
  expect(query.state.isFetching()).toBe(true);
  expect(query.state.isPending()).toBe(true);

  await fetchPromise;
  expect(query.state.isLoading()).toBe(false);
  expect(query.state.isSuccess()).toBe(true);
});

test('isRefetching is true when fetching and status is success', async () => {
  const queryClient = createQueryClient();
  let resolveRefetch: (value: string) => void = () => {};

  await queryClient.fetchQuery({
    queryKey: ['is-refetching'],
    queryFn: async () => 'initial',
    staleTime: 0,
  });

  const query = findQuery(queryClient, 'is-refetching')!;
  query.resolvedOptions.queryFn = async () =>
    new Promise<string>((resolve) => {
      resolveRefetch = resolve;
    });

  void query.refetch();
  await Promise.resolve();

  expect(query.state.isSuccess()).toBe(true);
  expect(query.state.isFetching()).toBe(true);
  expect(query.state.isRefetching()).toBe(true);

  resolveRefetch('refetched');
  await vi.advanceTimersByTimeAsync(10);

  expect(query.state.isRefetching()).toBe(false);
  expect(query.state.isSuccess()).toBe(true);
  expect(query.state.data()).toBe('refetched');
});

test('isFetched is true after first success', async () => {
  const queryClient = createQueryClient();

  const query = queryClient.cache.build(queryClient, {
    queryKey: ['is-fetched'],
    queryFn: async () => 'data',
  });

  expect(query.state.isFetched()).toBe(false);

  await query.fetch({ force: true });
  expect(query.state.isFetched()).toBe(true);
});

test('isLoadingError is true when initial fetch fails', async () => {
  const queryClient = createQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ['loading-error'],
    queryFn: async () => {
      throw new Error('fail');
    },
    retry: false,
  });

  const query = findQuery(queryClient, 'loading-error')!;
  expect(query.state.isLoadingError()).toBe(true);
  expect(query.state.isError()).toBe(true);
  expect(query.state.data()).toBeUndefined();
});

test('isRefetchError is true when refetch fails after previous success', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['refetch-error'],
    queryFn: async () => 'data',
    staleTime: 0,
  });

  const query = findQuery(queryClient, 'refetch-error')!;
  query.resolvedOptions.queryFn = async () => {
    throw new Error('refetch fail');
  };

  await query.refetch();

  expect(query.state.isRefetchError()).toBe(true);
  expect(query.state.isError()).toBe(true);
  expect(query.state.data()).toBe('data');
});

// ──────────────────────────────────────
// Section G — Cache events & filters
// ──────────────────────────────────────

test('cache.subscribe fires added when a new query is built', async () => {
  const queryClient = createQueryClient();
  const events: string[] = [];

  queryClient.getQueryCache().subscribe((event) => {
    events.push(event.type);
  });

  queryClient.cache.build(queryClient, {
    queryKey: ['cache-event-added'],
    queryFn: async () => 'data',
  });

  expect(events).toContain('added');
});

test('cache.subscribe fires updated on setQueryData', async () => {
  const queryClient = createQueryClient();
  const events: string[] = [];

  await queryClient.fetchQuery({
    queryKey: ['cache-event-updated'],
    queryFn: async () => 'initial',
  });

  queryClient.getQueryCache().subscribe((event) => {
    events.push(event.type);
  });

  queryClient.setQueryData(['cache-event-updated'], 'new value');
  expect(events).toContain('updated');
});

test('cache.subscribe fires removed on removeQueries', async () => {
  const queryClient = createQueryClient();
  const events: string[] = [];

  await queryClient.fetchQuery({
    queryKey: ['cache-event-removed'],
    queryFn: async () => 'data',
  });

  queryClient.getQueryCache().subscribe((event) => {
    events.push(event.type);
  });

  queryClient.removeQueries({ queryKey: ['cache-event-removed'] });
  expect(events).toContain('removed');
});

test('cache.config.onSuccess callback fires on successful fetch', async () => {
  const onSuccess = vi.fn();
  const cache = new QueryCache({ onSuccess });

  const queryClient = createQueryClient({ queryCache: cache as any });

  await queryClient.fetchQuery({
    queryKey: ['on-success-cb'],
    queryFn: async () => 'data',
  });

  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(onSuccess).toHaveBeenCalledWith('data', expect.any(Object));
});

test('cache.findAll filters by stale option', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['filter-stale-yes'],
    queryFn: async () => 'stale data',
    staleTime: 0,
  });

  await queryClient.fetchQuery({
    queryKey: ['filter-stale-no'],
    queryFn: async () => 'fresh data',
    staleTime: 10000,
  });

  const staleQueries = queryClient.getQueryCache().findAll({ stale: true });
  const freshQueries = queryClient.getQueryCache().findAll({ stale: false });

  const staleKeys = staleQueries.map((q) => q.resolvedOptions.queryKey[0]);
  const freshKeys = freshQueries.map((q) => q.resolvedOptions.queryKey[0]);

  expect(staleKeys).toContain('filter-stale-yes');
  expect(staleKeys).not.toContain('filter-stale-no');
  expect(freshKeys).toContain('filter-stale-no');
  expect(freshKeys).not.toContain('filter-stale-yes');
});

// ──────────────────────────────────────
// Section H — throwOnError, staleTime
// ──────────────────────────────────────

test('refetch with throwOnError: true rethrows fetch error', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['throw-on-refetch'],
    queryFn: async () => 'data',
    staleTime: 0,
  });

  const query = findQuery(queryClient, 'throw-on-refetch')!;
  query.resolvedOptions.queryFn = async () => {
    throw new Error('refetch err');
  };

  await expect(query.refetch({ throwOnError: true })).rejects.toThrow('refetch err');
});

test('staleTime: static — invalidateQueries does not refetch', async () => {
  const queryClient = createQueryClient();
  let callCount = 0;

  await queryClient.fetchQuery({
    queryKey: ['static-stale'],
    queryFn: async () => {
      callCount++;
      return 'data';
    },
    staleTime: 'static',
  });

  await queryClient.invalidateQueries({ queryKey: ['static-stale'] }, { cancelRefetch: false });

  expect(callCount).toBe(1);
});

test('staleTime: Infinity — data never goes stale', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['stale-infinity'],
    queryFn: async () => 'data',
    staleTime: Infinity,
  });

  const query = findQuery(queryClient, 'stale-infinity')!;
  expect(query.state.isStale()).toBe(false);
});
