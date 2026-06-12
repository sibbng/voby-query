import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { ErrorBoundary, Suspense } from 'voby';
import { QueryClientProvider } from '../src/context';
import { createQueryClient } from '../src';
import { useSuspenseInfiniteQuery } from '../src/useSuspenseInfiniteQuery';
import { render, sleep } from './utils';

type Page = {
  value: string;
  next?: number;
  previous?: number;
};

describe('useSuspenseInfiniteQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('useSuspenseInfiniteQuery - suspends when no data, renders after fetch', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf'], number>({
        queryKey: ['suspend-inf'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          fetchCount++;
          await sleep(5);
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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('Loading...');

    await vi.advanceTimersByTimeAsync(30);

    expect(document.body.textContent).toBe('page 1');
    expect(fetchCount).toBe(1);
  });

  test('useSuspenseInfiniteQuery - data is always defined when rendered', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-defined'], number>({
        queryKey: ['suspend-inf-defined'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return <p>{() => `pages=${query().data()?.pages.length}`}</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    expect(document.body.textContent).toBe('pages=1');
  });

  test('useSuspenseInfiniteQuery - uses cached data without suspending', async () => {
    const queryClient = createQueryClient();

    await queryClient.fetchQuery({
      queryKey: ['suspend-inf-cached'],
      queryFn: async () => ({
        pages: [{ value: 'cached page 1' }],
        pageParams: [1],
      }),
    });

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-cached'], number>({
        queryKey: ['suspend-inf-cached'],
        initialPageParam: 1,
        queryFn: async () => {
          throw new Error('should not be called');
        },
        getNextPageParam: () => undefined,
        staleTime: 60_000,
        refetchOnMount: false,
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
        <Suspense fallback={<p>Should not appear</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);

    expect(document.body.textContent).toBe('cached page 1');
  });

  test('useSuspenseInfiniteQuery - error thrown on fetch failure', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-error'], number>({
        queryKey: ['suspend-inf-error'],
        initialPageParam: 1,
        queryFn: async () => {
          await sleep(5);
          throw new Error('fetch failed');
        },
        getNextPageParam: () => undefined,
        retry: false,
      });

      return <p>{() => query().status()}</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <ErrorBoundary
            fallback={(props: { error: Error }) => <p>Caught: {props.error.message}</p>}
          >
            <Suspendable />
          </ErrorBoundary>
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('Loading...');

    await vi.advanceTimersByTimeAsync(30);
    await vi.advanceTimersByTimeAsync(10);

    expect(document.body.textContent).toContain('Caught: fetch failed');
  });

  test('useSuspenseInfiniteQuery - status is success when rendered', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-status'], number>({
        queryKey: ['suspend-inf-status'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}`, next: pageParam + 1 };
        },
        getNextPageParam: (lastPage) => lastPage.next,
      });

      return <p>{() => `status=${query().status()}`}</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    expect(document.body.textContent).toBe('status=success');
  });

  test('useSuspenseInfiniteQuery - fetchNextPage appends next page', async () => {
    const queryClient = createQueryClient();
    let result: any;

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-next'], number>({
        queryKey: ['suspend-inf-next'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
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
              ?.pages.map((p) => p.value)
              .join('|')
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1');

    const nextPromise = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(10);
    await nextPromise;
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1|page 2');

    expect(result().data().pageParams).toEqual([1, 2]);
    expect(result().hasNextPage()).toBe(false);
  });

  test('useSuspenseInfiniteQuery - fetchPreviousPage prepends a previous page', async () => {
    const queryClient = createQueryClient();
    let result: any;

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-prev'], number>({
        queryKey: ['suspend-inf-prev'],
        initialPageParam: 2,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return {
            value: `page ${pageParam}`,
            previous: pageParam > 1 ? pageParam - 1 : undefined,
          };
        },
        getNextPageParam: () => undefined,
        getPreviousPageParam: (firstPage) => firstPage.previous,
      });
      result = query;

      return (
        <div>
          {() =>
            query()
              .data()
              ?.pages.map((p) => p.value)
              .join('|')
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 2');

    const prevPromise = result().fetchPreviousPage();
    await vi.advanceTimersByTimeAsync(10);
    await prevPromise;
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('page 1|page 2');

    expect(result().data().pageParams).toEqual([1, 2]);
    expect(result().hasPreviousPage()).toBe(false);
  });

  test('useSuspenseInfiniteQuery - refetch reloads from first page param', async () => {
    const queryClient = createQueryClient();
    let result: any;
    let generation = 0;

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-refetch'], number>({
        queryKey: ['suspend-inf-refetch'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
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
              ?.pages.map((p) => p.value)
              .join('|')
          }
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('gen 0 page 1');

    const nextPromise = result().fetchNextPage();
    await vi.advanceTimersByTimeAsync(10);
    await nextPromise;
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('gen 0 page 1|gen 0 page 2');

    generation = 1;
    const refetchPromise = result().refetch();
    await vi.advanceTimersByTimeAsync(10);
    await refetchPromise;
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('gen 1 page 1|gen 1 page 2');
  });

  test('useSuspenseInfiniteQuery - no isPlaceholderData property on result', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-no-placeholder'], number>({
        queryKey: ['suspend-inf-no-placeholder'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
      });

      const result = query();
      expect('isPlaceholderData' in result).toBe(false);

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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    expect(document.body.textContent).toBe('page 1');
  });

  test('useSuspenseInfiniteQuery - staleTime and gcTime are clamped to minimum 1000ms', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-clamp'], number>({
        queryKey: ['suspend-inf-clamp'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
        staleTime: 0,
        gcTime: 0,
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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-inf-clamp'] })!;
    expect(internalQuery.resolvedOptions.staleTime).toBeGreaterThanOrEqual(1000);
    expect(internalQuery.resolvedOptions.gcTime).toBeGreaterThanOrEqual(1000);
  });

  test('useSuspenseInfiniteQuery - staleTime 0 should not mark query stale immediately (clamped to 1000)', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-not-stale'], number>({
        queryKey: ['suspend-inf-not-stale'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
        staleTime: 0,
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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    const internalQuery = queryClient
      .getQueryCache()
      .find({ queryKey: ['suspend-inf-not-stale'] })!;
    expect(internalQuery.state.isStale()).toBe(false);
  });

  test('useSuspenseInfiniteQuery - preserves default gcTime when not provided', async () => {
    const queryClient = createQueryClient();

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-default-gc'], number>({
        queryKey: ['suspend-inf-default-gc'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    const internalQuery = queryClient
      .getQueryCache()
      .find({ queryKey: ['suspend-inf-default-gc'] })!;
    expect(internalQuery.resolvedOptions.gcTime).toBe(5 * 60 * 1000);
  });

  test('useSuspenseInfiniteQuery - wraps function staleTime to clamp return value', async () => {
    const queryClient = createQueryClient();
    const staleTimeFn = vi.fn(() => 0);

    function Suspendable() {
      const query = useSuspenseInfiniteQuery<Page, Error, ['suspend-inf-fn-stale'], number>({
        queryKey: ['suspend-inf-fn-stale'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          await sleep(5);
          return { value: `page ${pageParam}` };
        },
        getNextPageParam: () => undefined,
        staleTime: staleTimeFn,
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
        <Suspense fallback={<p>Loading...</p>}>
          <Suspendable />
        </Suspense>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(30);

    expect(staleTimeFn).toHaveBeenCalled();

    const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-inf-fn-stale'] })!;
    const resolvedStaleTime = internalQuery.resolvedOptions.staleTime;
    expect(typeof resolvedStaleTime).toBe('function');

    const result = (resolvedStaleTime as (q: any) => any)(internalQuery);
    expect(result).toBeGreaterThanOrEqual(1000);
  });
});
