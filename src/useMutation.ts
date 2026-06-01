import { type ObservableReadonly, useCleanup, useMemo } from 'voby';
import type { Mutation } from './mutation.ts';
import { useQueryClient } from './queryClient.ts';
import type {
  MutationFilters,
  MutationOptions,
  MutationState,
  UseMutationResult,
} from './types.ts';

export type { Mutation } from './mutation.ts';
export type {
  MutationFilters,
  MutationOptions,
  MutationState,
  UseMutationResult,
} from './types.ts';
export function useMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const queryClient = useQueryClient(options.queryClient);

  const mutation = useMemo(() => {
    const nextMutation = queryClient.mutationCache.build<TData, TError, TVariables, TContext>(
      queryClient,
      options,
    );
    useCleanup(nextMutation.addInstance());
    return nextMutation;
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
  })) as UseMutationResult<TData, TError, TVariables, TContext>;
}

export function useMutationState<TResult = MutationState>({
  filters,
  select,
}: {
  filters?: MutationFilters;
  select?: (mutation: Mutation<any, any, any, any>) => TResult;
} = {}): ObservableReadonly<TResult[]> {
  const queryClient = useQueryClient();
  const cache = queryClient.mutationCache;

  return useMemo(() => {
    cache.version();
    return cache
      .findAll(filters)
      .map((mutation) => (select ? select(mutation) : (mutation as unknown as TResult)));
  }) as ObservableReadonly<TResult[]>;
}
