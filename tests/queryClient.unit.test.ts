import { describe, expect, it, vi } from 'vite-plus/test';
import { createQueryClient } from '../src/index.ts';

let keyCounter = 0;
const queryKey = () => [`query_${keyCounter++}`];

describe('queryClient', () => {
  describe('defaultOptions', () => {
    it('should merge defaultOptions', () => {
      const key = queryKey();

      const queryFn = () => Promise.resolve('data');
      const testClient = createQueryClient({
        defaultOptions: { queries: { queryFn } },
      });

      expect(() => testClient.prefetchQuery({ queryKey: key })).not.toThrow();
    });

    it('should get defaultOptions', () => {
      const queryFn = () => Promise.resolve('data');
      const defaultOptions = { queries: { queryFn } };
      const testClient = createQueryClient({ defaultOptions });
      expect(testClient.getDefaultOptions()).toMatchObject(defaultOptions);
    });
  });

  describe('setQueryDefaults', () => {
    it('should not trigger a fetch', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryDefaults(key, { queryFn: () => Promise.resolve('data') });
      const data = queryClient.getQueryData(key);
      expect(data).toBeUndefined();
    });

    it('should update existing query defaults', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      const queryOptions1 = { queryFn: () => Promise.resolve('data') };
      const queryOptions2 = { retry: false };
      queryClient.setQueryDefaults(key, { ...queryOptions1 });
      queryClient.setQueryDefaults(key, { ...queryOptions2 });
      expect(queryClient.getQueryDefaults(key)).toMatchObject(queryOptions2);
    });
  });

  describe('setQueryData', () => {
    it('should not crash if query could not be found', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
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
      const queryClient = createQueryClient();
      queryClient.setQueryData([key, { userId: null }], 'Old Data');
      expect(() => {
        queryClient.setQueryData([key, { userId: null }], 'New Data');
      }).not.toThrow();
    });

    it('should create a new query if query was not found 1', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryData(key, 'bar');
      expect(queryClient.getQueryData(key)).toBe('bar');
    });

    it('should create a new query if query was not found 2', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryData(key, 'qux');
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should not create a new query if query was not found and data is undefined', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
      queryClient.setQueryData(key, undefined);
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
    });

    it('should not create a new query if query was not found and updater returns undefined', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
      queryClient.setQueryData(key, () => undefined);
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(undefined);
    });

    it('should not update query data if data is undefined', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryData(key, 'qux');
      queryClient.setQueryData(key, undefined);
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should not update query data if updater returns undefined', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryData<string>(key, 'qux');
      queryClient.setQueryData<string>(key, () => undefined);
      expect(queryClient.getQueryData(key)).toBe('qux');
    });

    it('should accept an update function', () => {
      const key = queryKey();
      const queryClient = createQueryClient();

      const updater = vi.fn((oldData) => `new data + ${oldData}`);

      queryClient.setQueryData(key, 'test data');
      queryClient.setQueryData(key, updater);

      expect(updater).toHaveBeenCalled();
      expect(queryClient.getQueryData(key)).toEqual('new data + test data');
    });

    it('should set the new data without comparison if structuralSharing is set to false', () => {
      const key = queryKey();
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();
      queryClient.setQueryData([key, 'id'], 'bar');
      expect(queryClient.getQueryData([key, 'id'])).toBe('bar');
    });

    it('should return undefined if the query is not found', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      expect(queryClient.getQueryData(key)).toBeUndefined();
    });

    it('should match exact by default', () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      queryClient.setQueryData([key, 'id'], 'bar');
      expect(queryClient.getQueryData([key])).toBeUndefined();
    });
  });

  describe('ensureQueryData', () => {
    it('should return the cached query data if the query is found', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      const queryFn = () => Promise.resolve('data');

      queryClient.setQueryData([key, 'id'], 'bar');

      await expect(
        queryClient.ensureQueryData({ queryKey: [key, 'id'], queryFn }),
      ).resolves.toEqual('bar');
    });

    it('should return the cached query data if the query is found and cached query data is falsy', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      const queryFn = () => Promise.resolve(0);

      queryClient.setQueryData([key, 'id'], null);

      await expect(
        queryClient.ensureQueryData({ queryKey: [key, 'id'], queryFn }),
      ).resolves.toEqual(null);
    });

    it('should call fetchQuery and return its results if the query is not found', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();
      const queryFn = () => Promise.resolve('data');

      await expect(queryClient.ensureQueryData({ queryKey: [key], queryFn })).resolves.toEqual(
        'data',
      );
    });

    it('should not fetch with initialData', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();
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
  });

  describe('removeQueries', () => {
    it('should not crash when exact is provided', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();

      const fetchFn = () => Promise.resolve('data');

      await queryClient.prefetchQuery({ queryKey: key, queryFn: fetchFn });
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBeTruthy();

      expect(() => queryClient.removeQueries({ queryKey: key, exact: true })).not.toThrow();

      expect(queryClient.getQueryCache().find({ queryKey: key })).toBeFalsy();
    });
  });

  describe('fetchQuery', () => {
    it('should not retry by default', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();

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

    it('should not force fetch if cached data is within staleTime', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();
      const mutationOptions1 = { mutationFn: () => Promise.resolve('data') };
      const mutationOptions2 = { retry: false };
      queryClient.setMutationDefaults(key, mutationOptions1);
      queryClient.setMutationDefaults(key, mutationOptions2);
      expect(queryClient.getMutationDefaults(key)).toMatchObject(mutationOptions2);
    });

    it('should return only matching defaults when multiple mutation defaults are set', () => {
      const key1 = queryKey();
      const key2 = queryKey();
      const queryClient = createQueryClient();
      const mutationOptions1 = { retry: 1 };
      const mutationOptions2 = { retry: 2 };
      queryClient.setMutationDefaults(key1, mutationOptions1);
      queryClient.setMutationDefaults(key2, mutationOptions2);

      expect(queryClient.getMutationDefaults(key1)).toMatchObject(mutationOptions1);
      expect(queryClient.getMutationDefaults(key2)).toMatchObject(mutationOptions2);
    });
  });

  describe('resetQueries', () => {
    it('should notify listeners when a query is reset', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();

      const callback = vi.fn();

      await queryClient.prefetchQuery({ queryKey: key, queryFn: () => Promise.resolve('data') });

      queryClient.getQueryCache().subscribe(callback);

      void queryClient.resetQueries({ queryKey: key });

      expect(callback).toHaveBeenCalled();
    });

    it('should reset query', async () => {
      const key = queryKey();
      const queryClient = createQueryClient();

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
      const queryClient = createQueryClient();

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
});
