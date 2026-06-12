import { Suspense } from 'voby';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { QueryClientProvider } from '../src/context';
import { createQueryClient, usePrefetchInfiniteQuery, useSuspenseInfiniteQuery } from '../src';
import { render, sleep } from './utils';

type Page = {
  value: string;
  next?: number;
};

describe('usePrefetchInfiniteQuery.browser.test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('usePrefetchInfiniteQuery populates the cache with first page', async () => {
    const queryClient = createQueryClient();

    function PrefetchComponent() {
      usePrefetchInfiniteQuery<Page, Error, ['prefetch-inf'], number>({
        queryKey: ['prefetch-inf'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return <p>Prefetch done</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <PrefetchComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);

    const data = queryClient.getQueryData(['prefetch-inf']);
    expect(data).toEqual({
      pages: [{ value: 'page 1', next: 2 }],
      pageParams: [1],
    });
  });

  test('usePrefetchInfiniteQuery does not re-fetch when already cached', async () => {
    const queryClient = createQueryClient();

    await queryClient.fetchQuery({
      queryKey: ['prefetch-inf-no-refetch'],
      queryFn: async () => ({
        pages: [{ value: 'existing', next: undefined }],
        pageParams: [1],
      }),
    });

    let fetchCount = 0;

    function PrefetchComponent() {
      usePrefetchInfiniteQuery<Page, Error, ['prefetch-inf-no-refetch'], number>({
        queryKey: ['prefetch-inf-no-refetch'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          fetchCount++;
          await sleep(5);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return <p>Done</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <PrefetchComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);

    const data = queryClient.getQueryData(['prefetch-inf-no-refetch']);
    expect(data).toEqual({
      pages: [{ value: 'existing', next: undefined }],
      pageParams: [1],
    });
    expect(fetchCount).toBe(0);
  });

  test('usePrefetchInfiniteQuery before Suspense eliminates waterfall', async () => {
    const queryClient = createQueryClient();

    function PrefetchLayer() {
      usePrefetchInfiniteQuery<Page, Error, ['prefetch-inf-suspense'], number>({
        queryKey: ['prefetch-inf-suspense'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(10);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return (
        <Suspense fallback={<p>Should not suspend</p>}>
          <Child />
        </Suspense>
      );
    }

    function Child() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['prefetch-inf-suspense'], number>({
        queryKey: ['prefetch-inf-suspense'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(10);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return (
        <p>
          {() =>
            query()
              .data()
              ?.pages.map((p) => p.value)
              .join(', ')
          }
        </p>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Outer loading</p>}>
          <PrefetchLayer />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);

    expect(document.body.textContent).toBe('page 1');
  });
});
