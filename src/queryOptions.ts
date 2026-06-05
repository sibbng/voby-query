import type { DataTag, QueryKey, QueryOptions } from './types.ts';

export type DefinedInitialDataOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  initialData: TData;
};

export type UndefinedInitialDataOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  initialData?: undefined;
};

export function queryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
};

export function queryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
};

export function queryOptions(options: unknown) {
  return options;
}
