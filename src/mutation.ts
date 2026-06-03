import { $, useMemo, useRoot } from 'voby';
import { hashFn, shouldThrowError } from './utils.ts';
import type {
  MutateOptions,
  MutationKey,
  MutationOptions,
  MutationState,
  MutationStatus,
  QueryClient,
} from './types.ts';
import type { MutationCache } from './mutationCache.ts';

export type Mutation<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  cacheKey: string;
  mutationHash?: string;
  state: MutationState<TData, TError, TVariables, TContext>;
  resolvedOptions: MutationOptions<TData, TError, TVariables, TContext>;
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
): MutationOptions<TData, TError, TVariables, TContext> => {
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
  };
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
  resolvedOptions: MutationOptions<TData, TError, TVariables, TContext>;
}): Mutation<TData, TError, TVariables, TContext> => {
  const shouldRetry = (failureCount: number, error: TError): boolean => {
    const { retry } = mutation.resolvedOptions;

    if (!retry) return false;
    if (typeof retry === 'function') {
      return retry(failureCount, error);
    }
    return typeof retry === 'boolean' ? retry : retry > failureCount;
  };

  let state!: MutationState<TData, TError, TVariables, TContext>;
  let stateDisposer: () => void = () => {};
  useRoot((dispose) => {
    stateDisposer = dispose;

    const data = $<TData | undefined>(undefined);
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
  });

  const mutation: Mutation<TData, TError, TVariables, TContext> = {
    cacheKey,
    mutationHash,
    state,
    resolvedOptions,
    instances: 0,
    stateDisposer,
    destroyDisposer: () => {},
    destroy: () => {
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
      const id = setTimeout(
        () => {
          mutationCache.remove(mutation);
        },
        mutation.resolvedOptions.gcTime ?? 5 * 60 * 1000,
      );
      mutation.destroyDisposer = () => clearTimeout(id);
    },
    reset: () => {
      mutation.state.status('idle');
      mutation.state.data(undefined);
      mutation.state.error(null);
      mutation.state.failureCount(0);
      mutation.state.failureReason(null);
      mutation.state.isPaused(false);
      mutation.state.submittedAt(undefined);
      mutation.state.variables(undefined);
      mutation.state.meta((mutation.resolvedOptions.meta ?? {}) as Record<string, unknown>);
      mutationCache.notify({ type: 'updated', mutation: mutation as Mutation<any, any, any, any> });
    },
    mutate: async (variables, mutateOptions) => {
      if (mutationHash && !mutationCache.has(mutationHash)) {
        mutationCache.set(mutationHash, mutation);
      }

      mutation.state.status('pending');
      mutation.state.data(undefined);
      mutation.state.error(null);
      mutation.state.failureCount(0);
      mutation.state.failureReason(null);
      mutation.state.isPaused(false);
      mutation.state.variables(variables);
      mutation.state.submittedAt(Date.now());
      mutation.state.meta((mutation.resolvedOptions.meta ?? {}) as Record<string, unknown>);
      mutationCache.notify({ type: 'updated', mutation: mutation as Mutation<any, any, any, any> });

      let context: TContext | undefined;

      try {
        if (mutation.resolvedOptions.onMutate) {
          context = await mutation.resolvedOptions.onMutate(variables);
        }

        if (!mutation.resolvedOptions.mutationFn) {
          throw new Error('No mutationFn found');
        }

        let failureCount = 0;
        let data!: TData;
        while (true) {
          try {
            data = await mutation.resolvedOptions.mutationFn(variables);
            break;
          } catch (error) {
            failureCount += 1;
            mutation.state.failureCount(failureCount);
            mutation.state.failureReason(error as TError);

            if (!shouldRetry(failureCount, error as TError)) {
              throw error;
            }

            const retryDelay = mutation.resolvedOptions.retryDelay ?? 1000;
            const resolvedRetryDelay =
              typeof retryDelay === 'function'
                ? retryDelay(failureCount, error as TError)
                : retryDelay * 2 ** (failureCount - 1);

            await new Promise((resolve) => setTimeout(resolve, resolvedRetryDelay));
          }
        }

        mutation.state.status('success');
        mutation.state.data(data);
        mutation.state.error(null);
        mutation.state.failureCount(0);
        mutation.state.failureReason(null);
        mutationCache.notify({
          type: 'updated',
          mutation: mutation as Mutation<any, any, any, any>,
        });

        await mutation.resolvedOptions.onSuccess?.(data, variables, context);
        mutateOptions?.onSuccess?.(data, variables, context);

        await mutation.resolvedOptions.onSettled?.(data, null, variables, context);
        mutateOptions?.onSettled?.(data, null, variables, context);

        return data;
      } catch (error) {
        mutation.state.status('error');
        mutation.state.error(error as TError);
        mutation.state.failureReason(error as TError);
        if (mutation.state.failureCount() === 0) {
          mutation.state.failureCount(1);
        }
        mutationCache.notify({
          type: 'updated',
          mutation: mutation as Mutation<any, any, any, any>,
        });

        await mutation.resolvedOptions.onError?.(error as TError, variables, context);
        mutateOptions?.onError?.(error as TError, variables, context);

        await mutation.resolvedOptions.onSettled?.(undefined, error as TError, variables, context);
        mutateOptions?.onSettled?.(undefined, error as TError, variables, context);

        if (shouldThrowError(mutation.resolvedOptions.throwOnError, [error as TError])) {
          throw error;
        }
      }

      return mutation.state.data();
    },
    mutateAsync: undefined as never,
  };

  mutation.mutateAsync = mutation.mutate;

  return mutation;
};
