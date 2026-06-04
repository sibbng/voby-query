import type { DataTag, InfiniteData, InfiniteQueryOptions, QueryKey } from './types.ts';

export type DefinedInitialDataInfiniteOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
  initialData: InfiniteData<TQueryFnData, TPageParam>
}

export type UndefinedInitialDataInfiniteOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
  initialData?: undefined
}

export function infiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
): DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}

export function infiniteQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
): UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}

export function infiniteQueryOptions(options: unknown) {
  return options;
}
