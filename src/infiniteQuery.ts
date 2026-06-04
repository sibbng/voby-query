import { addToEnd, addToStart } from './utils.ts';
import type {
  InfiniteData,
  InfiniteQueryDirection,
  InfiniteQueryOptions,
  QueryKey,
} from './types.ts';

type InfiniteOptionsLike<
  TQueryFnData,
  TQueryKey extends QueryKey,
  TPageParam,
> = InfiniteQueryOptions<TQueryFnData, any, TQueryKey, TPageParam>;

export const getNextPageParam = <TQueryFnData, TPageParam>(
  options: Pick<InfiniteOptionsLike<TQueryFnData, any, TPageParam>, 'getNextPageParam'>,
  data?: InfiniteData<TQueryFnData, TPageParam>,
): TPageParam | null | undefined => {
  if (!data || data.pages.length === 0) return undefined;

  const lastIndex = data.pages.length - 1;
  return options.getNextPageParam(
    data.pages[lastIndex],
    data.pages,
    data.pageParams[lastIndex],
    data.pageParams,
  );
};

export const getPreviousPageParam = <TQueryFnData, TPageParam>(
  options: Pick<InfiniteOptionsLike<TQueryFnData, any, TPageParam>, 'getPreviousPageParam'>,
  data?: InfiniteData<TQueryFnData, TPageParam>,
): TPageParam | null | undefined => {
  if (!data || data.pages.length === 0 || !options.getPreviousPageParam) return undefined;

  return options.getPreviousPageParam(
    data.pages[0],
    data.pages,
    data.pageParams[0],
    data.pageParams,
  );
};

export const hasNextPage = <TQueryFnData, TPageParam>(
  options: Pick<InfiniteOptionsLike<TQueryFnData, any, TPageParam>, 'getNextPageParam'>,
  data?: InfiniteData<TQueryFnData, TPageParam>,
): boolean => getNextPageParam(options, data) != null;

export const hasPreviousPage = <TQueryFnData, TPageParam>(
  options: Pick<InfiniteOptionsLike<TQueryFnData, any, TPageParam>, 'getPreviousPageParam'>,
  data?: InfiniteData<TQueryFnData, TPageParam>,
): boolean => getPreviousPageParam(options, data) != null;

export const fetchInfinitePage = async <TQueryFnData, TQueryKey extends QueryKey, TPageParam>({
  options,
  signal,
  pageParam,
  direction,
}: {
  options: InfiniteOptionsLike<TQueryFnData, TQueryKey, TPageParam>;
  signal: AbortSignal;
  pageParam: TPageParam;
  direction: InfiniteQueryDirection;
}): Promise<TQueryFnData> => {
  return options.queryFn({
    signal,
    queryKey: options.queryKey,
    pageParam,
    direction,
  });
};

export const fetchInitialInfiniteData = async <
  TQueryFnData,
  TQueryKey extends QueryKey,
  TPageParam,
>({
  options,
  signal,
}: {
  options: InfiniteOptionsLike<TQueryFnData, TQueryKey, TPageParam>;
  signal: AbortSignal;
}): Promise<InfiniteData<TQueryFnData, TPageParam>> => {
  const initialData = options.initialData as InfiniteData<TQueryFnData, TPageParam> | undefined;
  const pageParam = initialData?.pageParams[0] ?? options.initialPageParam;
  const page = await fetchInfinitePage({
    options,
    signal,
    pageParam,
    direction: 'forward',
  });

  return {
    pages: [page],
    pageParams: [pageParam],
  };
};

export const fetchInfiniteDataPage = async <TQueryFnData, TQueryKey extends QueryKey, TPageParam>({
  options,
  signal,
  data,
  direction,
}: {
  options: InfiniteOptionsLike<TQueryFnData, TQueryKey, TPageParam>;
  signal: AbortSignal;
  data?: InfiniteData<TQueryFnData, TPageParam>;
  direction: InfiniteQueryDirection;
}): Promise<InfiniteData<TQueryFnData, TPageParam>> => {
  if (!data || data.pages.length === 0) {
    return fetchInitialInfiniteData({ options, signal });
  }

  const pageParam =
    direction === 'backward'
      ? getPreviousPageParam(options, data)
      : getNextPageParam(options, data);

  if (pageParam == null) return data;

  const page = await fetchInfinitePage({
    options,
    signal,
    pageParam,
    direction,
  });
  const addPage = direction === 'backward' ? addToStart : addToEnd;

  return {
    pages: addPage(data.pages, page, options.maxPages),
    pageParams: addPage(data.pageParams, pageParam, options.maxPages),
  };
};

export const refetchInfiniteData = async <TQueryFnData, TQueryKey extends QueryKey, TPageParam>({
  options,
  signal,
  data,
}: {
  options: InfiniteOptionsLike<TQueryFnData, TQueryKey, TPageParam>;
  signal: AbortSignal;
  data?: InfiniteData<TQueryFnData, TPageParam>;
}): Promise<InfiniteData<TQueryFnData, TPageParam>> => {
  const existingPageCount = data?.pages.length ?? 0;
  const firstPageParam = data?.pageParams[0] ?? options.initialPageParam;
  let nextData: InfiniteData<TQueryFnData, TPageParam> = {
    pages: [],
    pageParams: [],
  };

  for (let index = 0; index < Math.max(existingPageCount, 1); index++) {
    const pageParam = index === 0 ? firstPageParam : getNextPageParam(options, nextData);

    if (index > 0 && pageParam == null) break;

    const page = await fetchInfinitePage({
      options,
      signal,
      pageParam: pageParam as TPageParam,
      direction: 'forward',
    });

    nextData = {
      pages: addToEnd(nextData.pages, page, options.maxPages),
      pageParams: addToEnd(nextData.pageParams, pageParam as TPageParam, options.maxPages),
    };
  }

  return nextData;
};
