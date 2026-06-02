import type { FunctionMaybe, Observable, ObservableMaybe, ObservableReadonly } from 'voby';
import type { MutationCache as GenericMutationCache } from './mutationCache.ts';
import type { QueryCache as GenericQueryCache } from './queryCache.ts';

export type QueryCache = GenericQueryCache;
export type MutationCache = GenericMutationCache;

export type CancelOptions = {
  silent?: boolean;
  revert?: boolean;
};

export type QueryRefetchOptions = {
  throwOnError?: boolean;
  cancelRefetch?: boolean;
};

export type InfiniteQueryDirection = 'forward' | 'backward';

export type InfiniteData<TData = unknown, TPageParam = unknown> = {
  pages: TData[];
  pageParams: TPageParam[];
};

export type InfiniteQueryFunctionContext<
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = {
  signal: AbortSignal;
  queryKey: TQueryKey;
  pageParam: TPageParam;
  direction: InfiniteQueryDirection;
};

export type QueryKey = FunctionMaybe<ObservableMaybe<unknown>[]>;
export type MutationKey = FunctionMaybe<ObservableMaybe<unknown>[]>;

export type QueryStatus = 'pending' | 'error' | 'success';
export type FetchStatus = 'fetching' | 'paused' | 'idle';
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export type QueryState<D = undefined, TError = Error> = {
  data: Observable<D>;
  dataUpdateCount: Observable<number>;
  dataUpdatedAt: Observable<number>;
  error: Observable<TError | null>;
  errorUpdateCount: Observable<number>;
  errorUpdatedAt: Observable<number>;
  meta: Observable<null>;
  isInvalidated: Observable<boolean>;
  status: Observable<QueryStatus>;
  fetchStatus: Observable<FetchStatus>;
  isFetching: ObservableReadonly<boolean>;
  isRefetching: ObservableReadonly<boolean>;
  isRefetchError: ObservableReadonly<boolean>;
  isFetched: ObservableReadonly<boolean>;
  isFetchedAfterMount: ObservableReadonly<boolean>;
  isPaused: ObservableReadonly<boolean>;
  isPending: ObservableReadonly<boolean>;
  isSuccess: ObservableReadonly<boolean>;
  isError: ObservableReadonly<boolean>;
  isLoading: ObservableReadonly<boolean>;
  isLoadingError: ObservableReadonly<boolean>;
  isPlaceholderData: ObservableReadonly<boolean>;
  isStale: Observable<boolean>;
  isIdle: ObservableReadonly<boolean>;
};

export type QueryStateReadonly<D, TError = Error> = {
  [K in keyof Omit<QueryState<D, TError>, 'meta'>]: ObservableReadonly<
    Awaited<ReturnType<QueryState<D, TError>[K]>>
  >;
} & { meta: QueryState<D, TError>['meta'] };

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

export type MutationStateReadonly<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  [K in keyof Omit<MutationState<TData, TError, TVariables, TContext>, 'meta'>]: ObservableReadonly<
    Awaited<ReturnType<MutationState<TData, TError, TVariables, TContext>[K]>>
  >;
} & { meta: MutationState<TData, TError, TVariables, TContext>['meta'] };

export type QuerySnapshot<TData = unknown, TError = Error> = {
  queryHash: string;
  queryKey: unknown[];
  status: QueryStatus;
  fetchStatus: FetchStatus;
  enabled: boolean;
  isActive: boolean;
  isCancelled: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  isRefetchError: boolean;
  isFetched: boolean;
  isFetchedAfterMount: boolean;
  isPaused: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isLoading: boolean;
  isLoadingError: boolean;
  isPlaceholderData: boolean;
  isStale: boolean;
  isIdle: boolean;
  isInvalidated: boolean;
  observers: number;
  hasData: boolean;
  data: TData | undefined;
  dataUpdateCount: number;
  dataUpdatedAt: number;
  error: TError | null;
  errorUpdateCount: number;
  errorUpdatedAt: number;
  gcTime: number;
  staleTime: number | 'static';
  refetchInterval: number | undefined;
  networkMode: QueryOptions<TData, TError>['networkMode'];
};

