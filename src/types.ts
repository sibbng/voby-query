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
  throwOnError?:
    | boolean
    | ((error: any, query: import('./query.ts').Query<any, any, any, any>) => boolean);
  cancelRefetch?: boolean;
};

export type SetDataOptions = {
  updatedAt?: number;
};

export type Updater<TInput, TOutput> = TOutput | ((input: TInput) => TOutput);

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

export const dataTagSymbol = Symbol('dataTagSymbol');
export type dataTagSymbol = typeof dataTagSymbol;
export const dataTagErrorSymbol = Symbol('dataTagErrorSymbol');
export type dataTagErrorSymbol = typeof dataTagErrorSymbol;
export const unsetMarker = Symbol('unsetMarker');
export type UnsetMarker = typeof unsetMarker;
export type AnyDataTag = {
  [dataTagSymbol]: any;
  [dataTagErrorSymbol]: any;
};
export type DataTag<TType, TValue, TError = UnsetMarker> = TType extends AnyDataTag
  ? TType
  : TType & {
      [dataTagSymbol]: TValue;
      [dataTagErrorSymbol]: TError;
    };

export type InferDataFromTag<TQueryFnData, TTaggedQueryKey extends QueryKey> =
  TTaggedQueryKey extends DataTag<unknown, infer TaggedValue, unknown> ? TaggedValue : TQueryFnData;

export type InferErrorFromTag<TError, TTaggedQueryKey extends QueryKey> =
  TTaggedQueryKey extends DataTag<unknown, unknown, infer TaggedError>
    ? TaggedError extends UnsetMarker
      ? TError
      : TaggedError
    : TError;

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
  failureCount: Observable<number>;
  failureReason: Observable<TError | null>;
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
  isInitialLoading: ObservableReadonly<boolean>;
  isEnabled: ObservableReadonly<boolean>;
};

export type QueryStateReadonly<D, TError = Error> = {
  [K in keyof Omit<QueryState<D, TError>, 'meta'>]: ObservableReadonly<
    ReturnType<QueryState<D, TError>[K]>
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
    ReturnType<MutationState<TData, TError, TVariables, TContext>[K]>
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
  isInitialLoading: boolean;
  isEnabled: boolean;
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
  predicate?: (query: import('./query.ts').Query<any, any, any, any>) => boolean;
};

export type MutationFilters = {
  mutationKey?: MutationKey;
  exact?: boolean;
  status?: MutationStatus;
  predicate?: (mutation: import('./mutation.ts').Mutation<any, any, any, any>) => boolean;
};

// Full user-facing options — includes both query-level and observer-level fields
export type QueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = {
  queryKey: TQueryKey;
  queryFn?: (options: {
    signal: AbortSignal;
    queryKey: TQueryKey;
    meta?: Record<string, unknown>;
  }) => Promise<TQueryFnData> | TQueryFnData;
  queryClient?: QueryClient;
  initialData?: TData | (() => TData | undefined);
  initialDataUpdatedAt?: number;
  placeholderData?:
    | TQueryFnData
    | ((previousData: TQueryFnData | undefined) => TQueryFnData | undefined);
  enabled?: FunctionMaybe<boolean>;
  staleTime?:
    | number
    | 'static'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => number | 'static');
  refetchInterval?: number;
  gcTime?: number;
  throwOnError?:
    | boolean
    | ((
        error: TError,
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean);
  structuralSharing?:
    | boolean
    | ((oldData: TData | undefined, newData: Awaited<TQueryFnData>) => TData);
  select?: (data: TQueryFnData) => TData;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  refetchOnReconnect?:
    | boolean
    | 'always'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean | 'always');
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
  retryOnMount?:
    | boolean
    | ((query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>) => boolean);
  retryDelay?: number | ((retryAttempt: number, error: TError) => number);
  cancelRefetch?: boolean;
  refetchOnWindowFocus?:
    | boolean
    | 'always'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean | 'always');
  refetchOnMount?:
    | boolean
    | 'always'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean | 'always');
  refetchIntervalInBackground?: boolean;
  notifyOnChangeProps?:
    | Array<'data' | 'error' | 'isLoading' | 'isPending' | 'isFetching' | 'isStale'>
    | 'all';
  subscribed?: boolean;
  meta?: Record<string, unknown>;
  queryKeyHashFn?: (queryKey: QueryKey) => string;
};

