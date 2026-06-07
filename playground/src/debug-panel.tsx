import { $, $$, For, If, useCleanup, useEffect, useMemo } from 'voby';
import { useMutationState, useQueryClient, type QuerySnapshot } from 'voby-query';

export type DebugScope = {
  queryPrefixes?: readonly unknown[][];
  mutationPrefixes?: readonly unknown[][];
  includeAllQueries?: boolean;
  includeAllMutations?: boolean;
  note?: string;
};

type ActiveExample = {
  id: string;
  label: string;
  debug: DebugScope;
};

type MutationSnapshot = {
  mutationHash: string;
  mutationKey: unknown[];
  status: 'idle' | 'pending' | 'success' | 'error';
  failureCount: number;
  submittedAt: number | undefined;
  variables: unknown;
  data: unknown;
  error: unknown;
  isPaused: boolean;
  instances: number;
};

const resolveStaleTime = (query: any): number | 'static' => {
  const staleTime = query.resolvedOptions.staleTime ?? 0;
  return typeof staleTime === 'function' ? staleTime(query) : staleTime;
};

const createQuerySnapshot = (query: any): QuerySnapshot<any, any> => {
  const { state } = query;
  const data = state.data();
  const error = state.error();
  return {
    queryHash: query.queryHash,
    queryKey: $$(query.resolvedOptions.queryKey as never) as unknown[],
    status: state.status(),
    fetchStatus: state.fetchStatus(),
    enabled: Boolean(query.resolvedOptions.enabled),
    isActive: query.isActive,
    isCancelled: query.isCancelled,
    isFetching: state.isFetching(),
    isRefetching: state.isRefetching(),
    isRefetchError: state.isRefetchError(),
    isFetched: state.isFetched(),
    isFetchedAfterMount: state.isFetchedAfterMount(),
    isPaused: state.isPaused(),
    isPending: state.isPending(),
    isSuccess: state.isSuccess(),
    isError: state.isError(),
    isLoading: state.isLoading(),
    isLoadingError: state.isLoadingError(),
    isPlaceholderData: state.isPlaceholderData(),
    isStale: state.isStale(),
    isIdle: state.isIdle(),
    isInitialLoading: state.isInitialLoading(),
    isEnabled: Boolean(query.resolvedOptions.enabled),
    isInvalidated: state.isInvalidated(),
    observers: query.instances,
    hasData: data !== undefined,
    data,
    dataUpdateCount: state.dataUpdateCount(),
    dataUpdatedAt: state.dataUpdatedAt(),
    error,
    errorUpdateCount: state.errorUpdateCount(),
    errorUpdatedAt: state.errorUpdatedAt(),
    gcTime: query.resolvedOptions.gcTime ?? Infinity,
    staleTime: resolveStaleTime(query),
    refetchInterval: query.resolvedOptions.refetchInterval,
    networkMode: query.resolvedOptions.networkMode,
  };
};

const serializeKey = (key: readonly unknown[]) => JSON.stringify(key);

const resolveDebugKey = (key: unknown): unknown[] => {
  const resolved: unknown = $$(key as never);
  if (!Array.isArray(resolved)) return [];
  return resolved.map((segment: unknown) => $$(segment as never));
};

const matchesPrefixes = (key: readonly unknown[], prefixes?: readonly unknown[][]) => {
  if (!prefixes?.length) return false;
  return prefixes.some(
    (prefix) => serializeKey(key.slice(0, prefix.length)) === serializeKey(prefix),
  );
};

const formatKeySegment = (segment: unknown) => {
  if (typeof segment === 'string') return segment;
  if (typeof segment === 'number' || typeof segment === 'boolean') return String(segment);
  if (segment === null) return 'null';
  if (segment === undefined) return 'undefined';

  try {
    return JSON.stringify(segment);
  } catch {
    return Object.prototype.toString.call(segment);
  }
};

const formatKey = (key: readonly unknown[]) => {
  if (!key.length) return 'anonymous';
  return key.map(formatKeySegment).join(' / ');
};

const formatTimestamp = (value: number | undefined) => {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleTimeString();
};