export type QueryFilters = {
  queryKey?: QueryKey;
  exact?: boolean;
  type?: 'all' | 'active' | 'inactive';
  stale?: boolean;
  fetchStatus?: FetchStatus;
  predicate?: (query: import('./query.ts').Query<any, any, any, any, any, any>) => boolean;
};

export type MutationFilters = {
  mutationKey?: MutationKey;
  exact?: boolean;
  status?: MutationStatus;
  predicate?: (mutation: import('./mutation.ts').Mutation<any, any, any, any>) => boolean;
};

export type QueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
> = {
  queryKey: TQueryKey;
  queryFn?: (options: { signal: AbortSignal }) => Promise<TQueryFnData>;
  queryClient?: QueryClient;
  initialData?: TInitialData;
  initialDataUpdatedAt?: number;
  placeholderData?: TData;
  enabled?: FunctionMaybe<boolean>;
  staleTime?:
    | number
    | 'static'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
      ) => number | 'static');
  refetchInterval?: number;
  gcTime?: number;
  throwOnError?: boolean;
  structuralSharing?:
    | boolean
    | ((oldData: TData | undefined, newData: Awaited<TQueryFnData>) => TData);
  select?: (data: TInitialData extends TQueryFnData ? TInitialData : TQueryFnData) => R;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  refetchOnReconnect?: boolean;
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
  retryOnMount?: boolean;
  retryDelay?: number | ((retryAttempt: number, error: TError) => number);
  cancelRefetch?: boolean;
  refetchOnWindowFocus?: boolean | 'always';
  refetchOnMount?:
    | boolean
    | 'always'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
      ) => boolean | 'always');
  queryKeyHashFn?: (queryKey: QueryKey) => string;
};

export type InfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = void,
  TInitialData extends InfiniteData<TQueryFnData, TPageParam> | undefined = undefined,
> = Omit<
  QueryOptions<
    InfiniteData<TQueryFnData, TPageParam>,
    TError,
    InfiniteData<TQueryFnData, TPageParam>,
    TQueryKey,
    TInitialData,
    R
  >,
  'queryFn'