// Observer-level fields only — per hook call
export type ObserverOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = {
  enabled?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['enabled'];
  staleTime?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['staleTime'];
  refetchInterval?:
    | QueryOptions<TQueryFnData, TError, TData, TQueryKey>['refetchInterval']
    | false
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => number | false);
  refetchIntervalInBackground?: QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >['refetchIntervalInBackground'];
  refetchOnWindowFocus?:
    | QueryOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnWindowFocus']
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean | 'always');
  refetchOnReconnect?:
    | QueryOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnReconnect']
    | 'always'
    | ((
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean | 'always');
  refetchOnMount?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnMount'];
  retryOnMount?:
    | QueryOptions<TQueryFnData, TError, TData, TQueryKey>['retryOnMount']
    | ((query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>) => boolean);
  throwOnError?:
    | QueryOptions<TQueryFnData, TError, TData, TQueryKey>['throwOnError']
    | ((
        error: TError,
        query: import('./query.ts').Query<TQueryFnData, TError, TData, TQueryKey>,
      ) => boolean);
  select?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['select'];
  placeholderData?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['placeholderData'];
  notifyOnChangeProps?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['notifyOnChangeProps'];
  subscribed?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['subscribed'];
  suspense?: boolean;
};

// Combined — what users pass to useQuery (same as QueryOptions)
export type UseQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryOptions<TQueryFnData, TError, TData, TQueryKey>;

export type ResolvedQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
> = Omit<QueryOptions<TQueryFnData, TError, TData, QueryKey>, 'queryKey' | 'enabled'> & {
  queryKey: unknown[];
  enabled: boolean;
  queryClient: QueryClient;
};

export type ResolvedObserverOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = {
  enabled: boolean;
  staleTime: NonNullable<ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['staleTime']>;
  refetchInterval: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['refetchInterval'];
  refetchIntervalInBackground: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['refetchIntervalInBackground']
  >;
  refetchOnWindowFocus: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnWindowFocus']
  >;
  refetchOnReconnect: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnReconnect']
  >;
  refetchOnMount: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['refetchOnMount']
  >;
  retryOnMount: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['retryOnMount']
  >;
  throwOnError: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['throwOnError']
  >;
  select: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['select'];
  placeholderData: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['placeholderData'];
  notifyOnChangeProps: NonNullable<
    ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['notifyOnChangeProps']
  >;
  subscribed: NonNullable<ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['subscribed']>;
  suspense: NonNullable<ObserverOptions<TQueryFnData, TError, TData, TQueryKey>['suspense']>;
};

export type InfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = Omit<
  QueryOptions<
    InfiniteData<TQueryFnData, TPageParam>,
    TError,
    InfiniteData<TQueryFnData, TPageParam>,
    TQueryKey
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

export type ResolvedMutationOptions<
  TData = unknown,
  TError = unknown,
  TVariables = TData,
  TContext = unknown,
> = Omit<MutationOptions<TData, TError, TVariables, TContext>, 'mutationKey'> & {
  mutationKey: unknown[];
  queryClient: QueryClient;
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
  getQueryData: <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
  ) => TInferredQueryFnData | undefined;
  setQueryData: <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
    data:
      | TInferredQueryFnData
      | ((previous: TInferredQueryFnData | undefined) => TInferredQueryFnData | undefined),
  ) => void;
  getQueryState: <
    TQueryFnData = unknown,
    TError = Error,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
    TInferredError = InferErrorFromTag<TError, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
  ) => QueryState<TInferredQueryFnData, TInferredError> | undefined;
  invalidateQueries: (
    filters?: QueryFilters & {
      refetchType?: 'active' | 'inactive' | 'all' | 'none';
    },
    options?: QueryRefetchOptions,
  ) => Promise<void>;
  ensureQueryData: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<TData>;
  ensureInfiniteQueryData: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<InfiniteData<TQueryFnData, TPageParam>>;
  fetchQuery: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<TData>;
  fetchInfiniteQuery: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<InfiniteData<TQueryFnData, TPageParam>>;
  prefetchQuery: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<void>;
  prefetchInfiniteQuery: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<void>;
  getQueriesData: <TQueryFnData = unknown>(
    filters: QueryFilters,
  ) => Array<[QueryKey, TQueryFnData | undefined]>;
  setQueriesData: <TQueryFnData>(
    filters: QueryFilters,
    updater: Updater<TQueryFnData | undefined, TQueryFnData | undefined>,
    options?: SetDataOptions,
  ) => void;
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
    queries?: Partial<Omit<QueryOptions, 'queryKey'>>;
    mutations?: Partial<MutationOptions>;
  }) => void;
  getQueryDefaults: (queryKey: QueryKey) => Partial<QueryOptions>;
  setQueryDefaults: (queryKey: QueryKey, defaults: Partial<QueryOptions>) => void;
  getMutationDefaults: (mutationKey?: MutationKey) => Partial<MutationOptions>;
  setMutationDefaults: (mutationKey: MutationKey, defaults: Partial<MutationOptions>) => void;
};

