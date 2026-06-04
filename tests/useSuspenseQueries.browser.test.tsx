import { expect, test } from 'vite-plus/test';
import { flush, render, sleep } from './utils';
import { waitFor } from '@testing-library/dom';
import { ErrorBoundary, Suspense } from 'voby';
import { createQueryClient } from '../src';
import { useSuspenseQueries } from '../src/useSuspenseQueries';
import { QueryClientProvider } from '../src/context';

function fetchOk(delay = 5, value = 'ok'): Promise<string> {
  return new Promise((r) => setTimeout(() => r(value), delay));
}

function fetchFail(delay = 5, msg = 'fail'): Promise<string> {
  return new Promise((_, r) => setTimeout(() => r(new Error(msg)), delay));
}

test('useSuspenseQueries suspends when no data, renders after all resolve', async () => {
  const queryClient = createQueryClient();
  let fetchCountA = 0;
  let fetchCountB = 0;

  function Suspendable() {
    const queries = useSuspenseQueries({
      queries: [
        {
          queryKey: ['susp-both-a'],
          queryFn: async () => {
            fetchCountA++;
            return fetchOk(5, 'data-a');
          },
        },
        {
          queryKey: ['susp-both-b'],
          queryFn: async () => {
            fetchCountB++;
            return fetchOk(10, 'data-b');
          },
        },
      ],
    });

    return (
      <div>
        {() => {
          const qs = queries();
          return `${qs[0].data() as string} | ${qs[1].data() as string}`;
        }}
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

  expect(document.body.textContent).toBe('Loading...');

  await sleep(30);

  expect(document.body.textContent).toBe('data-a | data-b');
  expect(fetchCountA).toBe(1);
  expect(fetchCountB).toBe(1);
});

test('useSuspenseQueries uses cached data without suspending', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['susp-cached-a'],
    queryFn: async () => 'cached-a',
  });
  await queryClient.fetchQuery({
    queryKey: ['susp-cached-b'],
    queryFn: async () => 'cached-b',
  });

  function Suspendable() {
    const queries = useSuspenseQueries({
      queries: [
        {
          queryKey: ['susp-cached-a'],
          queryFn: async () => {
            throw new Error('should not call');
          },
          staleTime: 60_000,
          refetchOnMount: false,
        },
        {
          queryKey: ['susp-cached-b'],
          queryFn: async () => {
            throw new Error('should not call');
          },
          staleTime: 60_000,
          refetchOnMount: false,
        },
      ],
    });

    return <div>{() => `${queries()[0].data() as string} | ${queries()[1].data() as string}`}</div>;
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

  expect(document.body.textContent).toBe('cached-a | cached-b');
});

test('useSuspenseQueries error thrown on fetch failure', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const queries = useSuspenseQueries({
      queries: [
        {
          queryKey: ['susp-err-a'],
          queryFn: async () => {
            await sleep(5);
            return 'ok-a';
          },
          retry: false,
        },
        {
          queryKey: ['susp-err-b'],
          queryFn: async () => {
            await sleep(5);
            throw new Error('fetch failed b');
          },
          retry: false,
        },
      ],
    });

    return <div>{() => queries()[0].data() as string}</div>;
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
    expect(document.body.textContent).toContain('Caught: fetch failed b');
  });
});

test('useSuspenseQueries mixed cached and uncached queries', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['susp-mix-cached'],
    queryFn: async () => 'cached',
    staleTime: 60_000,
  });

  function Suspendable() {
    const queries = useSuspenseQueries({
      queries: [
        {
          queryKey: ['susp-mix-cached'],
          queryFn: async () => {
            throw new Error('should not call');
          },
          staleTime: 60_000,
          refetchOnMount: false,
        },
        {
          queryKey: ['susp-mix-fetch'],
          queryFn: async () => {
            await sleep(5);
            return 'fresh';
          },
        },
      ],
    });

    return <div>{() => `${queries()[0].data() as string} | ${queries()[1].data() as string}`}</div>;
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

  expect(document.body.textContent).toBe('cached | fresh');
});

test('useSuspenseQueries with combine works after suspension', async () => {
  const queryClient = createQueryClient();

  function Suspendable() {
    const combined = useSuspenseQueries({
      queries: [
        {
          queryKey: ['susp-combine-a'],
          queryFn: async () => {
            await sleep(5);
            return 10;
          },
        },
        {
          queryKey: ['susp-combine-b'],
          queryFn: async () => {
            await sleep(10);
            return 20;
          },
        },
      ],
      combine: (results) => ({
        total: results.reduce((sum, r) => sum + (r.data() as number), 0),
      }),
    });

    return <div>Total: {() => combined().total}</div>;
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

  await sleep(30);

  expect(document.body.textContent).toBe('Total: 30');
});