> & {
  queryFn: (options: InfiniteQueryFunctionContext<TQueryKey, TPageParam>) => Promise<TQueryFnData>;
  initialPageParam: TPageParam;
  getNextPageParam: (
    lastPage: TQueryFnData,
    allPages: TQueryFnData[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | null | undefined;
  getPreviousPageParam?: (
    firstPage: TQueryFnData,
    allPages: TQueryFnData[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | null | undefined;
  maxPages?: number;
};

export type MutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = TData,
  TContext = unknown,
> = {
  mutationFn?: (variables: TVariables) => Promise<TData>;
  mutationKey?: MutationKey;
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  onError?: (
    error: TError,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
  retryDelay?: number | ((retryAttempt: number, error: TError) => number);
  gcTime?: number;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  throwOnError?: boolean | ((error: TError) => boolean);
  meta?: Record<string, unknown>;
  queryClient?: QueryClient;
};

export type MutateOptions<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
};

export type QueryClient = {
  cache: QueryCache;
  mutationCache: MutationCache;
  jobQueue: Map<string, number[]>;
  startQueueJob: (queueKey: string) => void;
  finishQueueJob: (queueKey: string) => void;
  getQueryData: <T>(queryKey: QueryKey) => T | undefined;
  setQueryData: <T>(
    queryKey: QueryKey,
    data: T | ((previous: T | undefined) => T | undefined),
  ) => void;
  invalidateQueries: (
    filters?: QueryFilters & {
      refetchType?: 'active' | 'inactive' | 'all' | 'none';
    },
    options?: QueryRefetchOptions,
  ) => Promise<void>;
  ensureQueryData: <T>(options: QueryOptions<T>) => Promise<T>;
  fetchQuery: <T>(options: QueryOptions<T>) => Promise<T>;
  prefetchQuery: <T>(options: QueryOptions<T>) => Promise<void>;
  refetchQueries: (filters?: QueryFilters, options?: QueryRefetchOptions) => Promise<void>;
  cancelQueries: (filters?: QueryFilters, options?: CancelOptions) => Promise<void>;
  removeQueries: (filters?: QueryFilters) => void;
  resetQueries: (filters?: QueryFilters, options?: QueryRefetchOptions) => Promise<void>;
  isFetching: (filters?: QueryFilters) => number;
  isMutating: (filters?: MutationFilters) => number;
  getQueryCache: () => QueryCache;
  getMutationCache: () => MutationCache;
  clear: () => void;
  getDefaultOptions: () => {
    queries: Omit<QueryOptions, 'queryKey'>;
    mutations: MutationOptions;
  };
  setDefaultOptions: (options: {
    queries?: Partial<QueryOptions>;
    mutations?: Partial<MutationOptions>;
  }) => void;
  getQueryDefaults: (queryKey: QueryKey) => Partial<QueryOptions>;
  setQueryDefaults: (queryKey: QueryKey, defaults: Partial<QueryOptions>) => void;
  getMutationDefaults: (mutationKey?: MutationKey) => Partial<MutationOptions>;
  setMutationDefaults: (mutationKey: MutationKey, defaults: Partial<MutationOptions>) => void;
};

type UseQueryResultMethods = {
  refetch: (options?: QueryRefetchOptions) => Promise<void>;
  cancel: (options?: CancelOptions) => Promise<void>;
};

type UseQueryResultValue<TData, TError = Error> = QueryStateReadonly<TData, TError> &
  UseQueryResultMethods;

export type UseQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseQueryResultValue<TData | undefined, TError>
>;

type DefinedUseQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseQueryResultValue<TData, TError>
>;

export type UseQueryReturn<TData, TError, TInitialData> = TInitialData extends undefined
  ? UseQueryResult<TData, TError>
  : DefinedUseQueryResult<TData, TError>;

export type UseSuspenseQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
> = Omit<
  QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
  'enabled' | 'placeholderData' | 'throwOnError'
>;

type UseSuspenseQueryResultValue<TData, TError = Error> = Omit<
  UseQueryResultValue<TData, TError>,
  'isPlaceholderData'
>;

export type UseSuspenseQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseSuspenseQueryResultValue<TData, TError>
>;

type InfiniteQueryFetchPageOptions = QueryRefetchOptions;

type UseInfiniteQueryResultMethods = UseQueryResultMethods & {
  fetchNextPage: (options?: InfiniteQueryFetchPageOptions) => Promise<void>;
  fetchPreviousPage: (options?: InfiniteQueryFetchPageOptions) => Promise<void>;
  hasNextPage: ObservableReadonly<boolean>;
  hasPreviousPage: ObservableReadonly<boolean>;
  isFetchingNextPage: ObservableReadonly<boolean>;
  isFetchingPreviousPage: ObservableReadonly<boolean>;
};

type UseInfiniteQueryResultValue<TData, TError = Error> = QueryStateReadonly<TData, TError> &
  UseInfiniteQueryResultMethods;

export type UseInfiniteQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseInfiniteQueryResultValue<TData | undefined, TError>
>;

type DefinedUseInfiniteQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseInfiniteQueryResultValue<TData, TError>
>;

export type UseInfiniteQueryReturn<TData, TError, TInitialData> = TInitialData extends undefined
  ? UseInfiniteQueryResult<TData, TError>
  : DefinedUseInfiniteQueryResult<TData, TError>;

type UseMutationResultMethods<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
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

type UseMutationResultValue<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = MutationStateReadonly<TData, TError, TVariables, TContext> &
  UseMutationResultMethods<TData, TError, TVariables, TContext>;

export type UseMutationResult<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> = ObservableReadonly<UseMutationResultValue<TData, TError, TVariables, TContext>>;
