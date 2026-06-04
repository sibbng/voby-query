import { expect, test } from 'vite-plus/test';
import { flush, render, sleep } from './utils';
import { $, Suspense } from 'voby';
import { createQueryClient, usePrefetchQuery, useSuspenseQuery } from '../src';
import { QueryClientProvider } from '../src/context';

test('usePrefetchQuery populates the cache', async () => {
  const queryClient = createQueryClient();

  function PrefetchComponent() {
    usePrefetchQuery({
      queryKey: ['prefetch-test-1'],
      queryFn: async () => {
        await sleep(5);
        return 'prefetched';
      },
    });

    return <p>Prefetch done</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <PrefetchComponent />
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Prefetch done');

  await sleep(20);

  const data = queryClient.getQueryData<string>(['prefetch-test-1']);
  expect(data).toBe('prefetched');
});

test('usePrefetchQuery does not re-fetch when data is already cached', async () => {
  const queryClient = createQueryClient();

  await queryClient.fetchQuery({
    queryKey: ['prefetch-no-refetch'],
    queryFn: async () => 'existing',
  });

  let fetchCount = 0;

  function PrefetchComponent() {
    usePrefetchQuery({
      queryKey: ['prefetch-no-refetch'],
      queryFn: async () => {
        fetchCount++;
        await sleep(5);
        return 'new';
      },
    });

    return <p>Done</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <PrefetchComponent />
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  const data = queryClient.getQueryData<string>(['prefetch-no-refetch']);
  expect(data).toBe('existing');
  expect(fetchCount).toBe(0);
});

test('usePrefetchQuery before Suspense provides cached data on retry', async () => {
  const queryClient = createQueryClient();

  function PrefetchLayer() {
    usePrefetchQuery({
      queryKey: ['prefetch-suspense'],
      queryFn: async () => {
        await sleep(10);
        return 'prefetched data';
      },
    });

    return (
      <Suspense fallback={<p>Loading child...</p>}>
        <Child />
      </Suspense>
    );
  }

  function Child() {
    const query = useSuspenseQuery({
      queryKey: ['prefetch-suspense'],
      queryFn: async () => {
        await sleep(10);
        return 'should not fetch';
      },
    });

    return <p>{() => query().data()}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Suspense fallback={<p>Outer loading</p>}>
        <PrefetchLayer />
      </Suspense>
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Loading child...');

  await sleep(30);

  expect(document.body.textContent).toBe('prefetched data');
});

test('usePrefetchQuery re-fetches reactively when queryKey changes', async () => {
  const queryClient = createQueryClient();
  const id = $(1);
  const fetchLog: number[] = [];

  function PrefetchComponent() {
    usePrefetchQuery({
      queryKey: ['reactive-prefetch', id],
      queryFn: async () => {
        const currentId = id();
        fetchLog.push(currentId);
        await sleep(5);
        return `data-${currentId}`;
      },
    });

    return <p>{() => `id=${id()}`}</p>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <PrefetchComponent />
    </QueryClientProvider>,
    document.body,
  );

  await sleep(20);

  expect(queryClient.getQueryData(['reactive-prefetch', 1])).toBe('data-1');
  expect(fetchLog).toEqual([1]);

  id(2);
  await sleep(20);

  expect(queryClient.getQueryData(['reactive-prefetch', 2])).toBe('data-2');
  expect(fetchLog).toEqual([1, 2]);
});