type UseQueryResultMethods<TData = unknown> = {
  refetch: (options?: QueryRefetchOptions) => Promise<void>;
  cancel: (options?: CancelOptions) => Promise<void>;
  promise: () => Promise<TData>;
};

export type UseQueriesOptions<T extends Array<any>, TCombinedResult = QueriesResults<T>> = {
  queries: readonly [...QueriesOptions<T>];
  combine?: (result: QueriesResults<T>) => TCombinedResult;
  subscribed?: boolean;
  queryClient?: QueryClient;
};

export type QueriesOptions<T extends Array<any>> = {
  [K in keyof T]: QueryOptions;
};

export type QueriesResultItem<TData = unknown, TError = Error> = QueryState<TData, TError> &
  UseQueryResultMethods;

export type QueriesResults<T extends Array<any>> = {
  [K in keyof T]: QueriesResultItem;
};

type UseQueryResultValue<TData, TError = Error> = QueryStateReadonly<TData, TError> &
  UseQueryResultMethods<TData>;

export type UseQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseQueryResultValue<TData | undefined, TError>
>;

export type UseSuspenseQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'enabled' | 'placeholderData' | 'throwOnError'
>;

type UseSuspenseQueryResultValue<TData, TError = Error> = Omit<
  UseQueryResultValue<TData, TError>,
  'isPlaceholderData'
>;

export type UseSuspenseQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseSuspenseQueryResultValue<TData, TError>
>;

export type UseSuspenseInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = Omit<
  InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  'enabled' | 'placeholderData' | 'throwOnError'
>;

type UseSuspenseInfiniteQueryResultValue<TData, TError = Error> = Omit<
  UseInfiniteQueryResultValue<TData, TError>,
  'isPlaceholderData'
>;

export type UseSuspenseInfiniteQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseSuspenseInfiniteQueryResultValue<TData, TError>
>;

export type UsePrefetchQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<QueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryFn'> & {
  queryKey: TQueryKey;
  queryFn?: (ctx: {
    signal: AbortSignal;
    queryKey: TQueryKey;
    meta?: Record<string, unknown>;
  }) => Promise<TQueryFnData>;
};

export type UsePrefetchInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = Omit<InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>, 'queryFn'> & {
  queryKey: TQueryKey;
  queryFn?: (ctx: InfiniteQueryFunctionContext<TQueryKey, TPageParam>) => Promise<TQueryFnData>;
};

type InfiniteQueryFetchPageOptions = QueryRefetchOptions;

type UseInfiniteQueryResultMethods<TData = unknown> = UseQueryResultMethods<TData> & {
  fetchNextPage: (options?: InfiniteQueryFetchPageOptions) => Promise<void>;
  fetchPreviousPage: (options?: InfiniteQueryFetchPageOptions) => Promise<void>;
  hasNextPage: ObservableReadonly<boolean>;
  hasPreviousPage: ObservableReadonly<boolean>;
  isFetchingNextPage: ObservableReadonly<boolean>;
  isFetchingPreviousPage: ObservableReadonly<boolean>;
};

type UseInfiniteQueryResultValue<TData, TError = Error> = QueryStateReadonly<TData, TError> &
  UseInfiniteQueryResultMethods<TData>;

export type UseInfiniteQueryResult<TData = unknown, TError = Error> = ObservableReadonly<
  UseInfiniteQueryResultValue<TData | undefined, TError>
>;

type UseMutationResultMethods<
  TData = unknown,
  TError = unknown,
  TVariables = unknown,
  TContext = unknown,
> = {
  mutate: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TContext>,
  ) => void;
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
