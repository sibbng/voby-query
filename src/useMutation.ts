import { $, type ObservableReadonly, useCleanup, useEffect, useMemo } from 'voby';
import type { Mutation } from './mutation.ts';
import { useQueryClient } from './queryClient.ts';
import { noop } from './utils.ts';
import type {
  MutationFilters,
  MutationFunctionContext,
  MutationOptions,
  MutationState,
  UseMutationResult,
} from './types.ts';

export type { Mutation } from './mutation.ts';
export type {
  MutationFilters,
  MutationFunctionContext,
  MutationOptions,
  MutationState,
  UseMutationResult,
} from './types.ts';
export function useMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const queryClient = useQueryClient(options.queryClient);

  type CurrentMutation = Mutation<TData, TError, TVariables, TContext>;
  const retainedMutations = new Set<CurrentMutation>();
  const retainMutation = (mutation: CurrentMutation) => {
    mutation.addInstance();
    retainedMutations.add(mutation);
  };
  const releaseMutation = (mutation: CurrentMutation) => {
    if (!retainedMutations.delete(mutation)) return;
    mutation.removeInstance();
  };

  const mutationOptions = useMemo(() => {
    const nextMutation = queryClient.mutationCache.build<TData, TError, TVariables, TContext>(
      queryClient,
      options,
    );
    retainMutation(nextMutation);
    return nextMutation;
  });
  const mutation = $<CurrentMutation>(mutationOptions());
  let latestOptionsMutation = mutationOptions();

  useEffect(() => {
    const nextMutation = mutationOptions();
    if (nextMutation === latestOptionsMutation) return;

    releaseMutation(latestOptionsMutation);
    latestOptionsMutation = nextMutation;
    mutation(nextMutation);
  });

  useCleanup(() => {
    for (const retainedMutation of retainedMutations) {
      retainedMutation.removeInstance();
    }
    retainedMutations.clear();
  });

  const executeMutation = (
    variables: TVariables,
    mutateOptions?: Parameters<CurrentMutation['mutate']>[1],
  ) => {
    const previousMutation = mutation();
    const nextMutation = queryClient.mutationCache.build<TData, TError, TVariables, TContext>(
      queryClient,
      options,
    );
    retainMutation(nextMutation);
    releaseMutation(previousMutation);
    mutation(nextMutation);
    return nextMutation.mutate(variables, mutateOptions);
  };

  return useMemo(() => ({
    data: useMemo(() => mutation().state.data()),
    context: useMemo(() => mutation().state.context()),
    error: useMemo(() => mutation().state.error()),
    isError: useMemo(() => mutation().state.isError()),
    isIdle: useMemo(() => mutation().state.isIdle()),
    isPending: useMemo(() => mutation().state.isPending()),
    isSuccess: useMemo(() => mutation().state.isSuccess()),
    isPaused: useMemo(() => mutation().state.isPaused()),
    failureCount: useMemo(() => mutation().state.failureCount()),
    failureReason: useMemo(() => mutation().state.failureReason()),
    mutate: (variables, options) => {
      executeMutation(variables, options).catch(noop);
    },
    mutateAsync: executeMutation,
    reset: () => mutation().reset(),
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
  const tick = $(0);

  useCleanup(
    cache.subscribe(() => {
      tick((v) => v + 1);
    }),
  );

  return useMemo(() => {
    tick();
    return cache
      .findAll(filters)
      .map((mutation) => (select ? select(mutation) : (mutation as unknown as TResult)));
  }) as ObservableReadonly<TResult[]>;
}
