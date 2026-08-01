import { $, $$, useMemo, useRoot } from 'voby';
import { hashFn, resolveKey } from './utils.ts';
import { timeoutManager } from './timeoutManager.ts';
import type {
  MutateOptions,
  MutationKey,
  MutationFunctionContext,
  MutationOptions,
  MutationState,
  MutationStatus,
  QueryClient,
  ResolvedMutationOptions,
} from './types.ts';
import type { MutationCache } from './mutationCache.ts';
import { createMachine, type MachineInstance } from './machines.ts';
import { createNetworkPause, type NetworkPause } from './retryer.ts';

type MutationState_ = 'idle' | 'pending' | 'success' | 'error';
type MutationEvent = 'MUTATE' | 'SUCCESS' | 'ERROR' | 'RESET';

export type Mutation<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  cacheKey: string;
  mutationHash?: string;
  state: MutationState<TData, TError, TVariables, TContext>;
  resolvedOptions: ResolvedMutationOptions<TData, TError, TVariables, TContext>;
  mutate: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => Promise<TData | undefined>;
  mutateAsync: Mutation<TData, TError, TVariables, TContext>['mutate'];
  reset: () => void;
  destroy: () => void;
  destroyDisposer: () => void;
  stateDisposer: () => void;
  addInstance: () => () => void;
  removeInstance: () => void;
  scheduleDestroy: () => void;
  instances: number;
  machine: MachineInstance<MutationState_, MutationEvent>;
  continue: () => Promise<TData | undefined>;
};

export const resolveMutationHash = (mutationKey?: MutationKey) => {
  return mutationKey ? hashFn(mutationKey) : undefined;
};

export const resolveMutationOptions = <
  TData = unknown,
  TError = unknown,
  TVariables = TData,
  TContext = unknown,
>(
  queryClient: QueryClient,
  options: MutationOptions<TData, TError, TVariables, TContext>,
): ResolvedMutationOptions<TData, TError, TVariables, TContext> => {
  return {
    ...(queryClient.getDefaultOptions().mutations as MutationOptions<
      TData,
      TError,
      TVariables,
      TContext
    >),
    ...(queryClient.getMutationDefaults(options.mutationKey) as MutationOptions<
      TData,
      TError,
      TVariables,
      TContext
    >),
    ...options,
    mutationKey: options.mutationKey ? resolveKey(options.mutationKey) : undefined,
    queryClient,
  } as ResolvedMutationOptions<TData, TError, TVariables, TContext>;
};

export const createMutation = <
  TData = unknown,
  TError = unknown,
  TVariables = TData,
  TContext = unknown,