const formatDuration = (value: number | 'static' | undefined) => {
  if (value === undefined) return 'off';
  if (value === 'static') return 'static';
  if (value === Infinity) return 'Infinity';
  return `${value}ms`;
};

const formatPreview = (value: unknown) => {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 720 ? `${serialized.slice(0, 717)}...` : serialized;
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const queryScore = (query: QuerySnapshot<unknown, unknown>) => {
  return (
    (query.isFetching ? 100 : 0) +
    (query.isActive ? 50 : 0) +
    (query.isInvalidated ? 25 : 0) +
    (query.isStale ? 15 : 0) +
    (query.isError ? 10 : 0)
  );
};

const mutationScore = (mutation: MutationSnapshot) => {
  return (
    (mutation.status === 'pending' ? 100 : 0) +
    (mutation.status === 'error' ? 40 : 0) +
    (mutation.status === 'success' ? 20 : 0)
  );
};

const Metric = ({
  label,
  tone = 'text-[#c2c8d2]',
  value,
}: {
  label: string;
  tone?: string;
  value: () => string | number;
}) => (
  <div class="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
    <p class="text-[0.65rem] uppercase tracking-[0.24em] text-white/28">{label}</p>
    <p class={() => `mt-1 text-sm font-semibold ${tone}`}>{value}</p>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: () => string | number | boolean }) => (
  <div class="flex items-center justify-between gap-3 text-xs font-mono">
    <span class="text-white/32">{label}</span>
    <span class="text-right text-white/72">{() => String(value())}</span>
  </div>
);

const ScopeChip = ({ label }: { label: () => string }) => (
  <span class="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[0.65rem] font-mono text-white/50">
    {label}
  </span>
);

