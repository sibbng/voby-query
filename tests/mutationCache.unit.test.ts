import { describe, expect, it, vi } from 'vite-plus/test';
import { createQueryClient } from '../src/index.ts';

let keyCounter = 0;
const mutationKey = () => [`mutation_${keyCounter++}`];

const executeMutation = (
  queryClient: ReturnType<typeof createQueryClient>,
  options: any,
  variables: any,
) => {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    throwOnError: true,
    ...options,
  }) as any;
  return mutation.mutate(variables);
};

describe('mutationCache', () => {
  describe('config callbacks', () => {
    it('should call onError when a mutation errors', async () => {
      const key = mutationKey();
      const onError = vi.fn();

      const queryClient = createQueryClient();
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
      expect(onError).toHaveBeenCalledWith(new Error('error'), 'vars', undefined);
    });

    it('should call onSuccess when a mutation is successful', async () => {
      const key = mutationKey();
      const onSuccess = vi.fn();

      const queryClient = createQueryClient();

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

      const queryClient = createQueryClient();

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

      const queryClient = createQueryClient();

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
      const testCache = createQueryClient().getMutationCache() as any;
      const queryClient = createQueryClient();
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
  });

  describe('findAll', () => {
    it('should filter correctly', async () => {
      const queryClient = createQueryClient();
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
      const queryClient = createQueryClient();
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
      const queryClient = createQueryClient();
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
});