>({
  mutationCache,
  cacheKey,
  mutationHash,
  resolvedOptions,
}: {
  mutationCache: MutationCache<Mutation<any, any, any, any>>;
  cacheKey: string;
  mutationHash?: string;
  resolvedOptions: ResolvedMutationOptions<TData, TError, TVariables, TContext>;
}): Mutation<TData, TError, TVariables, TContext> => {
  const shouldRetry = (failureCount: number, error: TError): boolean => {
    const { retry } = mutation.resolvedOptions;

    if (!retry) return false;
    if (typeof retry === 'function') {
      return retry(failureCount - 1, error);
    }
    return typeof retry === 'boolean' ? retry : retry >= failureCount;
  };

  let state!: MutationState<TData, TError, TVariables, TContext>;
  let stateDisposer: () => void = () => {};
  let machine!: MachineInstance<MutationState_, MutationEvent>;
  let networkPause!: NetworkPause;
  let scopePausedPromise: Promise<void> | undefined;
  let scopeContinue: (() => void) | undefined;
  let scopeCancel: (() => void) | undefined;
  let currentPromise: Promise<TData | undefined> | undefined;

  const setInitialState = () => {
    state.status('idle');
    state.data(undefined);
    state.context(undefined);
    state.error(null);
    state.failureCount(0);
    state.failureReason(null);
    state.isPaused(false);
    state.submittedAt(undefined);
    state.variables(undefined);
    state.meta((resolvedOptions.meta ?? {}) as Record<string, unknown>);
  };

  useRoot((dispose) => {
    stateDisposer = dispose;

    const data = $<TData | undefined>(undefined);
    const context = $<TContext | undefined>(undefined, { equals: false });
    const error = $<TError | null>(null, { equals: false });
    const status = $<MutationStatus>('idle');
    const failureCount = $(0);
    const failureReason = $<TError | null>(null, { equals: false });
    const isPaused = $(false);
    const submittedAt = $<number | undefined>(undefined);
    const variables = $<TVariables | undefined>(undefined, { equals: false });
    const meta = $<Record<string, unknown>>(
      (resolvedOptions.meta ?? {}) as Record<string, unknown>,
      {
        equals: false,
      },
    );

    state = {
      data,
      context,
      error,
      status,
      failureCount,
      failureReason,
      isPaused,
      submittedAt,
      variables,
      isError: useMemo(() => status() === 'error'),
      isIdle: useMemo(() => status() === 'idle'),
      isPending: useMemo(() => status() === 'pending'),
      isSuccess: useMemo(() => status() === 'success'),
      meta,
    };

    machine = createMachine<MutationState_, MutationEvent>({
      initial: 'idle',
      states: {
        idle: {
          onEnter: setInitialState,
          transitions: {
            MUTATE: { target: 'pending' },
          },
        },
        pending: {
          onEnter: () => {
            status('pending');
          },
          transitions: {
            SUCCESS: { target: 'success' },
            ERROR: { target: 'error' },
            MUTATE: { target: 'pending' },
          },
        },
        success: {
          onEnter: () => {
            status('success');
            state.isPaused(false);
          },
          transitions: {
            MUTATE: { target: 'pending' },
            RESET: { target: 'idle' },
          },
        },
        error: {
          onEnter: () => {
            status('error');
            state.isPaused(false);
          },
          transitions: {
            MUTATE: { target: 'pending' },
            RESET: { target: 'idle' },
          },
        },
      },
    });
  });

  const mutation: Mutation<TData, TError, TVariables, TContext> = {
    cacheKey,
    mutationHash,
    state,
    resolvedOptions,
    instances: 0,
    stateDisposer,
    machine,
    destroyDisposer: () => {},
    destroy: () => {
      networkPause.cancel();
      scopeCancel?.();
      mutation.destroyDisposer();
      mutation.stateDisposer();
    },
    addInstance: () => {
      mutation.destroyDisposer();
      mutation.instances++;
      return mutation.removeInstance;
    },
    removeInstance: () => {
      mutation.instances--;
      if (mutation.instances === 0) {
        mutation.scheduleDestroy();
      }
    },
    scheduleDestroy: () => {
      if (mutation.resolvedOptions.gcTime === Infinity) return;
      mutation.destroyDisposer();
      const id = timeoutManager.setTimeout(
        () => {
          mutationCache.remove(mutation);
        },
        mutation.resolvedOptions.gcTime ?? 5 * 60 * 1000,
      );
      mutation.destroyDisposer = () => timeoutManager.clearTimeout(id);
    },
    reset: () => {
      if (!machine.can('RESET')) return;
      machine.send('RESET');
      mutationCache.notify({ type: 'updated', mutation: mutation as Mutation<any, any, any, any> });
    },
    continue: () => {
      if (mutationCache.canRun(mutation)) {
        scopeContinue?.();
      }
      networkPause.continue();
      return currentPromise ?? Promise.resolve(undefined);
    },
    mutate: async (variables, mutateOptions) => {
      if (!machine.can('MUTATE')) {
        return undefined;
      }

      machine.send('MUTATE');
      state.data(undefined);
      state.context(undefined);
      state.error(null);
      state.failureCount(0);
      state.failureReason(null);
      state.isPaused(!networkPause.canStart() || !mutationCache.canRun(mutation));
      state.variables(variables);
      state.submittedAt(Date.now());
      state.meta((resolvedOptions.meta ?? {}) as Record<string, unknown>);
      mutationCache.notify({ type: 'updated', mutation: mutation as Mutation<any, any, any, any> });

      let context: TContext | undefined;
      const mutationFunctionContext: MutationFunctionContext = {
        client: mutation.resolvedOptions.queryClient,
        meta: mutation.resolvedOptions.meta,
        mutationKey: mutation.resolvedOptions.mutationKey as MutationKey,
      };

      try {
        if (mutation.resolvedOptions.onMutate) {
          context = await mutation.resolvedOptions.onMutate(variables, mutationFunctionContext);
          state.context(context);
          mutationCache.notify({
            type: 'updated',
            mutation: mutation as Mutation<any, any, any, any>,
          });
        }

        if (!mutation.resolvedOptions.mutationFn) {
          throw new Error('No mutationFn found');
        }

        const initialPause = waitForExecution(false);
        if (initialPause) await initialPause;

        let failureCount = 0;
        let data!: TData;
        while (true) {
          try {
            data = await mutation.resolvedOptions.mutationFn(variables, mutationFunctionContext);
            break;
          } catch (error) {
            failureCount += 1;
            state.failureCount(failureCount);
            state.failureReason(error as TError);

            const retryDelay = mutation.resolvedOptions.retryDelay;
            const resolvedRetryDelay =
              typeof retryDelay === 'function'
                ? retryDelay(failureCount - 1, error as TError)
                : (retryDelay ?? Math.min(1000 * 2 ** (failureCount - 1), 30000));

            if (!shouldRetry(failureCount, error as TError)) {
              throw error;
            }

            await new Promise((resolve) => timeoutManager.setTimeout(resolve, resolvedRetryDelay));
            const retryPause = waitForExecution(true);
            if (retryPause) await retryPause;
          }
        }

        await mutation.resolvedOptions.onSuccess?.(
          data,
          variables,
          context,
          mutationFunctionContext,
        );
        await mutation.resolvedOptions.onSettled?.(
          data,
          null,
          variables,
          context,
          mutationFunctionContext,
        );

        machine.send('SUCCESS');
        state.data(data);
        state.error(null);
        state.failureCount(0);
        state.failureReason(null);
        mutationCache.notify({
          type: 'updated',
          mutation: mutation as Mutation<any, any, any, any>,
        });

        try {
          mutateOptions?.onSuccess?.(data, variables, context, mutationFunctionContext);
        } catch (error) {
          void Promise.reject(error);
        }
        try {
          mutateOptions?.onSettled?.(data, null, variables, context, mutationFunctionContext);
        } catch (error) {
          void Promise.reject(error);
        }

        return data;
      } catch (error) {
        try {
          await mutation.resolvedOptions.onError?.(
            error as TError,
            variables,
            context,
            mutationFunctionContext,
          );
        } catch (callbackError) {
          void Promise.reject(callbackError);
        }

        try {
          await mutation.resolvedOptions.onSettled?.(
            undefined,
            error as TError,
            variables,
            context,
            mutationFunctionContext,
          );
        } catch (callbackError) {
          void Promise.reject(callbackError);
        }

        machine.send('ERROR');
        state.error(error as TError);
        state.failureReason(error as TError);
        if (state.failureCount() === 0) {
          state.failureCount(1);
        }
        mutationCache.notify({
          type: 'updated',
          mutation: mutation as Mutation<any, any, any, any>,
        });

        try {
          mutateOptions?.onError?.(error as TError, variables, context, mutationFunctionContext);
        } catch (callbackError) {
          void Promise.reject(callbackError);
        }
        try {
          mutateOptions?.onSettled?.(
            undefined,
            error as TError,
            variables,
            context,
            mutationFunctionContext,
          );
        } catch (callbackError) {
          void Promise.reject(callbackError);
        }

        throw error;
      } finally {
        void mutationCache.runNext(mutation);
      }

      return state.data();
    },
    mutateAsync: undefined as never,
  };

  const setPaused = (paused: boolean) => {
    if (state.isPaused() === paused) return;
    state.isPaused(paused);
    mutationCache.notify({ type: 'updated', mutation: mutation as Mutation<any, any, any, any> });
  };

  networkPause = createNetworkPause(
    () => mutation.resolvedOptions.networkMode,
    () => setPaused(true),
    () => {},
  );

  const waitForScope = (): Promise<void> | undefined => {
    if (mutationCache.canRun(mutation)) return undefined;
    if (scopePausedPromise) return scopePausedPromise;

    scopePausedPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        scopeContinue = undefined;
        scopeCancel = undefined;
        scopePausedPromise = undefined;
        resolve();
      };

      scopeContinue = finish;
      scopeCancel = finish;
    });
    return scopePausedPromise;
  };

  const waitForExecution = (retry: boolean): Promise<void> | undefined => {
    const pauses = [networkPause.wait(retry), waitForScope()].filter(
      (pause): pause is Promise<void> => pause !== undefined,
    );
    if (pauses.length === 0) {
      setPaused(false);
      return undefined;
    }

    setPaused(true);
    return Promise.all(pauses).then(() => {
      setPaused(false);
    });
  };

  const executeMutation = mutation.mutate;
  mutation.mutate = (variables, mutateOptions) => {
    const promise = executeMutation(variables, mutateOptions);
    currentPromise = promise;
    void promise.then(
      () => {
        if (currentPromise === promise) currentPromise = undefined;
      },
      () => {
        if (currentPromise === promise) currentPromise = undefined;
      },
    );
    return promise;
  };

  mutation.mutateAsync = mutation.mutate;

  return mutation;
};
