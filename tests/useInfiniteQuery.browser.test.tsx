import { If } from 'voby';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { QueryClientProvider } from '../src/context';
import { QueryClient } from '../src';
import { useInfiniteQuery } from '../src/useInfiniteQuery';
import { render } from './utils';

type Page = {
  value: string;
  next?: number;
  previous?: number;
};

describe('useInfiniteQuery.browser.test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('useInfiniteQuery fetches the initial page', async () => {
    const queryClient = new QueryClient();
    let result: any;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['pages'], number>({
        queryKey: ['pages'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => ({
          value: `page ${pageParam}`,
          next: pageParam + 1,
        }),
        getNextPageParam: (lastPage) => lastPage.next,
      });
      result = query;

      return (
        <>
          <If when={() => query().isLoading()}>Loading</If>
          <If when={() => query().isSuccess()}>
            {() =>
              query()
                .data()
                ?.pages.map((page) => page.value)
                .join(', ')
            }
          </If>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1');

    expect(result().data().pages).toEqual([{ value: 'page 1', next: 2 }]);
    expect(result().data().pageParams).toEqual([1]);
    expect(result().hasNextPage()).toBe(true);
    expect(result().hasPreviousPage()).toBe(false);
  });

  test('fetchNextPage works when the query is disabled', async () => {
    const queryClient = new QueryClient();
    let result: any;
    let calls = 0;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['disabled-pages'], number>({
        queryKey: ['disabled-pages'],
        enabled: false,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          calls++;
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'idle'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toBe(0);
    expect(document.body.textContent).toBe('idle');

    await result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(1);

    expect(calls).toBe(1);
    expect(document.body.textContent).toBe('page 1');
  });

  test('fetchNextPage resolves with the updated result', async () => {
    const queryClient = new QueryClient();
    let result: any;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['result-pages'], number>({
        queryKey: ['result-pages'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
          return {
            value: `page ${pageParam}`,
            next: pageParam < 2 ? pageParam + 1 : undefined,
          };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'loading'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('page 1');

    const nextPromise = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(11);
    const nextResult = await nextPromise;

    expect(nextResult.data().pageParams).toEqual([1, 2]);
    expect(nextResult.hasNextPage()).toBe(false);
  });

  test('fetchNextPage appends the next page and exposes fetching state', async () => {
    const queryClient = new QueryClient();
    let result: any;
    let resolveNextPage!: () => void;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['pages-next'], number>({
        queryKey: ['pages-next'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          if (pageParam === 2) {
            await new Promise<void>((resolve) => {
              resolveNextPage = resolve;
            });
          }
          return {
            value: `page ${pageParam}`,
            next: pageParam < 2 ? pageParam + 1 : undefined,
          };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'loading'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1');

    const promise = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(10);
    expect(result().isFetchingNextPage()).toBe(true);
    expect(result().isFetching()).toBe(true);
    expect(queryClient.getQueryState(['pages-next'])!.fetchMeta()).toEqual({
      fetchMore: { direction: 'forward' },
    });

    resolveNextPage();
    await promise;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toBe('page 1|page 2');
    expect(result().data().pageParams).toEqual([1, 2]);
    expect(result().hasNextPage()).toBe(false);
    expect(result().isFetchingNextPage()).toBe(false);
  });

  test('fetchPreviousPage prepends a previous page', async () => {
    const queryClient = new QueryClient();
    let result: any;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['pages-previous'], number>({
        queryKey: ['pages-previous'],
        initialPageParam: 2,
        queryFn: async ({ pageParam }) => ({
          value: `page ${pageParam}`,
          previous: pageParam > 1 ? pageParam - 1 : undefined,
        }),
        getNextPageParam: () => undefined,
        getPreviousPageParam: (firstPage) => firstPage.previous,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'loading'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 2');

    const p = result().fetchPreviousPage();
    await vi.advanceTimersByTimeAsync(10);
    const previousResult = await p;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toBe('page 1|page 2');
    expect(result().data().pageParams).toEqual([1, 2]);
    expect(result().hasPreviousPage()).toBe(false);
    expect(previousResult.data().pageParams).toEqual([1, 2]);
    expect(previousResult.hasPreviousPage()).toBe(false);
    expect(queryClient.getQueryState(['pages-previous'])!.fetchMeta()).toEqual({
      fetchMore: { direction: 'backward' },
    });
  });

  test('fetchNextPage does not call queryFn when there is no next page', async () => {
    const queryClient = new QueryClient();
    let result: any;
    let calls = 0;

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['no-next-page'], number>({
        queryKey: ['no-next-page'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          calls++;
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'loading'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1');

    const p = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(10);
    await p;
    await vi.advanceTimersByTimeAsync(1);

    expect(calls).toBe(1);
    expect(result().data().pages).toEqual([{ value: 'page 1' }]);
  });

  test('refetch reloads the loaded page count from the first page param', async () => {
    const queryClient = new QueryClient();
    let result: any;
    let generation = 0;
    const seenPageParams: number[] = [];

    function TestComponent() {
      const query = useInfiniteQuery<Page, Error, ['refetch-pages'], number>({
        queryKey: ['refetch-pages'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          seenPageParams.push(pageParam);
          return {
            value: `gen ${generation} page ${pageParam}`,
            next: pageParam < 2 ? pageParam + 1 : undefined,
          };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((page) => page.value)
              .join('|') ?? 'loading'
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('gen 0 page 1');

    const p1 = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(10);
    await p1;
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toBe('gen 0 page 1|gen 0 page 2');

    generation = 1;
    const p2 = result().refetch();
    await vi.advanceTimersByTimeAsync(10);
    const refetchedResult = await p2;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toBe('gen 1 page 1|gen 1 page 2');
    expect(seenPageParams).toEqual([1, 2, 1, 2]);
    expect(refetchedResult.data().pages.map((page: Page) => page.value)).toEqual([
      'gen 1 page 1',
      'gen 1 page 2',
    ]);
  });

  test('isFetchedAfterMount should be false when data is cached before mount', async () => {
    const queryClient = new QueryClient();

    await queryClient.prefetchInfiniteQuery({
      queryKey: ['cached-infinite'],
      initialPageParam: 1,
      getNextPageParam: () => undefined,
      queryFn: async () => ({ value: 'cached', next: 2 }),
    });

    let isFetchedAfterMount: boolean | undefined;

    function TestComponent() {
      const query = useInfiniteQuery({
        queryKey: ['cached-infinite'],
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        queryFn: async () => ({ value: 'fresh', next: 2 }),
      });

      isFetchedAfterMount = query().isFetchedAfterMount();

      return (
        <div>
          <span>status: {() => query().status()}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain('status: success');
    expect(isFetchedAfterMount).toBe(false);
  });
});