export const DebugPanel = ({ active }: { active: () => ActiveExample }) => {
  const queryClient = useQueryClient();
  const expanded = $(true);
  const scopeMode = $<'example' | 'all'>('example');
  const busyAction = $<null | 'invalidate' | 'refetch' | 'reset' | 'remove'>(null);
  const selectedQueryHash = $<string | undefined>(undefined);
  const selectedMutationHash = $<string | undefined>(undefined);

  const queryTick = $(0);

  useCleanup(
    queryClient.getQueryCache().subscribe(() => {
      queryTick((v) => v + 1);
    }),
  );

  const defaults = queryClient.getDefaultOptions().queries;
  const retryDelayPreview =
    typeof defaults.retryDelay === 'function'
      ? defaults.retryDelay(1, undefined)
      : defaults.retryDelay;

  const allQueries = useMemo(() => {
    queryTick();
    const snapshots = queryClient.getQueryCache().getAll().map(createQuerySnapshot);
    snapshots.sort((left, right) => {
      const scoreDelta = queryScore(right) - queryScore(left);
      if (scoreDelta !== 0) return scoreDelta;

      const timeDelta =
        Math.max(right.dataUpdatedAt, right.errorUpdatedAt) -
        Math.max(left.dataUpdatedAt, left.errorUpdatedAt);
      if (timeDelta !== 0) return timeDelta;

      return left.queryHash.localeCompare(right.queryHash);
    });
    return snapshots;
  });

  const allMutations = useMutationState<MutationSnapshot>({
    select: (mutation) => {
      const mutationKey = resolveDebugKey(mutation.resolvedOptions.mutationKey);
      const submittedAt = mutation.state.submittedAt();
      return {
        mutationHash: mutationKey.length
          ? serializeKey(mutationKey)
          : `anonymous:${submittedAt ?? 0}:${mutation.instances}`,
        mutationKey,
        status: mutation.state.status(),
        failureCount: mutation.state.failureCount(),
        submittedAt,
        variables: mutation.state.variables(),
        data: mutation.state.data(),
        error: mutation.state.error(),
        isPaused: mutation.state.isPaused(),
        instances: mutation.instances,
      };
    },
  });

  const filteredQueries = useMemo(() => {
    const scope = active().debug;
    if (scopeMode() === 'all' || scope.includeAllQueries) {
      return allQueries();
    }

    return allQueries().filter((query) => matchesPrefixes(query.queryKey, scope.queryPrefixes));
  });

  const filteredMutations = useMemo(() => {
    const scope = active().debug;
    const snapshots = allMutations().slice();
    snapshots.sort((left, right) => {
      const scoreDelta = mutationScore(right) - mutationScore(left);
      if (scoreDelta !== 0) return scoreDelta;
      return (right.submittedAt ?? 0) - (left.submittedAt ?? 0);
    });

    if (scopeMode() === 'all' || scope.includeAllMutations) {
      return snapshots;
    }

    return snapshots.filter((mutation) =>
      matchesPrefixes(mutation.mutationKey, scope.mutationPrefixes),
    );
  });

  useEffect(() => {
    const queries = filteredQueries();
    const current = selectedQueryHash();

    if (!queries.length) {
      if (current !== undefined) selectedQueryHash(undefined);
      return;
    }

    if (!current || !queries.some((query) => query.queryHash === current)) {
      selectedQueryHash(queries[0].queryHash);
    }
  });

  useEffect(() => {
    const mutations = filteredMutations();
    const current = selectedMutationHash();

    if (!mutations.length) {
      if (current !== undefined) selectedMutationHash(undefined);
      return;
    }

    if (!current || !mutations.some((mutation) => mutation.mutationHash === current)) {
      selectedMutationHash(mutations[0].mutationHash);
    }
  });

  const selectedQuery = useMemo(
    () =>
      filteredQueries().find((query) => query.queryHash === selectedQueryHash()) ??
      filteredQueries()[0],
  );
  const selectedMutation = useMemo(
    () =>
      filteredMutations().find((mutation) => mutation.mutationHash === selectedMutationHash()) ??
      filteredMutations()[0],
  );

  const queryStats = useMemo(() => {
    const queries = filteredQueries();
    return {
      total: queries.length,
      fetching: queries.filter((query) => query.isFetching).length,
      stale: queries.filter((query) => query.isStale).length,
      invalidated: queries.filter((query) => query.isInvalidated).length,
    };
  });

  const globalStats = useMemo(() => {
    const queries = allQueries();
    const mutations = allMutations();
    return {
      queries: queries.length,
      activeObservers: queries.filter((query) => query.observers > 0).length,
      mutations: mutations.length,
      pendingMutations: mutations.filter((mutation) => mutation.status === 'pending').length,
    };
  });

  const scopeSummary = useMemo(() => {
    if (scopeMode() === 'all') {
      return 'Showing the full shared client state across every playground example.';
    }

    const scope = active().debug;
    if (scope.note) return scope.note;

    const querySummary = scope.includeAllQueries
      ? 'queries: all'
      : `queries: ${scope.queryPrefixes?.map(formatKey).join(', ') ?? 'none'}`;
    const mutationSummary = scope.includeAllMutations
      ? 'mutations: all'
      : `mutations: ${scope.mutationPrefixes?.map(formatKey).join(', ') ?? 'none'}`;

    return `${querySummary} | ${mutationSummary}`;
  });

  const canRunQueryActions = useMemo(() => filteredQueries().length > 0 && busyAction() === null);

  const runQueryAction = async (action: 'invalidate' | 'refetch' | 'reset' | 'remove') => {
    if (!filteredQueries().length || busyAction()) return;

    busyAction(action);

    try {
      const scope = active().debug;
      const prefixes =
        scopeMode() === 'all' || scope.includeAllQueries
          ? [undefined]
          : (scope.queryPrefixes ?? []);

      if (!prefixes.length) return;

      for (const prefix of prefixes) {
        const filters = prefix ? { queryKey: prefix } : undefined;
        if (action === 'invalidate') await queryClient.invalidateQueries(filters);
        else if (action === 'refetch') await queryClient.refetchQueries(filters);
        else if (action === 'reset') await queryClient.resetQueries(filters);
        else queryClient.removeQueries(filters);
      }
    } finally {
      busyAction(null);
    }
  };

  return (
    <aside class="fixed inset-x-4 top-4 z-30 md:left-auto md:right-4 md:w-92">
      <div class="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#090b0f]/92 text-white shadow-[0_26px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div class="border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(84,205,181,0.22),rgba(9,11,15,0.2)_42%,transparent_72%)] px-4 py-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[0.65rem] uppercase tracking-[0.26em] text-[#7bd0c4]">
                voby-query monitor
              </p>
              <h2 class="mt-1 text-base font-semibold text-white">{() => active().label}</h2>
              <p class="mt-1 max-w-[18rem] text-xs leading-5 text-white/42">{scopeSummary}</p>
            </div>

            <button
              type="button"
              onClick={() => expanded((value) => !value)}
              class="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[0.7rem] font-medium text-white/62 transition-colors hover:bg-white/10 hover:text-white"
            >
              {() => (expanded() ? 'Collapse' : 'Expand')}
            </button>
          </div>

          <div class="mt-4 flex items-center gap-2">
            {(
              [
                ['example', 'Example scope'],
                ['all', 'All queries'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                onClick={() => scopeMode(value)}
                class={() =>
                  `rounded-full border px-3 py-1 text-[0.7rem] font-medium transition-colors ${
                    scopeMode() === value
                      ? 'border-[#7bd0c4]/55 bg-[#7bd0c4]/14 text-[#d7fffa]'
                      : 'border-white/10 bg-white/4 text-white/48 hover:bg-white/8 hover:text-white/72'
                  }`
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <If when={expanded}>
          <div class="debug-scroll max-h-84 overflow-y-auto px-4 py-4 md:max-h-[calc(100vh-8rem)]">
            <div class="grid grid-cols-2 gap-2">
              <Metric label="Scoped queries" value={() => queryStats().total} />
              <Metric label="Fetching" tone="text-[#d4f6ef]" value={() => queryStats().fetching} />
              <Metric label="Stale" tone="text-[#f0c77d]" value={() => queryStats().stale} />
              <Metric
                label="Invalidated"
                tone="text-[#ff9e85]"
                value={() => queryStats().invalidated}
              />
            </div>

            <div class="mt-3 rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">
                  Client totals
                </p>
                <span class="text-[0.68rem] font-mono text-white/44">
                  {() => `${globalStats().queries} queries`}
                </span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs font-mono text-white/58">
                <span>{() => `observed ${globalStats().activeObservers}`}</span>
                <span class="text-right">{() => `mutations ${globalStats().mutations}`}</span>
                <span>{() => `pending ${globalStats().pendingMutations}`}</span>
                <span class="text-right">{() => `retry ${formatDuration(retryDelayPreview)}`}</span>
              </div>
            </div>

            <div class="mt-3 rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">
                  Scope actions
                </p>
                <span class="text-[0.68rem] font-mono text-white/38">
                  {() => busyAction() ?? 'idle'}
                </span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['invalidate', 'Invalidate'],
                    ['refetch', 'Refetch'],
                    ['reset', 'Reset'],
                    ['remove', 'Remove'],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    type="button"
                    disabled={() => !canRunQueryActions()}
                    onClick={() => void runQueryAction(action)}
                    class={() =>
                      `rounded-full border px-3 py-1.5 text-[0.72rem] font-medium transition-colors ${
                        canRunQueryActions()
                          ? 'border-white/12 bg-white/5 text-white/68 hover:bg-white/10 hover:text-white'
                          : 'cursor-not-allowed border-white/8 bg-white/3 text-white/22'
                      }`
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div class="mt-4">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">Query scopes</p>
                <span class="text-[0.68rem] font-mono text-white/38">
                  {() => `${filteredQueries().length} visible`}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <If when={() => scopeMode() === 'all'}>
                  <ScopeChip label={() => 'All playground queries'} />
                </If>
                <If when={() => scopeMode() === 'example' && active().debug.includeAllQueries}>
                  <ScopeChip label={() => 'Example uses full cache view'} />
                </If>
                <For values={() => active().debug.queryPrefixes ?? []}>
                  {(prefix) => <ScopeChip label={() => formatKey(prefix)} />}
                </For>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">Queries</p>
                <span class="text-[0.68rem] font-mono text-white/38">
                  {() => `${filteredQueries().length} entries`}
                </span>
              </div>
              <div class="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                <If when={() => filteredQueries().length === 0}>
                  <p class="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-xs text-white/32">
                    No queries matched this scope yet.
                  </p>
                </If>
                <For values={filteredQueries}>
                  {(query) => (
                    <button
                      type="button"
                      onClick={() => selectedQueryHash(query.queryHash)}
                      class={() =>
                        `rounded-2xl border px-3 py-2 text-left transition-colors ${
                          selectedQueryHash() === query.queryHash
                            ? 'border-[#7bd0c4]/45 bg-[#7bd0c4]/12'
                            : 'border-white/8 bg-white/3 hover:bg-white/6'
                        }`
                      }
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="truncate text-xs font-semibold text-white">
                            {() => formatKey(query.queryKey)}
                          </p>
                          <p class="mt-1 text-[0.68rem] font-mono text-white/38">
                            {() => query.queryHash}
                          </p>
                        </div>
                        <div class="text-right text-[0.68rem] font-mono">
                          <p class={() => (query.isFetching ? 'text-[#d7fffa]' : 'text-white/52')}>
                            {() => query.fetchStatus}
                          </p>
                          <p
                            class={() => (query.isInvalidated ? 'text-[#ffb29d]' : 'text-white/34')}
                          >
                            {() => query.status}
                          </p>
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <If when={selectedQuery}>
              <div class="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">
                      Selected query
                    </p>
                    <p class="mt-1 text-xs font-semibold text-white">
                      {() => formatKey(selectedQuery()!.queryKey)}
                    </p>
                  </div>
                  <div class="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[0.68rem] font-mono text-white/54">
                    {() => selectedQuery()!.status}
                  </div>
                </div>

                <div class="mt-3 space-y-2">
                  <DetailRow label="hash" value={() => selectedQuery()!.queryHash} />
                  <DetailRow label="fetch" value={() => selectedQuery()!.fetchStatus} />
                  <DetailRow label="observers" value={() => selectedQuery()!.observers} />
                  <DetailRow
                    label="updated"
                    value={() => formatTimestamp(selectedQuery()!.dataUpdatedAt)}
                  />
                  <DetailRow
                    label="last error"
                    value={() => formatTimestamp(selectedQuery()!.errorUpdatedAt)}
                  />
                  <DetailRow
                    label="stale time"
                    value={() => formatDuration(selectedQuery()!.staleTime)}
                  />
                  <DetailRow
                    label="gc time"
                    value={() => formatDuration(selectedQuery()!.gcTime)}
                  />
                  <DetailRow
                    label="network"
                    value={() => selectedQuery()!.networkMode ?? 'online'}
                  />
                  <DetailRow label="enabled" value={() => selectedQuery()!.enabled} />
                  <DetailRow label="invalidated" value={() => selectedQuery()!.isInvalidated} />
                </div>

                <div class="mt-3 rounded-2xl border border-white/8 bg-[#05070a] px-3 py-2">
                  <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/28">
                    Data preview
                  </p>
                  <pre class="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-[#d7fffa]">
                    {() => formatPreview(selectedQuery()!.data)}
                  </pre>
                </div>

                <If when={() => selectedQuery()!.error !== null}>
                  <div class="mt-3 rounded-2xl border border-[#ff9e85]/20 bg-[#1c0d0a] px-3 py-2">
                    <p class="text-[0.68rem] uppercase tracking-[0.22em] text-[#ffb6a3]">
                      Error preview
                    </p>
                    <pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-[#ffd3c7]">
                      {() => formatPreview(selectedQuery()!.error)}
                    </pre>
                  </div>
                </If>
              </div>
            </If>

            <div class="mt-4">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">
                  Mutation scopes
                </p>
                <span class="text-[0.68rem] font-mono text-white/38">
                  {() => `${filteredMutations().length} visible`}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <If when={() => scopeMode() === 'all'}>
                  <ScopeChip label={() => 'All playground mutations'} />
                </If>
                <If when={() => scopeMode() === 'example' && active().debug.includeAllMutations}>
                  <ScopeChip label={() => 'Example uses full mutation view'} />
                </If>
                <For values={() => active().debug.mutationPrefixes ?? []}>
                  {(prefix) => <ScopeChip label={() => formatKey(prefix)} />}
                </For>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">Mutations</p>
                <span class="text-[0.68rem] font-mono text-white/38">
                  {() => `${filteredMutations().length} entries`}
                </span>
              </div>
              <div class="mt-3 flex max-h-36 flex-col gap-2 overflow-y-auto pr-1">
                <If when={() => filteredMutations().length === 0}>
                  <p class="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-xs text-white/32">
                    No mutations matched this scope yet.
                  </p>
                </If>
                <For values={filteredMutations}>
                  {(mutation) => (
                    <button
                      type="button"
                      onClick={() => selectedMutationHash(mutation.mutationHash)}
                      class={() =>
                        `rounded-2xl border px-3 py-2 text-left transition-colors ${
                          selectedMutationHash() === mutation.mutationHash
                            ? 'border-[#f0c77d]/45 bg-[#f0c77d]/10'
                            : 'border-white/8 bg-white/3 hover:bg-white/6'
                        }`
                      }
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="truncate text-xs font-semibold text-white">
                            {() => formatKey(mutation.mutationKey)}
                          </p>
                          <p class="mt-1 text-[0.68rem] font-mono text-white/38">
                            {() => formatTimestamp(mutation.submittedAt)}
                          </p>
                        </div>
                        <div class="text-right text-[0.68rem] font-mono">
                          <p
                            class={() =>
                              mutation.status === 'pending' ? 'text-[#f7d595]' : 'text-white/52'
                            }
                          >
                            {() => mutation.status}
                          </p>
                          <p class="text-white/34">{() => `${mutation.failureCount} fail`}</p>
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <If when={selectedMutation}>
              <div class="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/30">
                      Selected mutation
                    </p>
                    <p class="mt-1 text-xs font-semibold text-white">
                      {() => formatKey(selectedMutation()!.mutationKey)}
                    </p>
                  </div>
                  <div class="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[0.68rem] font-mono text-white/54">
                    {() => selectedMutation()!.status}
                  </div>
                </div>

                <div class="mt-3 space-y-2">
                  <DetailRow
                    label="submitted"
                    value={() => formatTimestamp(selectedMutation()!.submittedAt)}
                  />
                  <DetailRow label="instances" value={() => selectedMutation()!.instances} />
                  <DetailRow label="paused" value={() => selectedMutation()!.isPaused} />
                  <DetailRow label="failures" value={() => selectedMutation()!.failureCount} />
                </div>

                <div class="mt-3 rounded-2xl border border-white/8 bg-[#05070a] px-3 py-2">
                  <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/28">Variables</p>
                  <pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-[#f7e6bb]">
                    {() => formatPreview(selectedMutation()!.variables)}
                  </pre>
                </div>

                <If when={() => selectedMutation()!.data !== undefined}>
                  <div class="mt-3 rounded-2xl border border-white/8 bg-[#05070a] px-3 py-2">
                    <p class="text-[0.68rem] uppercase tracking-[0.22em] text-white/28">Result</p>
                    <pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-[#d7fffa]">
                      {() => formatPreview(selectedMutation()!.data)}
                    </pre>
                  </div>
                </If>

                <If when={() => selectedMutation()!.error !== null}>
                  <div class="mt-3 rounded-2xl border border-[#ff9e85]/20 bg-[#1c0d0a] px-3 py-2">
                    <p class="text-[0.68rem] uppercase tracking-[0.22em] text-[#ffb6a3]">Error</p>
                    <pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-[#ffd3c7]">
                      {() => formatPreview(selectedMutation()!.error)}
                    </pre>
                  </div>
                </If>
              </div>
            </If>
          </div>
        </If>
      </div>
    </aside>
  );
};
