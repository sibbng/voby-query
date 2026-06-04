import type { QueryKey, QueryOptions } from './types.ts';

export function queryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryOptions<TQueryFnData, TError, TData, TQueryKey> {
  return options;
}
