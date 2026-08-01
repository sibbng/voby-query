import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClient } from '../src/index.ts';

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
  });
  return (mutation as any).mutate(variables);
};

describe('mutations', () => {
  it('mutate should accept null values', async () => {
    let variables: any;
    const queryClient = new QueryClient();

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
    const queryClient = new QueryClient();

    queryClient.setMutationDefaults(key, {
      mutationFn: fn,
    });

    await executeMutation(queryClient, { mutationKey: key }, 'vars').catch(() => {});

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('vars');
  });

  it('mutate should throw an error if no mutationFn found', async () => {
    const queryClient = new QueryClient();
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
    const queryClient = new QueryClient();

    const result = await executeMutation(
      queryClient,
      {
        mutationFn: async () => 'success-data',
      },
      'vars',
    );

    expect(result).toBe('success-data');
  });

  it('mutateAsync should reject when the mutation fails even without throwOnError', async () => {
    const queryClient = new QueryClient();
    const newMutationError = new Error('mutation-error');
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(newMutationError),
    });

    await expect((mutation as any).mutateAsync('vars')).rejects.toBe(newMutationError);
  });

  it('mutations should run and resolve in parallel by default', async () => {
    const key1 = mutationKey();
    const key2 = mutationKey();
    const queryClient = new QueryClient();
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

  it('should retry once with retry: 1 and expose the final failureCount', async () => {
    const queryClient = new QueryClient();
    const mutationFn = vi.fn().mockRejectedValue(new Error('err'));
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn,
      retry: 1,
      retryDelay: 10,
    });

    const promise = (mutation as any).mutate('vars').catch(() => {});
    await vi.advanceTimersByTimeAsync(20);
    await promise;

    expect(mutationFn).toHaveBeenCalledTimes(2);
    expect(mutation.state.failureCount()).toBe(2);
  });

  it('should pass a 0-based failureCount to retry and retryDelay functions', async () => {
    const queryClient = new QueryClient();
    const mutationFn = vi.fn().mockRejectedValue(new Error('err'));
    const retry = vi.fn((failureCount: number) => failureCount < 2);
    const retryDelay = vi.fn().mockReturnValue(10);
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn,
      retry,
      retryDelay,
    });

    const promise = (mutation as any).mutate('vars').catch(() => {});
    await vi.advanceTimersByTimeAsync(30);
    await promise;

    expect(mutationFn).toHaveBeenCalledTimes(3);
    expect(retry.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
    expect(retryDelay.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
  });

  describe('callback return types', () => {
    it('should handle all sync callback patterns', async () => {
      const key = mutationKey();
      const queryClient = new QueryClient();
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
      const queryClient = new QueryClient();
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
      const queryClient = new QueryClient();
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
      const queryClient = new QueryClient();
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

  it('dispatches success after option callbacks and before per-call callbacks', async () => {
    const queryClient = new QueryClient();
    const events: string[] = [];
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => 'data',
      onSuccess: () => {
        events.push(`options-onSuccess:${mutation.state.status()}:${mutation.state.data()}`);
      },
      onSettled: () => {
        events.push(`options-onSettled:${mutation.state.status()}:${mutation.state.data()}`);
      },
    });

    await (mutation as any).mutate('vars', {
      onSuccess: () => {
        events.push(`call-onSuccess:${mutation.state.status()}:${mutation.state.data()}`);
      },
      onSettled: () => {
        events.push(`call-onSettled:${mutation.state.status()}:${mutation.state.data()}`);
      },
    });

    expect(events).toEqual([
      'options-onSuccess:pending:undefined',
      'options-onSettled:pending:undefined',
      'call-onSuccess:success:data',
      'call-onSettled:success:data',
    ]);
  });

  it('reports errors thrown by per-call success callbacks without changing success state', async ({
    onTestFinished,
  }) => {
    const successCallbackError = new Error('success-callback-error');
    const settledCallbackError = new Error('settled-callback-error');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (error: unknown) => unhandledRejections.push(error);
    process.on('unhandledRejection', onUnhandledRejection);
    onTestFinished(() => {
      process.off('unhandledRejection', onUnhandledRejection);
    });

    const queryClient = new QueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => 'data',
    });

    await (mutation as any).mutate('vars', {
      onSuccess: () => {
        throw successCallbackError;
      },
      onSettled: () => {
        throw settledCallbackError;
      },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(unhandledRejections).toEqual([successCallbackError, settledCallbackError]);
    expect(mutation.state.status()).toBe('success');
    expect(mutation.state.data()).toBe('data');
  });

  it('reports errors thrown by per-call error callbacks without replacing the mutation error', async ({
    onTestFinished,
  }) => {
    const mutationError = new Error('mutation-error');
    const errorCallbackError = new Error('error-callback-error');
    const settledCallbackError = new Error('settled-callback-error');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (error: unknown) => unhandledRejections.push(error);
    process.on('unhandledRejection', onUnhandledRejection);
    onTestFinished(() => {
      process.off('unhandledRejection', onUnhandledRejection);
    });

    const queryClient = new QueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw mutationError;
      },
    });

    await expect(
      (mutation as any).mutate('vars', {
        onError: () => {
          throw errorCallbackError;
        },
        onSettled: () => {
          throw settledCallbackError;
        },
      }),
    ).rejects.toBe(mutationError);
    await vi.advanceTimersByTimeAsync(0);

    expect(unhandledRejections).toEqual([errorCallbackError, settledCallbackError]);
    expect(mutation.state.status()).toBe('error');
    expect(mutation.state.error()).toBe(mutationError);
  });

  it('turns an option onSuccess error into the mutation error state', async () => {
    const callbackError = new Error('success-callback-error');
    const queryClient = new QueryClient();
    const onError = vi.fn();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => 'data',
      onSuccess: () => {
        throw callbackError;
      },
      onError,
    });

    await expect((mutation as any).mutate('vars')).rejects.toBe(callbackError);

    expect(onError).toHaveBeenCalledWith(callbackError, 'vars', undefined);
    expect(mutation.state.status()).toBe('error');
    expect(mutation.state.error()).toBe(callbackError);
  });

  it('runs error callbacks in order and preserves the original error', async ({
    onTestFinished,
  }) => {
    const queryClient = new QueryClient();
    const mutationError = new Error('mutation-error');
    const callbackError = new Error('callback-error');
    const unhandledRejection = vi.fn();
    const onUnhandledRejection = (error: unknown) => unhandledRejection(error);
    process.on('unhandledRejection', onUnhandledRejection);
    onTestFinished(() => {
      process.off('unhandledRejection', onUnhandledRejection);
    });
    const events: string[] = [];
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw mutationError;
      },
      onError: () => {
        events.push(`options-onError:${mutation.state.status()}`);
        throw callbackError;
      },
      onSettled: () => {
        events.push(`options-onSettled:${mutation.state.status()}`);
      },
    });

    await expect(
      (mutation as any).mutate('vars', {
        onError: () => {
          events.push(`call-onError:${mutation.state.status()}`);
        },
        onSettled: () => {
          events.push(`call-onSettled:${mutation.state.status()}`);
        },
      }),
    ).rejects.toBe(mutationError);

    await vi.advanceTimersByTimeAsync(0);

    expect(events).toEqual([
      'options-onError:pending',
      'options-onSettled:pending',
      'call-onError:error',
      'call-onSettled:error',
    ]);
    expect(mutation.state.error()).toBe(mutationError);
    expect(unhandledRejection).toHaveBeenCalledTimes(1);
    expect(unhandledRejection).toHaveBeenCalledWith(callbackError);
  });
});
