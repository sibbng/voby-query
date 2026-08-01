import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '../src/index.ts';
import { MutationCache } from '../src/mutationCache.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

let keyCounter = 0;
const mutationKey = () => [`mutation_${keyCounter++}`];

const executeMutation = (queryClient: QueryClient, options: any, variables: any) => {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    throwOnError: true,
    ...options,
  }) as any;
  return mutation.mutate(variables);
};

describe('mutationCache', () => {
  it('creates separate mutations for the same mutationKey', () => {
    const queryClient = new QueryClient();
    const cache = queryClient.getMutationCache();
    const options = {
      mutationKey: ['same-mutation'],
      mutationFn: async () => 'data',
    };

    const mutation1 = cache.build(queryClient, options);
    const mutation2 = cache.build(queryClient, options);

    expect(mutation2).not.toBe(mutation1);
    expect(cache.getAll()).toHaveLength(2);
  });

  describe('config callbacks', () => {
    it('should await configured cache callbacks in upstream order', async () => {
      const order: string[] = [];
      const key = mutationKey();
      const onMutate = vi.fn(() => {
        order.push('cache-onMutate');
      });
      const onSuccess = vi.fn(async () => {
        order.push('cache-onSuccess');
        await Promise.resolve();
      });
      const onSettled = vi.fn(() => {
        order.push('cache-onSettled');
      });
      const cache = new MutationCache({ onMutate, onSuccess, onSettled });
      const queryClient = new QueryClient({ mutationCache: cache });
      const optionOnMutate = vi.fn(() => {
        order.push('option-onMutate');
        return { rollback: true };
      });
      const optionOnSuccess = vi.fn(() => {
        order.push('option-onSuccess');
      });
      const optionOnSettled = vi.fn(() => {
        order.push('option-onSettled');
      });

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          meta: { source: 'test' },
          mutationFn: async () => 'data',
          onMutate: optionOnMutate,
          onSuccess: optionOnSuccess,
          onSettled: optionOnSettled,
        },
        'vars',
      );

      const mutation = cache.getAll()[0];
      const mutationContext = {
        client: queryClient,
        meta: { source: 'test' },
        mutationKey: key,
      };

      expect(order).toEqual([
        'cache-onMutate',
        'option-onMutate',
        'cache-onSuccess',
        'option-onSuccess',
        'cache-onSettled',
        'option-onSettled',
      ]);
      expect(onMutate).toHaveBeenCalledWith('vars', mutation, mutationContext);
      expect(onSuccess).toHaveBeenCalledWith(
        'data',
        'vars',
        { rollback: true },
        mutation,
        mutationContext,
      );
      expect(onSettled).toHaveBeenCalledWith(
        'data',
        null,
        'vars',
        { rollback: true },
        mutation,
        mutationContext,
      );
    });

    it('should run configured error callbacks before option callbacks', async () => {
      const order: string[] = [];
      const key = mutationKey();
      const error = new Error('cache-error');
      const onError = vi.fn(() => {
        order.push('cache-onError');
      });
      const onSettled = vi.fn(() => {
        order.push('cache-onSettled');
      });
      const cache = new MutationCache({ onError, onSettled });
      const queryClient = new QueryClient({ mutationCache: cache });
      const optionOnMutate = vi.fn(() => {
        return { rollback: true };
      });
      const optionOnError = vi.fn(() => {
        order.push('option-onError');
      });
      const optionOnSettled = vi.fn(() => {
        order.push('option-onSettled');
      });

      await expect(
        executeMutation(
          queryClient,
          {
            mutationKey: key,
            mutationFn: async () => {
              throw error;
            },
            onMutate: optionOnMutate,
            onError: optionOnError,
            onSettled: optionOnSettled,
          },
          'vars',
        ),
      ).rejects.toBe(error);

      const mutation = cache.getAll()[0];
      const mutationContext = {
        client: queryClient,
        meta: undefined,
        mutationKey: key,
      };

      expect(order).toEqual([
        'cache-onError',
        'option-onError',
        'cache-onSettled',
        'option-onSettled',
      ]);
      expect(onError).toHaveBeenCalledWith(
        error,
        'vars',
        { rollback: true },
        mutation,
        mutationContext,
      );
      expect(onSettled).toHaveBeenCalledWith(
        undefined,
        error,
        'vars',
        { rollback: true },
        mutation,
        mutationContext,
      );
    });

    it('should call onError when a mutation errors', async () => {
      const key = mutationKey();
      const onError = vi.fn();

      const queryClient = new QueryClient();
      const cache = queryClient.getMutationCache();

      await expect(
        executeMutation(
          queryClient,
          {
            mutationKey: key,
            mutationFn: async () => {
              throw new Error('error');
            },
            onError,
          },
          'vars',
        ),
      ).rejects.toThrow('error');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        new Error('error'),
        'vars',
        undefined,
        expect.objectContaining({ client: queryClient }),
      );
    });

    it('should call onSuccess when a mutation is successful', async () => {
      const key = mutationKey();
      const onSuccess = vi.fn();

      const queryClient = new QueryClient();

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: async () => ({ data: 5 }),
          onSuccess,
        },
        'vars',
      );

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should call onSettled on error', async () => {
      const key = mutationKey();
      const onSettled = vi.fn();

      const queryClient = new QueryClient();

      await expect(
        executeMutation(
          queryClient,
          {
            mutationKey: key,
            mutationFn: async () => {
              throw new Error('fail');
            },
            onSettled,
          },
          'vars',
        ),
      ).rejects.toThrow('fail');

      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('should call onSettled on success', async () => {
      const key = mutationKey();
      const onSettled = vi.fn();

      const queryClient = new QueryClient();

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: async () => 'data',
          onSettled,
        },
        'vars',
      );

      expect(onSettled).toHaveBeenCalledTimes(1);
    });
  });

  describe('find', () => {
    it('should filter correctly', async () => {
      const testCache = new QueryClient().getMutationCache() as any;
      const queryClient = new QueryClient();
      const key = ['mutation', 'vars'];

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: async () => undefined,
        },
        'vars',
      ).catch(() => {});

      const [mutation] = testCache.getAll();

      expect(testCache.find({ mutationKey: key })).toEqual(mutation);
      expect(testCache.find({ mutationKey: ['mutation'], exact: false })).toEqual(mutation);
      expect(testCache.find({ mutationKey: ['unknown'] })).toEqual(undefined);
    });

    it('should find exact matches by default', async () => {
      const queryClient = new QueryClient();
      const testCache = queryClient.getMutationCache() as any;

      await executeMutation(
        queryClient,
        {
          mutationKey: ['a', 1],
          mutationFn: async () => undefined,
        },
        1,
      ).catch(() => {});

      await executeMutation(
        queryClient,
        {
          mutationKey: ['a', 2],
          mutationFn: async () => undefined,
        },
        2,
      ).catch(() => {});

      const [mutation1] = testCache.getAll();

      expect(testCache.find({ mutationKey: ['a', 1] })).toEqual(mutation1);
      expect(testCache.find({ mutationKey: ['a'], exact: false })).toEqual(mutation1);
      expect(testCache.find({ mutationKey: ['a'] })).toEqual(undefined);
    });
  });

  describe('findAll', () => {
    it('should filter correctly', async () => {
      const queryClient = new QueryClient();
      const testCache = queryClient.getMutationCache() as any;

      await executeMutation(
        queryClient,
        {
          mutationKey: ['a', 1],
          mutationFn: async () => undefined,
        },
        1,
      ).catch(() => {});

      await executeMutation(
        queryClient,
        {
          mutationKey: ['a', 2],
          mutationFn: async () => undefined,
        },
        2,
      ).catch(() => {});

      await executeMutation(
        queryClient,
        {
          mutationKey: ['b'],
          mutationFn: async () => undefined,
        },
        3,
      ).catch(() => {});

      expect(testCache.findAll({ mutationKey: ['a'], exact: false })).toHaveLength(2);
      expect(testCache.findAll({ mutationKey: ['unknown'] })).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should remove only the target mutation', async () => {
      const queryClient = new QueryClient();
      const testCache = queryClient.getMutationCache() as any;

      const mutation1 = testCache.build(queryClient, {
        mutationKey: mutationKey(),
        mutationFn: async () => 'data1',
      });
      const mutation2 = testCache.build(queryClient, {
        mutationKey: mutationKey(),
        mutationFn: async () => 'data2',
      });

      expect(testCache.getAll()).toHaveLength(2);

      testCache.remove(mutation1);

      expect(testCache.getAll()).toHaveLength(1);
      expect(testCache.getAll()).toEqual([mutation2]);
    });

    it('should not throw when removing a non-existent mutation', () => {
      const queryClient = new QueryClient();
      const testCache = queryClient.getMutationCache() as any;

      const mutation = testCache.build(queryClient, {
        mutationKey: mutationKey(),
        mutationFn: async () => 'data',
      });

      testCache.remove(mutation);
      expect(testCache.getAll()).toHaveLength(0);

      expect(() => testCache.remove(mutation)).not.toThrow();
    });
  });

  it('emits one removed event for every mutation when cleared', () => {
    const queryClient = new QueryClient();
    const cache = queryClient.getMutationCache();
    const mutation1 = cache.build(queryClient, {
      mutationKey: mutationKey(),
      mutationFn: async () => 'data1',
    });
    const mutation2 = cache.build(queryClient, {
      mutationKey: mutationKey(),
      mutationFn: async () => 'data2',
    });
    const removedMutations: unknown[] = [];

    cache.subscribe((event) => {
      if (event.type === 'removed') removedMutations.push(event.mutation);
    });

    cache.clear();

    expect(removedMutations).toEqual([mutation1, mutation2]);
    expect(cache.getAll()).toEqual([]);
  });

  it('should retain an unused mutation while it is pending', async () => {
    const queryClient = new QueryClient();
    const cache = queryClient.getMutationCache();
    let resolveMutation!: (value: string) => void;
    const pendingResult = new Promise<string>((resolve) => {
      resolveMutation = resolve;
    });
    const mutation = cache.build(queryClient, {
      gcTime: 10,
      mutationFn: () => pendingResult,
    });
    const removeInstance = mutation.addInstance();
    const promise = mutation.mutate('vars');

    removeInstance();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);

    expect(cache.getAll()).toContain(mutation);

    resolveMutation('data');
    await expect(promise).resolves.toBe('data');
    await vi.advanceTimersByTimeAsync(10);

    expect(cache.getAll()).not.toContain(mutation);
  });
});
