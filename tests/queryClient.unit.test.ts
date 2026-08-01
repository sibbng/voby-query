import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '../src/index.ts';
import { QueryObserver } from '../src/queryObserver';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

let keyCounter = 0;
const queryKey = () => [`query_${keyCounter++}`];

describe('queryClient', () => {
  it('isMutating counts only pending mutations even when filters are provided', async () => {
    const queryClient = new QueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['is-mutating-status'],
      mutationFn: async () => 'data',
    });

    await mutation.mutate('value');

    expect(queryClient.isMutating({ mutationKey: ['is-mutating-status'] })).toBe(0);
    expect(queryClient.isMutating({ mutationKey: ['is-mutating-status'], status: 'success' })).toBe(
      0,
    );
  });

  describe('defaultOptions', () => {
    it('should merge defaultOptions', () => {
      const key = queryKey();

      const queryFn = () => Promise.resolve('data');
      const testClient = new QueryClient({
        defaultOptions: { queries: { queryFn } },
      });

      expect(() => testClient.prefetchQuery({ queryKey: key })).not.toThrow();
    });

    it('should get defaultOptions', () => {
      const queryFn = () => Promise.resolve('data');
      const defaultOptions = { queries: { queryFn } };
      const testClient = new QueryClient({ defaultOptions });
      expect(testClient.getDefaultOptions()).toMatchObject(defaultOptions);
    });
  });

  describe('setDefaultOptions', () => {
    it('should accept queries options without queryKey', () => {
      const queryClient = new QueryClient();
      queryClient.setDefaultOptions({
        queries: {
          staleTime: 5000,
          gcTime: 30000,
          retry: 1,
        },
      });
      const defaults = queryClient.getDefaultOptions();
      expect(defaults.queries.staleTime).toBe(5000);
      expect(defaults.queries.gcTime).toBe(30000);
    });

    it('should accept mutations options', () => {
      const queryClient = new QueryClient();
      const mutationFn = () => Promise.resolve('data');
      queryClient.setDefaultOptions({
        mutations: {
          mutationFn,
          retry: 2,
        },
      });
      const defaults = queryClient.getDefaultOptions();
      expect(defaults.mutations.mutationFn).toBe(mutationFn);
      expect(defaults.mutations.retry).toBe(2);
    });

    it('should replace previous options instead of merging them', () => {
      const queryClient = new QueryClient();
      queryClient.setDefaultOptions({ queries: { staleTime: 5000 } });
      queryClient.setDefaultOptions({ queries: { gcTime: 10000 } });

      const defaults = queryClient.getDefaultOptions();
      expect(defaults.queries.staleTime).toBe(0);
      expect(defaults.queries.gcTime).toBe(10000);
      expect(defaults.queries.retry).toBe(3);
    });

    it('should return the same default options reference until replaced', () => {
      const queryClient = new QueryClient();
      const first = queryClient.getDefaultOptions();
      expect(queryClient.getDefaultOptions()).toBe(first);

      queryClient.setDefaultOptions({ queries: { staleTime: 5000 } });
      expect(queryClient.getDefaultOptions()).not.toBe(first);
    });
  });

  describe('setQueryDefaults', () => {
    it('should not trigger a fetch', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryDefaults(key, { queryFn: () => Promise.resolve('data') });
      const data = queryClient.getQueryData(key);
      expect(data).toBeUndefined();
    });

    it('should update existing query defaults', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryOptions1 = { queryFn: () => Promise.resolve('data') };
      const queryOptions2 = { retry: false };
      queryClient.setQueryDefaults(key, { ...queryOptions1 });
      queryClient.setQueryDefaults(key, { ...queryOptions2 });
      expect(queryClient.getQueryDefaults(key)).toMatchObject(queryOptions2);
    });

    it('should merge defaults for keys that match', () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      queryClient.setQueryDefaults([...key, 'todo'], { suspense: true });
      queryClient.setQueryDefaults([...key, 'todo', 'detail'], { staleTime: 5000 });

      expect(queryClient.getQueryDefaults([...key, 'todo', 'detail'])).toMatchObject({
        suspense: true,
        staleTime: 5000,
      });
    });
  });

  describe('setQueryData', () => {
    it('should not crash if query could not be found', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const user = { userId: 1 };
      expect(() => {
        queryClient.setQueryData([key, user], (prevUser?: typeof user) => ({
          ...prevUser!,
          name: 'James',
        }));
      }).not.toThrow();
    });

    it('should not crash when variable is null', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData([key, { userId: null }], 'Old Data');
      expect(() => {
        queryClient.setQueryData([key, { userId: null }], 'New Data');
      }).not.toThrow();
    });

    it('should create a new query if query was not found 1', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData(key, 'bar');
      expect(queryClient.getQueryData(key)).toBe('bar');
    });

    it('should create a new query if query was not found 2', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData(key, 'qux');
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should not create a new query if query was not found and data is undefined', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
      queryClient.setQueryData(key, undefined);
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
    });

    it('should not create a new query if query was not found and updater returns undefined', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
      queryClient.setQueryData(key, () => undefined);
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
    });

    it('should not update query data if data is undefined', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData(key, 'qux');
      queryClient.setQueryData(key, undefined);
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should not update query data if updater returns undefined', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData<string>(key, 'qux');
      queryClient.setQueryData<string>(key, () => undefined);
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should accept an update function', () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const updater = vi.fn((oldData) => `new data + ${oldData}`);

      queryClient.setQueryData(key, 'test data');
      queryClient.setQueryData(key, updater);

      expect(updater).toHaveBeenCalled();
      expect(queryClient.getQueryData(key)).toEqual('new data + test data');
    });

    it('should set the new data without comparison if structuralSharing is set to false', () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      queryClient.setDefaultOptions({
        queries: {
          structuralSharing: false,
        },
      });

      const oldData = { value: true };
      const newData = { value: true };
      queryClient.setQueryData(key, oldData);
      queryClient.setQueryData(key, newData);

      expect(queryClient.getQueryCache().find({ queryKey: key })!.state.data()).toBe(newData);
    });
  });

  describe('getQueryData', () => {
    it('should return the query data if the query is found', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData([key, 'id'], 'bar');
      expect(queryClient.getQueryData([key, 'id'])).toBe('bar');
    });

    it('should return undefined if the query is not found', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      expect(queryClient.getQueryData(key)).toBeUndefined();
    });

    it('should match exact by default', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      queryClient.setQueryData([key, 'id'], 'bar');
      expect(queryClient.getQueryData([key])).toBeUndefined();
    });
  });

  describe('ensureQueryData', () => {
    it('should return the cached query data if the query is found', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.resolve('data');

      queryClient.setQueryData([key, 'id'], 'bar');

      await expect(
        queryClient.ensureQueryData({ queryKey: [key, 'id'], queryFn }),
      ).resolves.toEqual('bar');
    });

    it('should return the cached query data if the query is found and cached query data is falsy', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.resolve(0);

      queryClient.setQueryData([key, 'id'], null);

      await expect(
        queryClient.ensureQueryData({ queryKey: [key, 'id'], queryFn }),
      ).resolves.toEqual(null);
    });

    it('should call fetchQuery and return its results if the query is not found', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.resolve('data');

      await expect(queryClient.ensureQueryData({ queryKey: [key], queryFn })).resolves.toEqual(
        'data',
      );
    });

    it('should not fetch with initialData', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn().mockImplementation(() => Promise.resolve('data'));

      await expect(
        queryClient.ensureQueryData({
          queryKey: [key, 'id'],
          queryFn,
          initialData: 'initial',
        }),
      ).resolves.toEqual('initial');

      expect(queryFn).toHaveBeenCalledTimes(0);
    });

    it('should reject when the queryFn fails', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.reject(new Error('fail'));

      await expect(queryClient.ensureQueryData({ queryKey: [key], queryFn })).rejects.toThrow(
        'fail',
      );
    });

    it('should reject when the infinite queryFn fails', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.reject(new Error('fail'));

      await expect(
        queryClient.ensureInfiniteQueryData({
          queryKey: [key],
          queryFn: queryFn as any,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
        }),
      ).rejects.toThrow('fail');
    });
  });

  describe('removeQueries', () => {
    it('should not crash when exact is provided', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const fetchFn = () => Promise.resolve('data');

      await queryClient.prefetchQuery({ queryKey: key, queryFn: fetchFn });
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBeTruthy();

      expect(() => queryClient.removeQueries({ queryKey: key, exact: true })).not.toThrow();

      expect(queryClient.getQueryCache().find({ queryKey: key })).toBeFalsy();
    });
  });

  describe('fetchInfiniteQuery', () => {
    it('should fetch initial infinite data when not cached', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn().mockImplementation(async ({ pageParam }: { pageParam: number }) => {
        return { items: [`page ${pageParam}`], next: pageParam + 1 };
      });

      const data = await queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (lastPage: { next: number }) => lastPage.next,
      });

      expect(data).toEqual({
        pages: [{ items: ['page 1'], next: 2 }],
        pageParams: [1],
      });
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('should return cached data on cache hit when still fresh', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn().mockImplementation(async ({ pageParam }: { pageParam: number }) => {
        return { items: [`page ${pageParam}`], next: pageParam + 1 };
      });

      const first = await queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (lastPage: { next: number }) => lastPage.next,
        staleTime: 5000,
      });

      const second = await queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (lastPage: { next: number }) => lastPage.next,
        staleTime: 5000,
      });

      expect(first).toEqual(second);
      expect(queryFn).toHaveBeenCalledTimes(1); // returned from cache
    });

    it('should refetch when stale', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn().mockImplementation(async ({ pageParam }: { pageParam: number }) => {
        return { items: [`page ${pageParam}`] };
      });

      await queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn,
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        staleTime: 0,
      });

      await queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn,
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        staleTime: 0,
      });

      expect(queryFn).toHaveBeenCalledTimes(2); // refetched because stale
    });

    it('should not retry by default', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = () => Promise.reject(new Error('fail'));

      await expect(
        queryClient.fetchInfiniteQuery({
          queryKey: key,
          queryFn: queryFn as any,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        }),
      ).rejects.toThrow('fail');
    });

    it('should reject when retries are exhausted with an explicit retry option', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      let callCount = 0;

      const promise = queryClient.fetchInfiniteQuery({
        queryKey: key,
        queryFn: (() => {
          callCount++;
          return Promise.reject(new Error('fail'));
        }) as any,
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        retry: 1,
        retryDelay: 0,
      });
      const assertion = expect(promise).rejects.toThrow('fail');

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1);

      await assertion;
      expect(callCount).toBe(2);
    });
  });

  describe('ensureInfiniteQueryData', () => {
    it('should return cached infinite data if the query exists', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn();

      queryClient.setQueryData(key, {
        pages: [{ value: 'cached' }],
        pageParams: [1],
      });

      const data = await queryClient.ensureInfiniteQueryData({
        queryKey: key,
        queryFn: queryFn as any,
        initialPageParam: 1,
        getNextPageParam: () => undefined,
      });

      expect(data).toEqual({ pages: [{ value: 'cached' }], pageParams: [1] });
      expect(queryFn).toHaveBeenCalledTimes(0);
    });

    it('should fetch and return initial data if not cached', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn().mockImplementation(async ({ pageParam }: { pageParam: number }) => {
        return { value: `fetched ${pageParam}`, next: pageParam + 1 };
      });

      const data = await queryClient.ensureInfiniteQueryData({
        queryKey: key,
        queryFn,
        initialPageParam: 5,
        getNextPageParam: (lastPage: { next: number }) => lastPage.next,
      });

      expect(data).toEqual({
        pages: [{ value: 'fetched 5', next: 6 }],
        pageParams: [5],
      });
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('should respect initialData', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const queryFn = vi.fn();

      const data = await queryClient.ensureInfiniteQueryData({
        queryKey: key,
        queryFn: queryFn as any,
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        initialData: { pages: [{ value: 'initial' }], pageParams: [1] },
      });

      expect(data).toEqual({ pages: [{ value: 'initial' }], pageParams: [1] });
      expect(queryFn).toHaveBeenCalledTimes(0);
    });
  });

  describe('fetchQuery', () => {
    it('should not retry by default', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      await expect(
        queryClient.fetchQuery({
          queryKey: key,
          queryFn: (): Promise<unknown> => {
            throw new Error('error');
          },
        }),
      ).rejects.toEqual(new Error('error'));
    });

    it('should return the cached data on cache hit', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const fetchFn = () => Promise.resolve('data');
      const first = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchFn,
      });
      const second = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchFn,
      });

      expect(second).toBe(first);
    });

    it('should allow new meta', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const first = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: ({ meta }) => Promise.resolve(meta),
        meta: {
          foo: true,
        },
      });
      expect(first).toStrictEqual({ foo: true });

      const second = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: ({ meta }) => Promise.resolve(meta),
        meta: {
          foo: false,
        },
      });
      expect(second).toStrictEqual({ foo: false });
    });

    it('should reject when retries are exhausted with an explicit retry option', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      let callCount = 0;

      const promise = queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => {
          callCount++;
          throw new Error('error');
        },
        retry: 1,
        retryDelay: 0,
      });
      const assertion = expect(promise).rejects.toEqual(new Error('error'));

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1);

      await assertion;
      expect(callCount).toBe(2);
    });

    it('should not force fetch if cached data is within staleTime', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      queryClient.setQueryData(key, 'og');
      const fetchFn = () => Promise.resolve('new');
      const first = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchFn,
        staleTime: 100,
      });
      expect(first).toBe('og');
    });
  });

  describe('prefetchQuery', () => {
    it('should return undefined when an error is thrown', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const result = await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: (): Promise<unknown> => {
          throw new Error('error');
        },
        retry: false,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('setMutationDefaults', () => {
    it('should update existing mutation defaults', () => {
      const key = queryKey();
      const queryClient = new QueryClient();
      const mutationOptions1 = { mutationFn: () => Promise.resolve('data') };
      const mutationOptions2 = { retry: false };
      queryClient.setMutationDefaults(key, mutationOptions1);
      queryClient.setMutationDefaults(key, mutationOptions2);
      expect(queryClient.getMutationDefaults(key)).toMatchObject(mutationOptions2);
    });

    it('should return only matching defaults when multiple mutation defaults are set', () => {
      const key1 = queryKey();
      const key2 = queryKey();
      const queryClient = new QueryClient();
      const mutationOptions1 = { retry: 1 };
      const mutationOptions2 = { retry: 2 };
      queryClient.setMutationDefaults(key1, mutationOptions1);
      queryClient.setMutationDefaults(key2, mutationOptions2);

      expect(queryClient.getMutationDefaults(key1)).toMatchObject(mutationOptions1);
      expect(queryClient.getMutationDefaults(key2)).toMatchObject(mutationOptions2);
    });

    it('should merge defaults for keys that match', () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      queryClient.setMutationDefaults([...key, 'todo'], { retry: 1 });
      queryClient.setMutationDefaults([...key, 'todo', 'detail'], { retryDelay: 100 });

      expect(queryClient.getMutationDefaults([...key, 'todo', 'detail'])).toMatchObject({
        retry: 1,
        retryDelay: 100,
      });
    });
  });

  describe('resetQueries', () => {
    it('should notify listeners when a query is reset', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      const callback = vi.fn();

      await queryClient.prefetchQuery({ queryKey: key, queryFn: () => Promise.resolve('data') });

      queryClient.getQueryCache().subscribe(callback);

      void queryClient.resetQueries({ queryKey: key });

      expect(callback).toHaveBeenCalled();
    });

    it('should reset query', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      await queryClient.prefetchQuery({ queryKey: key, queryFn: () => Promise.resolve('data') });

      const query = queryClient.getQueryCache().find({ queryKey: key })!;
      expect(query.state.data()).toEqual('data');
      expect(query.state.status()).toEqual('success');

      void queryClient.resetQueries({ queryKey: key });

      expect(query.state.data()).toBeUndefined();
      expect(query.state.status()).toEqual('pending');
      expect(query.state.fetchStatus()).toEqual('idle');
    });

    it('should reset query data to initial data if set', async () => {
      const key = queryKey();
      const queryClient = new QueryClient();

      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: () => Promise.resolve('data'),
        initialData: 'initial',
      });

      const query = queryClient.getQueryCache().find({ queryKey: key })!;
      expect(query.state.data()).toEqual('data');

      void queryClient.resetQueries({ queryKey: key });

      expect(query.state.data()).toEqual('initial');
    });
  });

  describe('refetchQueries', () => {
    it('should not refetch static queries', async () => {
      const queryClient = new QueryClient();
      const key = queryKey();

      const queryFn = vi.fn(async () => 'data');
      await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 'static' });

      const query = queryClient.getQueryCache().find({ queryKey: key })!;
      const observer = new QueryObserver(query, { staleTime: 'static' });
      const unsubscribe = observer.subscribe(() => {});

      await vi.advanceTimersByTimeAsync(0);
      expect(queryFn).toHaveBeenCalledTimes(1);

      await queryClient.refetchQueries({ queryKey: key });
      await vi.advanceTimersByTimeAsync(0);

      expect(queryFn).toHaveBeenCalledTimes(1);

      unsubscribe();
      observer.destroy();
    });

    it('should refetch queries with an enabled observer even if the query was built disabled', async () => {
      const queryClient = new QueryClient();
      const key = queryKey();

      const queryFn = vi.fn(async () => 'data');
      const query = queryClient.getQueryCache().build(queryClient, {
        queryKey: key,
        queryFn,
        enabled: false,
      });
      const observer = new QueryObserver(query, { enabled: true });
      const unsubscribe = observer.subscribe(() => {});

      await vi.advanceTimersByTimeAsync(0);
      expect(queryFn).toHaveBeenCalledTimes(1);

      await queryClient.refetchQueries({ queryKey: key });
      await vi.advanceTimersByTimeAsync(0);

      expect(queryFn).toHaveBeenCalledTimes(2);

      unsubscribe();
      observer.destroy();
    });

    it('should not refetch queries that were never fetched and have no observers', async () => {
      const queryClient = new QueryClient();
      const key = queryKey();

      const queryFn = vi.fn(async () => 'data');
      queryClient.getQueryCache().build(queryClient, { queryKey: key, queryFn });

      await queryClient.refetchQueries({ queryKey: key });
      await vi.advanceTimersByTimeAsync(0);

      expect(queryFn).toHaveBeenCalledTimes(0);
    });
  });

  describe('invalidateQueries', () => {
    it('should not refetch static queries', async () => {
      const queryClient = new QueryClient();
      const key = queryKey();

      const queryFn = vi.fn(async () => 'data');
      await queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 'static' });

      const query = queryClient.getQueryCache().find({ queryKey: key })!;
      const observer = new QueryObserver(query, { staleTime: 'static' });
      const unsubscribe = observer.subscribe(() => {});

      await vi.advanceTimersByTimeAsync(0);
      expect(queryFn).toHaveBeenCalledTimes(1);

      await queryClient.invalidateQueries({ queryKey: key });
      await vi.advanceTimersByTimeAsync(0);

      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(query.state.isInvalidated()).toBe(true);

      unsubscribe();
      observer.destroy();
    });
  });
});
