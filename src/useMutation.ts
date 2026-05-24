import {
  $,
  type FunctionMaybe,
  type Observable,
  type ObservableMaybe,
  type ObservableReadonly,
  useMemo,
  useCleanup,
  useRoot,
} from 'voby';
import { type QueryClient, useQueryClient } from './useQuery';
import { hashFn, partialMatchKey } from './utils';

type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export type MutationState<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  _TContext = unknown,
> = {
  data: Observable<TData | undefined>;
  error: Observable<TError | null>;
  status: Observable<MutationStatus>;
  failureCount: Observable<number>;
  failureReason: Observable<TError | null>;
  isPaused: Observable<boolean>;
  submittedAt: Observable<number | undefined>;
  variables: Observable<TVariables | undefined>;
  isError: Observable<boolean>;
  isIdle: Observable<boolean>;
  isPending: Observable<boolean>;
  isSuccess: Observable<boolean>;
  meta: Observable<Record<string, unknown>>;
};

export type MutationObject<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  state: MutationState<TData, TError, TVariables, TContext>;
  resolvedOptions: MutationOptions<TData, TError, TVariables, TContext>;
  mutate: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => Promise<TData | undefined>;
  mutateAsync: MutationObject<TData, TError, TVariables, TContext>['mutate'];
  reset: () => void;
  destroy: () => void;
  destroyDisposer: () => void;
  stateDisposer: () => void;
  addInstance: () => () => void;
  removeInstance: () => void;
  scheduleDestroy: () => void;
  instances: number;
};
export type MutationKey = FunctionMaybe<ObservableMaybe<string | number>[]>;
export type MutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = TData,
  TContext = unknown,
> = {
  mutationFn?: (variables: TVariables) => Promise<TData>;
  mutationKey?: MutationKey;
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => Promise<unknown> | unknown;
  onError?: (
    error: TError,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
  retryDelay?: number | ((retryAttempt: number, error: TError) => number);
  gcTime?: number;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  throwOnError?: boolean | ((error: TError) => boolean);
  meta?: Record<string, unknown>;
  queryClient?: QueryClient;
};

type MutateOptions<TData, TError, TVariables, TContext> = {
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
};

export type Mutation<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  data: Observable<TData | undefined>;
  error: Observable<TError | null>;
  isError: Observable<boolean>;
  isIdle: Observable<boolean>;
  isPending: Observable<boolean>;
  isPaused: Observable<boolean>;
  isSuccess: Observable<boolean>;
  failureCount: Observable<number>;
  failureReason: Observable<TError | null>;
  status: Observable<MutationStatus>;
  submittedAt: Observable<number | undefined>;
  variables: Observable<TVariables | undefined>;
  meta: Observable<Record<string, unknown>>;
  mutate: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => Promise<TData | undefined>;
  mutateAsync: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => Promise<TData | undefined>;
  reset: () => void;
};

function createMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  queryClient: QueryClient,
  options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationObject<TData, TError, TVariables, TContext> {
  const mutationKey = options.mutationKey ? hashFn(options.mutationKey) : undefined;

  if (mutationKey && queryClient.mutationCache.has(mutationKey)) {
    return queryClient.mutationCache.get(mutationKey) as MutationObject<
      TData,
      TError,
      TVariables,
      TContext
    >;
  }

  const resolvedOptions = {
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

  const shouldRetry = (failureCount: number, error: TError): boolean => {
    if (!resolvedOptions.retry) return false;
    if (typeof resolvedOptions.retry === 'function') {
      return resolvedOptions.retry(failureCount, error);
    }
    return typeof resolvedOptions.retry === 'boolean'
      ? resolvedOptions.retry
      : resolvedOptions.retry > failureCount;
  };

  // Create state memos in a detached root so they survive parent memo re-runs.
  // Same pattern as createQuery — prevents disposal when the containing useMemo
  // re-evaluates due to mutationCache.version() bumping during cache.set().
  let state!: MutationState<TData, TError, TVariables, TContext>;
  let stateDisposer: () => void = () => {};
  useRoot((dispose) => {
    stateDisposer = dispose;

    const data = $<TData | undefined>(undefined);
    const error = $<TError | null>(null);
    const status = $<MutationStatus>('idle');
    const failureCount = $(0);
    const failureReason = $<TError | null>(null);
    const isPaused = $(false);
    const submittedAt = $<number | undefined>(undefined);
    const variables = $<TVariables | undefined>(undefined);
    const meta = $({});

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

  const mutate = async (
    variables: TVariables,
    mutateOptions?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => {
    if (mutationKey && !queryClient.mutationCache.has(mutationKey)) {
      queryClient.mutationCache.set(mutationKey, mutationObject);
    }
    let context: TContext | undefined;
    state.status('pending');
    state.variables(variables);
    state.submittedAt(Date.now());

    try {
      if (resolvedOptions.onMutate) {
        context = await resolvedOptions.onMutate(variables);
      }

      const data = await resolvedOptions.mutationFn!(variables);
      state.status('success');
      state.data(data);

      await resolvedOptions.onSuccess?.(data, variables, context as TContext);
      mutateOptions?.onSuccess?.(data, variables, context as TContext);

      await resolvedOptions.onSettled?.(data, null, variables, context);
      mutateOptions?.onSettled?.(data, null, variables, context);

      return data;
    } catch (error) {
      state.status('error');
      state.error(error as TError);
      state.failureCount((count) => count + 1);
      state.failureReason(error as TError);

      await resolvedOptions.onError?.(error as TError, variables, context);
      mutateOptions?.onError?.(error as TError, variables, context);

      await resolvedOptions.onSettled?.(undefined, error as TError, variables, context);
      mutateOptions?.onSettled?.(undefined, error as TError, variables, context);

      if (shouldRetry(state.failureCount(), error as TError)) {
        const retryDelay = resolvedOptions.retryDelay ?? 1000;
        const resolvedRetryDelay =
          typeof retryDelay === 'function'
            ? retryDelay(state.failureCount(), error as TError)
            : retryDelay * 2 ** (state.failureCount() - 1);
        setTimeout(() => {
          mutate(variables, mutateOptions);
        }, resolvedRetryDelay);
      } else {
        const shouldThrow =
          typeof resolvedOptions.throwOnError === 'function'
            ? resolvedOptions.throwOnError(error as TError)
            : resolvedOptions.throwOnError;
        if (shouldThrow) {
          throw error;
        }
      }
    }
    return state.data();
  };

  const reset = () => {
    state.status('idle');
    state.data(undefined);
    state.error(null);
    state.failureCount(0);
    state.failureReason(null);
    state.isPaused(false);
    state.submittedAt(undefined);
    state.variables(undefined);
    if (mutationKey) {
      queryClient.mutationCache.delete(mutationKey);
    }
  };

  const mutationObject: MutationObject<TData, TError, TVariables, TContext> = {
    instances: 0,
    state,
    resolvedOptions,
    mutate,
    mutateAsync: mutate,
    reset,
    stateDisposer,
    destroy: () => {
      if (mutationKey) {
        queryClient.mutationCache.delete(mutationKey);
      }
      mutationObject.stateDisposer();
    },
    addInstance: () => {
      mutationObject.destroyDisposer();
      mutationObject.instances++;
      return mutationObject.removeInstance;
    },
    removeInstance: () => {
      mutationObject.instances--;
      if (mutationObject.instances === 0) {
        mutationObject.scheduleDestroy();
      }
    },
    scheduleDestroy: () => {
      if ((resolvedOptions.gcTime ?? 5 * 60 * 1000) === Infinity) return;
      mutationObject.destroyDisposer();
      const id = setTimeout(
        () => {
          mutationObject.destroy();
        },
        resolvedOptions.gcTime ?? 5 * 60 * 1000,
      );
      mutationObject.destroyDisposer = () => clearTimeout(id);
    },
    destroyDisposer: () => {},
  };

  if (mutationKey) {
    queryClient.mutationCache.set(mutationKey, mutationObject);
  }

  return mutationObject;
}
export function useMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): ObservableReadonly<
  {
    [K in keyof Omit<
      MutationState<TData, TError, TVariables, TContext>,
      'meta'
    >]: ObservableReadonly<ReturnType<MutationState<TData, TError, TVariables, TContext>[K]>>;
  } & {
    meta: MutationState<TData, TError, TVariables, TContext>['meta'];
  } & Pick<Mutation<TData, TError, TVariables, TContext>, 'mutate' | 'mutateAsync' | 'reset'>
> {
  const queryClient = useQueryClient(options.queryClient);

  const mutation = useMemo(() => {
    const mutation = createMutation(queryClient, options);
    useCleanup(mutation.addInstance());
    return mutation;
  });

  return useMemo(() => ({
    data: useMemo(() => mutation().state.data()),
    error: useMemo(() => mutation().state.error()),
    isError: useMemo(() => mutation().state.isError()),
    isIdle: useMemo(() => mutation().state.isIdle()),
    isPending: useMemo(() => mutation().state.isPending()),
    isSuccess: useMemo(() => mutation().state.isSuccess()),
    isPaused: useMemo(() => mutation().state.isPaused()),
    failureCount: useMemo(() => mutation().state.failureCount()),
    failureReason: useMemo(() => mutation().state.failureReason()),
    mutate: mutation().mutate,
    mutateAsync: mutation().mutateAsync,
    reset: mutation().reset,
    status: useMemo(() => mutation().state.status()),
    submittedAt: useMemo(() => mutation().state.submittedAt()),
    variables: useMemo(() => mutation().state.variables()),
    meta: mutation().state.meta,
  }));
}

export type MutationFilters = {
  mutationKey?: MutationKey;
  exact?: boolean;
  status?: MutationStatus;
};
type MutationStateOptions<TResult = MutationState> = {
  filters?: MutationFilters;
  select?: (mutation: MutationObject<any, any, any, any>) => TResult;
};
export function useMutationState<TResult = MutationState>({
  filters,
  select,
}: MutationStateOptions<TResult>): ObservableReadonly<TResult[]> {
  const queryClient = useQueryClient();
  const cache = queryClient.mutationCache;
  return useMemo(() => {
    // Subscribe to structural changes (add/remove/clear)
    cache.version();
    return Array.from(cache.values())
      .filter(
        (mutation): mutation is MutationObject<any, any, any, any> =>
          mutation !== undefined &&
          (filters?.mutationKey
            ? mutation.resolvedOptions.mutationKey !== undefined &&
              (filters.exact
                ? hashFn(mutation.resolvedOptions.mutationKey) === hashFn(filters.mutationKey)
                : partialMatchKey(filters.mutationKey, mutation.resolvedOptions.mutationKey))
            : true) &&
          (filters?.status ? mutation.state.status() === filters.status : true),
      )
      .map((mutation) => (select ? select(mutation) : (mutation as unknown as TResult)));
  }) as ObservableReadonly<TResult[]>;
}
