import { expect, test, vi } from 'vite-plus/test';
import { flush, render, sleep } from './utils';
import { waitFor } from '@testing-library/dom';
import { $, ErrorBoundary, Suspense } from 'voby';
import { createQueryClient } from '../src';
import { useSuspenseQuery } from '../src/useSuspenseQuery';
import { QueryClientProvider } from '../src/context';

function fetchOk(delay = 5, value = 'ok'): Promise<string> {
  return new Promise((r) => setTimeout(() => r(value), delay));
}

function fetchFail(delay = 5, msg = 'fail'): Promise<string> {
  return new Promise((_, r) => setTimeout(() => r(new Error(msg)), delay));
}

test('useSuspenseQuery - suspends when no data, renders after fetch', async () => {
  const queryClient = createQueryClient();
  let fetchCount = 0;

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-test-1'],
      queryFn: async () => {
        fetchCount++;
        return fetchOk(5, 'suspense data');
      },
    });

    return <p>{() => query().data()}</p>;
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

  await sleep(20);

  expect(document.body.textContent).toBe('suspense data');
  expect(fetchCount).toBe(1);
});

test('useSuspenseQuery - data is always defined when rendered', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-defined'],
      queryFn: async () => {
        await sleep(5);
        return { id: 42, name: 'test' };
      },
    });

    return (
      <p>
        {() => {
          const d = query().data();
          if (!d) return null;
          return `id=${d.id} name=${d.name}`;
        }}
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

  await sleep(20);

  expect(document.body.textContent).toBe('id=42 name=test');
});

test('useSuspenseQuery - uses cached data without suspending', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['suspend-cached'],
    queryFn: async () => 'cached result',
  });

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-cached'],
      queryFn: async () => 'should not be called',
      staleTime: 60_000,
      refetchOnMount: false,
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Should not appear</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(10);

  expect(document.body.textContent).toBe('cached result');
});

test('useSuspenseQuery - error thrown on fetch failure', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-error'],
      queryFn: async () => {
        await sleep(5);
        throw new Error('fetch failed');
      },
      retry: false,
    });

    return <p>{() => query().error()?.message}</p>;
  }

  function ErrorFallback({ error }: { error: Error; reset: () => void }) {
    return <p>Caught: {error.message}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <ErrorBoundary fallback={(props: { error: Error }) => <p>Caught: {props.error.message}</p>}>
          <Suspendable />
        </ErrorBoundary>
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Loading...');

  await sleep(30);

  await waitFor(() => {
    expect(document.body.textContent).toContain('Caught: fetch failed');
  });
});

test('useSuspenseQuery - status is success when rendered', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-status'],
      queryFn: async () => {
        await sleep(5);
        return 'ok';
      },
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

  await sleep(20);

  expect(document.body.textContent).toBe('status=success');
});

test('useSuspenseQuery - refetch after mount updates data', async () => {
  const queryClient = createQueryClient();
  let fetchCount = 0;

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-refetch'],
      queryFn: async () => {
        fetchCount++;
        await sleep(5);
        return `data v${fetchCount}`;
      },
      staleTime: 60_000,
    });

    return (
      <div>
        <p>{() => query().data()}</p>
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

  await sleep(20);

  expect(document.body.textContent).toContain('data v1');

  await queryClient.refetchQueries({ queryKey: ['suspend-refetch'] });
  await sleep(20);

  expect(document.body.textContent).toContain('data v2');
});

test('useSuspenseQuery - select transforms data', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-select'],
      queryFn: async () => {
        await sleep(5);
        return { name: 'Alice', age: 30 };
      },
      select: (data) => data.name,
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  expect(document.body.textContent).toBe('Alice');
});

test('useSuspenseQuery - no isPlaceholderData property on result', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-no-placeholder'],
      queryFn: async () => {
        await sleep(5);
        return 'data';
      },
    });

    const result = query();
    expect('isPlaceholderData' in result).toBe(false);

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  expect(document.body.textContent).toBe('data');
});

test('useSuspenseQuery - staleTime and gcTime are clamped to minimum 1000ms', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-clamp'],
      queryFn: async () => {
        await sleep(5);
        return 'clamped';
      },
      staleTime: 0,
      gcTime: 0,
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-clamp'] })!;
  expect(internalQuery.resolvedOptions.staleTime).toBeGreaterThanOrEqual(1000);
  expect(internalQuery.resolvedOptions.gcTime).toBeGreaterThanOrEqual(1000);
});

test('useSuspenseQuery - staleTime 0 should not mark query stale immediately (clamped to 1000)', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-not-stale'],
      queryFn: async () => {
        await sleep(5);
        return 'fresh';
      },
      staleTime: 0,
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-not-stale'] })!;
  expect(internalQuery.state.isStale()).toBe(false);
});

test('useSuspenseQuery - preserves default gcTime when not provided', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-default-gc'],
      queryFn: async () => {
        await sleep(5);
        return 'data';
      },
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-default-gc'] })!;
  expect(internalQuery.resolvedOptions.gcTime).toBe(5 * 60 * 1000);
});

test('useSuspenseQuery - wraps function staleTime to clamp return value', async () => {
  const queryClient = createQueryClient();
  const staleTimeFn = vi.fn(() => 0);

  function Suspendable() {
    const query = useSuspenseQuery({
      queryKey: ['suspend-fn-stale'],
      queryFn: async () => {
        await sleep(5);
        return 'data';
      },
      staleTime: staleTimeFn,
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Loading...</p>}>
        <Suspendable />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  expect(staleTimeFn).toHaveBeenCalled();

  const internalQuery = queryClient.getQueryCache().find({ queryKey: ['suspend-fn-stale'] })!;
  const resolvedStaleTime = internalQuery.resolvedOptions.staleTime;
  expect(typeof resolvedStaleTime).toBe('function');

  const result = (resolvedStaleTime as (q: any) => any)(internalQuery);
  expect(result).toBeGreaterThanOrEqual(1000);
});
