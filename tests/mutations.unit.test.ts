import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createQueryClient } from '../src/index.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

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
  });
  return (mutation as any).mutate(variables);
};

describe('mutations', () => {
  it('mutate should accept null values', async () => {
    let variables: any;
    const queryClient = createQueryClient();

    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: (vars: unknown) => {
        variables = vars;
        return Promise.resolve(vars);
      },
    });

    await (mutation as any).mutate(null);
    expect(variables).toBe(null);
  });

  it('setMutationDefaults should be able to set defaults', async () => {
    const key = mutationKey();
    const fn = vi.fn();
    const queryClient = createQueryClient();

    queryClient.setMutationDefaults(key, {
      mutationFn: fn,
    });

    await executeMutation(queryClient, { mutationKey: key }, 'vars').catch(() => {});

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('vars');
  });

  it('mutate should throw an error if no mutationFn found', async () => {
    const queryClient = createQueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: undefined as any,
      throwOnError: true,
    });

    let error: any;
    try {
      await (mutation as any).mutate();
    } catch (err) {
      error = err;
    }
    expect(error).toEqual(new Error('No mutationFn found'));
  });

  it('mutate should return the result data on success', async () => {
    const queryClient = createQueryClient();

    const result = await executeMutation(
      queryClient,
      {
        mutationFn: async () => 'success-data',
      },
      'vars',
    );

    expect(result).toBe('success-data');
  });

  it('mutations should run and resolve in parallel by default', async () => {
    const key1 = mutationKey();
    const key2 = mutationKey();
    const queryClient = createQueryClient();
    const results: string[] = [];

    const p1 = executeMutation(
      queryClient,
      {
        mutationKey: key1,
        mutationFn: async () => {
          results.push('start-A');
          await Promise.resolve();
          results.push('finish-A');
          return 'a';
        },
      },
      'vars1',
    );

    const p2 = executeMutation(
      queryClient,
      {
        mutationKey: key2,
        mutationFn: async () => {
          results.push('start-B');
          await Promise.resolve();
          results.push('finish-B');
          return 'b';
        },
      },
      'vars2',
    );

    await Promise.all([p1, p2]);

    expect(results).toStrictEqual(['start-A', 'start-B', 'finish-A', 'finish-B']);
  });

  describe('callback return types', () => {
    it('should handle all sync callback patterns', async () => {
      const key = mutationKey();
      const queryClient = createQueryClient();
      const results: string[] = [];

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: () => Promise.resolve('success'),
          onMutate: () => {
            results.push('onMutate-sync');
            return { backup: 'data' };
          },
          onSuccess: () => {
            results.push('onSuccess-implicit-void');
          },
          onError: () => {
            results.push('onError-explicit-void');
            return;
          },
          onSettled: () => {
            results.push('onSettled-return-value');
            return 'ignored-value';
          },
        },
        'vars',
      );

      expect(results).toEqual([
        'onMutate-sync',
        'onSuccess-implicit-void',
        'onSettled-return-value',
      ]);
    });

    it('should handle all async callback patterns', async () => {
      const key = mutationKey();
      const queryClient = createQueryClient();
      const results: string[] = [];

      await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: () => Promise.resolve('success'),
          onMutate: async () => {
            results.push('onMutate-async');
            return { backup: 'async-data' };
          },
          onSuccess: async () => {
            results.push('onSuccess-async-start');
            await Promise.resolve();
            results.push('onSuccess-async-end');
          },
          onSettled: () => {
            results.push('onSettled-promise');
            return Promise.resolve('also-ignored');
          },
        },
        'vars',
      );

      expect(results).toEqual([
        'onMutate-async',
        'onSuccess-async-start',
        'onSuccess-async-end',
        'onSettled-promise',
      ]);
    });

    it('should handle mixed sync/async patterns and return value isolation', async () => {
      const key = mutationKey();
      const queryClient = createQueryClient();
      const results: string[] = [];

      const mutationResult = await executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: () => Promise.resolve('actual-result'),
          onMutate: () => {
            results.push('sync-onMutate');
            return { rollback: 'data' };
          },
          onSuccess: async () => {
            results.push('async-onSuccess');
            await Promise.resolve();
            return 'success-return-ignored';
          },
          onError: () => {
            results.push('sync-onError');
            return Promise.resolve('error-return-ignored');
          },
        },
        'vars',
      );

      expect(mutationResult).toBe('actual-result');
      expect(results).toEqual(['sync-onMutate', 'async-onSuccess']);
    });

    it('should handle error cases with all callback patterns', async () => {
      const key = mutationKey();
      const queryClient = createQueryClient();
      const results: string[] = [];
      const newMutationError = new Error('mutation-error');

      let mutationError: Error | undefined;

      const mutationPromise = executeMutation(
        queryClient,
        {
          mutationKey: key,
          mutationFn: () => Promise.reject(newMutationError),
          onMutate: () => {
            results.push('onMutate');
            return { backup: 'error-data' };
          },
          onSuccess: () => {
            results.push('onSuccess-should-not-run');
          },
          onError: async () => {
            results.push('onError-async');
            await Promise.resolve();
            return Promise.all([
              Promise.resolve().then(() => results.push('error-cleanup-1')),
              Promise.resolve().then(() => results.push('error-cleanup-2')),
            ]);
          },
        },
        'vars',
      ).catch((error: Error) => {
        mutationError = error;
      });

      await mutationPromise;

      expect(results).toEqual(['onMutate', 'onError-async', 'error-cleanup-1', 'error-cleanup-2']);

      expect(mutationError).toEqual(newMutationError);
    });
  });
});
