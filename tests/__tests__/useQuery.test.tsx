import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { createQueryClient, keepPreviousData, onlineManager, focusManager } from '../../src';
import { useQuery, CancelledError } from '../../src/useQuery';
import { QueryClientProvider } from '../../src/context';
import { $, ErrorBoundary, If, For, useEffect, tick } from 'voby';
import { render, sleep } from '../utils';

let keyCounter = 0;
const queryKey = () => [`test-key-${++keyCounter}`];

function snapshot(q: any) {
  const s = {
    data: q.data(),
    dataUpdatedAt: q.dataUpdatedAt?.() ?? 0,
    error: q.error(),
    errorUpdatedAt: q.errorUpdatedAt?.() ?? 0,
    errorUpdateCount: q.errorUpdateCount?.() ?? 0,
    failureCount: q.failureCount?.() ?? 0,
    failureReason: q.failureReason?.() ?? null,
    fetchStatus: q.fetchStatus(),
    isError: q.isError(),
    isFetched: q.isFetched(),
    isFetchedAfterMount: q.isFetchedAfterMount(),
    isFetching: q.isFetching(),
    isPaused: q.isPaused(),
    isPending: q.isPending(),
    isInitialLoading: q.isInitialLoading?.() ?? false,
    isLoading: q.isLoading(),
    isLoadingError: q.isLoadingError(),
    isPlaceholderData: q.isPlaceholderData(),
    isRefetchError: q.isRefetchError(),
    isRefetching: q.isRefetching(),
    isStale: q.isStale(),
    isSuccess: q.isSuccess(),
    status: q.status(),
    refetch: q.refetch,
  };
  return s;
}

// #region Basic states
describe('useQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    const mountedRoot = globalThis as typeof globalThis & { unmount?: () => void };
    mountedRoot.unmount?.();
    mountedRoot.unmount = undefined;
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  test('should allow to set default data value', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 'test'),
      });
      return <h1>{() => query().data() ?? 'default'}</h1>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('default');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('test');
  });

  test('should return the correct states for a successful query', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery<string, Error>({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 'test'),
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      if (q.isPending()) return <span>pending</span>;
      if (q.isLoadingError()) return <span>{q.error()?.message}</span>;
      return <span>{q.data()}</span>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);

    expect(states.length).toEqual(2);

    expect(states[0]).toMatchObject({
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isPaused: false,
      isPending: true,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      status: 'pending',
      fetchStatus: 'fetching',
      refetch: expect.any(Function),
    });

    expect(states[1]).toMatchObject({
      data: 'test',
      error: null,
      failureCount: 0,
      failureReason: null,
      isError: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isPaused: false,
      isPending: false,
      isLoading: false,
      isLoadingError: false,
      isPlaceholderData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: true,
      status: 'success',
      fetchStatus: 'idle',
      refetch: expect.any(Function),
    });
  });

  test('should return the correct states for an unsuccessful query', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    const states: Array<any> = [];
    let index = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          await sleep(10);
          throw new Error(`rejected #${++index}`);
        },
        retry: 1,
        retryDelay: 1,
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return (
        <div>
          <h1>Status: {() => q.status()}</h1>
          <div>Failure Count: {() => q.failureCount?.() ?? 'N/A'}</div>
          <div>Failure Reason: {() => q.failureReason?.()?.message}</div>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(21);
    expect(document.body.textContent).toContain('Status: error');

    expect(states[0]).toMatchObject({
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isFetching: true,
      isPending: true,
      status: 'pending',
      fetchStatus: 'fetching',
    });

    expect(states[1]).toMatchObject({
      data: undefined,
      error: expect.any(Error),
      failureCount: 1,
      failureReason: expect.any(Error),
      isFetching: true,
      isPending: true,
      status: 'pending',
      fetchStatus: 'fetching',
    });

    expect(states[2]).toMatchObject({
      data: undefined,
      error: expect.any(Error),
      failureCount: 2,
      failureReason: expect.any(Error),
      isFetching: false,
      isPending: false,
      isLoadingError: true,
      isPlaceholderData: false,
      isRefetchError: false,
      isStale: true,
      isSuccess: false,
      status: 'error',
      fetchStatus: 'idle',
    });
  });

  test('should set isFetchedAfterMount to true after a query has been fetched', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    await queryClient.prefetchQuery({ queryKey: key, queryFn: () => 'prefetched' });

    function Page() {
      const query = useQuery({ queryKey: key, queryFn: () => 'new data' });
      return (
        <>
          <div>data: {() => query().data() as unknown as string}</div>
          <div>isFetched: {() => (query().isFetched() ? 'true' : 'false')}</div>
          <div>isFetchedAfterMount: {() => (query().isFetchedAfterMount() ? 'true' : 'false')}</div>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('data: prefetched');
    expect(document.body.textContent).toContain('isFetched: true');
    expect(document.body.textContent).toContain('isFetchedAfterMount: false');

    await vi.advanceTimersByTimeAsync(0);

    expect(document.body.textContent).toContain('data: new data');
    expect(document.body.textContent).toContain('isFetched: true');
    expect(document.body.textContent).toContain('isFetchedAfterMount: true');
  });

  test('should be able to watch a query without providing a query function', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    queryClient.setQueryDefaults(key, { queryFn: () => 'data' });

    function Page() {
      const query = useQuery<string>({ queryKey: key });
      const q = query();
      states.push(snapshot(q));
      useEffect(() => {
        states.push(snapshot(q));
      });
      return null;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(states.length).toBe(2);
    expect(states[0]).toMatchObject({ data: undefined });
    expect(states[1]).toMatchObject({ data: 'data' });
  });

  test('should fetch when refetchOnMount is false and nothing has been fetched yet', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => 'test',
        refetchOnMount: false,
      });
      const q = query();
      states.push(snapshot(q));
      useEffect(() => {
        states.push(snapshot(q));
      });
      return null;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(states.length).toBe(2);
    expect(states[0]).toMatchObject({ data: undefined });
    expect(states[1]).toMatchObject({ data: 'test' });
  });

  test('should not fetch when refetchOnMount is false and data has been fetched already', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    queryClient.setQueryData(key, 'prefetched');

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => 'test',
        refetchOnMount: false,
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return null;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(states.length).toBe(1);
    expect(states[0]).toMatchObject({ data: 'prefetched' });
  });

  // #endregion

  // #region select / placeholderData / initialData

  test('should be able to select a part of the data with select', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => ({ name: 'test' })),
        select: (data: any) => data.name,
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return <div>{() => q.data()}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('test');

    expect(states.length).toBe(2);
    expect(states[0]).toMatchObject({ data: undefined });
    expect(states[1]).toMatchObject({ data: 'test' });
  });

  test('should use placeholderData when the query is in pending status', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 'data'),
        placeholderData: 'placeholder',
        staleTime: Infinity,
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return <div>{() => q.data() as string}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('placeholder');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('data');
  });

  test('should keep the previous data when placeholderData is set', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery<number>({
        queryKey: [key, count],
        queryFn: () => sleep(10).then(() => count()),
        placeholderData: keepPreviousData,
      });
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <span>data: {() => query().data() ?? 'undefined'}</span>
          <span>isPaused: {() => String(query().isPaused())}</span>
          <button onClick={() => count(count() + 1)}>increment</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 0');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');

    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isPlaceholderData: false,
    });
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPlaceholderData: true,
    });
    expect(states[3]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
  });

  test('placeholder data should run through select', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 1),
        placeholderData: 23,
        select: (data: any) => String(data * 2),
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return (
        <div>
          <span>Data: {() => q.data() ?? 'undefined'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    // Before fetch completes: placeholder data '46' (23 * 2) through select
    expect(document.body.textContent).toContain('Data: 46');

    await vi.advanceTimersByTimeAsync(11);

    // After fetch: real data '2' (1 * 2) through select
    expect(document.body.textContent).toContain('Data: 2');

    expect(states).toMatchObject([
      {
        isSuccess: true,
        isPlaceholderData: true,
        data: '46',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: '2',
      },
    ]);
  });

  test('should transition to error state when placeholderData is set', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery<number, Error>({
        queryKey: [key, count],
        queryFn: async () => {
          await sleep(10);
          if (count() === 2) {
            throw new Error('Error test');
          }
          return Promise.resolve(count());
        },
        retry: false,
        placeholderData: keepPreviousData,
      });
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <span>data: {() => query().data() ?? 'undefined'}</span>
          <span>error: {() => query().error()?.message ?? ''}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    // Fetch count=0
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 0');

    // Key change to count=1
    count(1);
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');

    // Key change to count=2 — will error
    count(2);
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('error: Error test');

    expect(states.length).toBe(6);

    // Initial
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      status: 'pending',
      error: null,
      isPlaceholderData: false,
    });
    // Fetched (count=0)
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      status: 'success',
      error: null,
      isPlaceholderData: false,
    });
    // Key change to count=1 (placeholder)
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      status: 'success',
      error: null,
      isPlaceholderData: true,
    });
    // Fetched (count=1)
    expect(states[3]).toMatchObject({
      data: 1,
      isFetching: false,
      status: 'success',
      error: null,
      isPlaceholderData: false,
    });
    // Key change to count=2 (placeholder)
    expect(states[4]).toMatchObject({
      data: 1,
      isFetching: true,
      status: 'success',
      error: null,
      isPlaceholderData: true,
    });
    // Error
    expect(states[5]).toMatchObject({
      data: undefined,
      isFetching: false,
      status: 'error',
      isPlaceholderData: false,
    });
    expect(states[5]!.error).toHaveProperty('message', 'Error test');
  });

  test('placeholder data function result should run through select', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    let placeholderFunctionRunCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 1),
        placeholderData: () => {
          placeholderFunctionRunCount++;
          return 23;
        },
        select: (data: any) => String(data * 2),
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return (
        <div>
          <span>Data: {() => q.data() ?? 'undefined'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    // Before fetch: placeholder function returns 23, select transforms to '46'
    expect(document.body.textContent).toContain('Data: 46');

    await vi.advanceTimersByTimeAsync(11);

    // After fetch: real data 1, select transforms to '2'
    expect(document.body.textContent).toContain('Data: 2');

    expect(states).toMatchObject([
      {
        isSuccess: true,
        isPlaceholderData: true,
        data: '46',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: '2',
      },
    ]);

    // The placeholder function should only be called once
    expect(placeholderFunctionRunCount).toEqual(1);
  });

  test('should keep the previous data on disabled query when placeholderData is set', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery<number>({
        queryKey: [key, count],
        queryFn: () => sleep(10).then(() => count()),
        enabled: false,
        placeholderData: keepPreviousData,
      });
      states.push(snapshot(query()));
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <span>data: {() => query().data() ?? 'undefined'}</span>
          <button onClick={() => query().refetch()}>refetch</button>
          <button onClick={() => count(count() + 1)}>setCount</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    // Disabled query: no initial fetch
    expect(document.body.textContent).toContain('data: undefined');

    // Trigger manual refetch
    document
      .querySelectorAll('button')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 0');

    // Change key while disabled
    document
      .querySelectorAll('button')[1]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toContain('data: 0'); // placeholder

    // Trigger refetch for new key
    document
      .querySelectorAll('button')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');

    // Disabled query (no fetch triggered)
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isPlaceholderData: false,
    });
    // Manual refetch started
    expect(states[1]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isPlaceholderData: false,
    });
    // Fetched (count=0)
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
    // Key changed while disabled (placeholder)
    expect(states[3]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: true,
    });
    // Manual refetch for new key started
    expect(states[4]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPlaceholderData: true,
    });
    // Fetched (count=1)
    expect(states[5]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
  });

  test('should handle initialData', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => sleep(10).then(() => 'data'),
        initialData: 'initial',
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return <div>{() => q.data()}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('initial');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('data');
  });

  test('initialData should set the query to success status and refetch should preserve data', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          await sleep(10);
          return 'data' + fetchCount;
        },
        initialData: 'initial',
      });
      const q = query();
      useEffect(() => {
        states.push(snapshot(q));
      });
      return (
        <div>
          <span>data: {() => q.data() as unknown as string}</span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: key })}>refetch</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('data: initial');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: data1');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: data2');

    expect(states[0]).toMatchObject({
      data: 'initial',
      isFetching: true,
      isSuccess: true,
      isStale: true,
    });
    expect(states[1]).toMatchObject({
      data: 'data1',
      isFetching: false,
      isSuccess: true,
      isStale: true,
    });
    expect(states[2]).toMatchObject({
      data: 'data1',
      isFetching: true,
      isSuccess: true,
      isStale: true,
    });
    expect(states[3]).toMatchObject({
      data: 'data2',
      isFetching: false,
      isSuccess: true,
      isStale: true,
    });
  });

  test('should keep the previous data when placeholderData is set and select fn transform is used', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery<{ count: number }, Error, number>({
        queryKey: [key, count],
        queryFn: () => sleep(10).then(() => ({ count: count() })),
        select: (data) => data.count,
        placeholderData: keepPreviousData,
      });
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <span>data: {() => String(query().data())}</span>
          <button onClick={() => count(1)}>setCount</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 0');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');

    // Initial
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isPlaceholderData: false,
    });
    // Fetched
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
    // Set state
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPlaceholderData: true,
    });
    // New data
    expect(states[3]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
  });

  test('should not show initial data from next query if placeholderData is set', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery({
        queryKey: [key, count],
        queryFn: () => sleep(10).then(() => count()),
        initialData: 99,
        placeholderData: keepPreviousData,
      });
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <span>
            data: {() => String(query().data())}, count: {() => String(count())}, isFetching:{' '}
            {() => String(query().isFetching())}
          </span>
          <button onClick={() => count(1)}>inc</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 0, count: 0, isFetching: false');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).toContain('data: 1, count: 1, isFetching: false');

    expect(states.length).toBe(4);

    // Initial
    expect(states[0]).toMatchObject({
      data: 99,
      isFetching: true,
      isSuccess: true,
      isPlaceholderData: false,
    });
    // Fetched
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
    // Set state
    expect(states[2]).toMatchObject({
      data: 99,
      isFetching: true,
      isSuccess: true,
      isPlaceholderData: false,
    });
    // New data
    expect(states[3]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPlaceholderData: false,
    });
  });

  test('select should only run when dependencies change if memoized', async () => {
    const queryClient = createQueryClient();
    const key1 = queryKey();
    let selectRun = 0;
    const count = $(2);

    function Page() {
      const query = useQuery({
        queryKey: key1,
        queryFn: () => sleep(10).then(() => 0),
        select: (data: number) => {
          selectRun++;
          return `selected ${data + count()}`;
        },
        placeholderData: 99,
      });
      return (
        <div>
          <h2>Data: {() => query().data() as unknown as string}</h2>
          <button onClick={() => count(count() + 1)}>inc: {() => String(count())}</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Data: selected 101');
    expect(selectRun).toBe(1);

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: selected 2');
    expect(selectRun).toBe(2);

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: selected 3');
    expect(selectRun).toBe(3);
  });

  test('select should always return the correct state', async () => {
    const queryClient = createQueryClient();
    const key1 = queryKey();
    const count = $(2);
    const forceValue = $(1);

    function Page() {
      const query = useQuery({
        queryKey: key1,
        queryFn: () => sleep(10).then(() => 0),
        select: (data: number) => {
          return `selected ${data + count()}`;
        },
        placeholderData: 99,
      });
      return (
        <div>
          <h2>Data: {() => query().data() as unknown as string}</h2>
          <h2>forceValue: {() => String(forceValue())}</h2>
          <button onClick={() => count(count() + 1)}>inc: {() => String(count())}</button>
          <button onClick={() => forceValue(forceValue() + 1)}>forceUpdate</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Data: selected 101');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: selected 2');

    document
      .querySelectorAll('button')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: selected 3');

    document
      .querySelectorAll('button')[1]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('forceValue: 2');
    // data should still be 3 after an independent re-render
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: selected 3');
  });

  test('select should structurally share data', async () => {
    const queryClient = createQueryClient();
    const key1 = queryKey();
    const states: Array<any> = [];
    const forceValue = $(1);

    function Page() {
      const query = useQuery({
        queryKey: key1,
        queryFn: () => sleep(10).then(() => [1, 2]),
        select: (res: number[]) => res.map((x) => x + 1),
      });
      useEffect(() => {
        const d = query().data();
        if (d !== undefined && d !== null) {
          states.push(d);
        }
      });
      return (
        <div>
          <h2>Data: {() => JSON.stringify(query().data())}</h2>
          <h2>forceValue: {() => String(forceValue())}</h2>
          <button onClick={() => forceValue(forceValue() + 1)}>forceUpdate</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: [2,3]');
    expect(states).toHaveLength(1);

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('forceValue: 2');
    expect(document.body.textContent).toContain('Data: [2,3]');

    // effect should not be triggered again due to structural sharing
    expect(states).toHaveLength(1);
  });

  // #endregion

  // #region enabled

  test('should start with status pending, fetchStatus idle if enabled is false', async () => {
    const queryClient = createQueryClient();
    const key1 = queryKey();
    const key2 = queryKey();

    function Page() {
      const first = useQuery({
        queryKey: key1,
        queryFn: () => sleep(10).then(() => 'data'),
        enabled: false,
      });
      const second = useQuery({ queryKey: key2, queryFn: () => sleep(10).then(() => 'data') });
      return (
        <div>
          <span>
            First Status: {() => first().status()}, {() => first().fetchStatus()}
          </span>
          <span>
            Second Status: {() => second().status()}, {() => second().fetchStatus()}
          </span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('First Status: pending, idle');
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('Second Status: pending, fetching');
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Second Status: success, idle');
  });

  test('should wait for the query to become enabled before fetching', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const enabled = $(false);
    let currentQuery: any;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => 'data',
        enabled,
      });
      const q = query();
      currentQuery = query;
      states.push(snapshot(q));
      return (
        <div>
          <div>data: {() => query().data() as string}</div>
          <button onClick={() => enabled(true)}>enabled: {() => enabled().toString()}</button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(states[0]).toMatchObject({
      isFetching: false,
      isSuccess: false,
      isPending: true,
      data: undefined,
    });

    document.querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toContain('data: data');
    states.push(snapshot(currentQuery()));
    expect(states.length).toBe(2);
    expect(states[1]).toMatchObject({
      isFetching: false,
      isSuccess: true,
      data: 'data',
    });
  });

  test('should not fetch when switching to a disabled query', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    const count = $(0);

    function Page() {
      const query = useQuery({
        queryKey: [key, count],
        queryFn: () => sleep(5).then(() => count()),
        enabled: () => count() === 0,
      });
      useEffect(() => {
        const q = query();
        states.push(snapshot(q));
      });
      return (
        <div>
          <button onClick={() => count(1)}>increment</button>
          <div>data: {() => query().data() ?? 'undefined'}</div>
          <div>count: {() => count()}</div>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('data: 0');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('count: 1');
    expect(document.body.textContent).toContain('data: undefined');

    expect(states.length).toBe(3);
    expect(states[0]).toMatchObject({ data: undefined, isFetching: true, isSuccess: false });
    expect(states[1]).toMatchObject({ data: 0, isFetching: false, isSuccess: true });
    expect(states[2]).toMatchObject({ data: undefined, isFetching: false, isSuccess: false });
  });

  test('should not update disabled query when refetching with refetchQueries', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    let count = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          await sleep(10);
          count++;
          return count;
        },
        enabled: false,
      });

      useEffect(() => {
        states.push(snapshot(query()));
      });
      return null;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);

    queryClient.refetchQueries({ queryKey: key });
    await vi.advanceTimersByTimeAsync(0);

    expect(states.length).toBe(1);
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isStale: false,
    });
  });

  test('should refetch when changed enabled to true in error state', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const queryFn = vi.fn<(...args: Array<unknown>) => unknown>();
    queryFn.mockImplementation(() =>
      sleep(10).then(() => Promise.reject(new Error('Suspense Error Bingo'))),
    );

    function Page() {
      const enabled = $(true);
      const query = useQuery({
        queryKey: key,
        queryFn,
        enabled: enabled,
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      });
      return (
        <div>
          <span>
            {() => {
              if (query().isPending()) return 'status: pending';
              if (query().isError()) return 'error';
              return 'rendered';
            }}
          </span>
          <button aria-label="retry" onClick={() => enabled(!enabled())}>
            retry {() => String(enabled())}
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    // initial state check
    expect(document.body.textContent).toContain('status: pending');

    // render error state component
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('error');
    expect(queryFn).toBeCalledTimes(1);

    // change to enabled to false
    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('error');
    expect(queryFn).toBeCalledTimes(1);

    // change to enabled to true
    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('error');
    expect(queryFn).toBeCalledTimes(2);
  });

  // #endregion

  // #region staleTime

  test('should handle staleTime', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        staleTime: 1000,
      });
      return <div>{() => query().data() as unknown as string}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data1');
    expect(fetchCount).toBe(1);
  });

  test('should update query state and refetch when invalidated with invalidateQueries', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let count = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          await sleep(10);
          count++;
          return count;
        },
        staleTime: Infinity,
      });
      return (
        <div>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: key })}>
            invalidate
          </button>
          <div>data: {() => query().data() as unknown as string}</div>
          <div>isStale: {() => String(query().isStale())}</div>
          <div>isFetching: {() => String(query().isFetching())}</div>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');
    expect(document.body.textContent).toContain('isStale: false');
    expect(document.body.textContent).toContain('isFetching: false');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: 1');
    expect(document.body.textContent).toContain('isStale: true');
    expect(document.body.textContent).toContain('isFetching: true');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 2');
    expect(document.body.textContent).toContain('isStale: false');
    expect(document.body.textContent).toContain('isFetching: false');
  });

  // #endregion

  // #region gcTime

  test('should handle gcTime', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => 'data',
        gcTime: 0,
      });
      return <div>{() => query().data() as unknown as string}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data');
  });

  // #endregion

  // #region retry

  test('should handle retry option', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          throw new Error('error');
        },
        retry: 2,
        retryDelay: 1,
      });
      return (
        <div>
          <span>status: {() => query().status()}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(4);
    expect(fetchCount).toBe(3);
    expect(document.body.textContent).toContain('error');
  });

  // #endregion

  // #region refetchOnMount / refetchOnReconnect / refetchOnWindowFocus

  test('should handle refetchOnReconnect when the network comes back online', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    await queryClient.prefetchQuery({ queryKey: key, queryFn: () => 'prefetched' });

    onlineManager.setOnline(false);

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        refetchOnReconnect: true,
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: prefetched');
    expect(fetchCount).toBe(0);

    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: data1');
    expect(fetchCount).toBe(1);

    onlineManager.setOnline(true);
  });

  test('should handle refetchOnWindowFocus', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    await queryClient.prefetchQuery({ queryKey: key, queryFn: () => 'prefetched' });

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        refetchOnMount: false,
        retryOnMount: false,
        refetchOnWindowFocus: true,
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: prefetched');
    expect(fetchCount).toBe(0);

    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: data1');
    expect(fetchCount).toBe(1);
  });

  test('should not refetch on window focus when the query is disabled', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        enabled: false,
        refetchOnWindowFocus: true,
      });
      return (
        <div>
          <span>data: {() => String(query().data())}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);

    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toBe(0);
  });

  test('should not refetch on window focus when refetchOnWindowFocus is false', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    await queryClient.prefetchQuery({ queryKey: key, queryFn: () => 'prefetched' });

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);

    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toBe(0);
  });

  test('should refetch periodically with refetchInterval', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data' + fetchCount;
        },
        refetchInterval: 50,
      });
      return <div>{() => query().data() as unknown as string}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(51);
    expect(fetchCount).toBeGreaterThanOrEqual(2);
  });

  // #endregion

  // #region network mode

  test('should handle network mode: online (paused when offline)', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    onlineManager.setOnline(false);

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          await sleep(10);
          return 'data';
        },
      });
      return (
        <div>
          <span>data: {() => query().data() ?? 'undefined'}</span>
          <span>isPaused: {() => String(query().isPaused())}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: undefined');
    expect(document.body.textContent).toContain('isPaused: true');

    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: data');
    expect(document.body.textContent).toContain('isPaused: false');

    onlineManager.setOnline(true);
  });

  test('should handle network mode: always (fetch even when offline)', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    onlineManager.setOnline(false);

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data';
        },
        networkMode: 'always',
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <span>isPaused: {() => String(query().isPaused())}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('data: data');
    expect(document.body.textContent).toContain('isPaused: false');
    expect(fetchCount).toBe(1);

    onlineManager.setOnline(true);
  });

  // #endregion

  // #region throwOnError / CancelledError

  test('should throw an error when throwOnError is true', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error('test error');
        },
        throwOnError: true,
        retry: false,
      });
      return <div>{() => query().status()}</div>;
    }

    function ErrorFallback({ error }: { error: Error }) {
      return <p>Caught: {error.message}</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <ErrorBoundary
          fallback={(props: { error: Error }) => <ErrorFallback error={props.error} />}
        >
          <Page />
        </ErrorBoundary>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('Caught: test error');
  });

  test('should throw synchronously with throwOnError when query has cached error', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    const options = {
      queryKey: key,
      queryFn: async () => 'cached data',
      throwOnError: true,
      retry: false,
    } as const;

    await queryClient.fetchQuery(options);
    const query = queryClient.getQueryCache().find({ queryKey: key })!;
    query.state.error(new Error('cached error'));
    query.state.status('error');

    function Page() {
      const query = useQuery({
        ...options,
        queryFn: async () => 'fresh data',
      });
      return (
        <div>
          {() => {
            return query().status();
          }}
        </div>
      );
    }

    function ErrorFallback({ error }: { error: Error }) {
      return <p>Caught: {error.message}</p>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <ErrorBoundary
          fallback={(props: { error: Error }) => <ErrorFallback error={props.error} />}
        >
          <Page />
        </ErrorBoundary>
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('Caught: cached error');
  });

  test('should handle CancelledError when a query is cancelled', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          await sleep(100);
          if (signal.aborted) {
            throw new CancelledError();
          }
          return 'data';
        },
      });
      return (
        <div>
          <span>status: {() => query().status()}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('status: pending');

    queryClient.removeQueries({ queryKey: key });
    await vi.advanceTimersByTimeAsync(100);
    expect(document.body.textContent).toContain('status: error');
  });

  // #endregion

  // #region refetch behavior

  test('should refetch when enabled false and refetch is called directly', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          return 'data';
        },
        enabled: false,
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <button
            onClick={() => {
              query().refetch();
            }}
          >
            refetch
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchCount).toBe(1);
  });

  test('should not cancel an ongoing fetch when refetch is called with cancelRefetch=false if we have data already', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          await sleep(20);
          return 'data';
        },
        enabled: false,
        initialData: 'initialData',
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <button
            onClick={() => {
              query().refetch();
              query().refetch({ cancelRefetch: false } as any);
            }}
          >
            refetch
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(fetchCount).toBe(1);
  });

  test('should cancel an ongoing fetch when refetch is called (cancelRefetch=true) if we have data already', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          await sleep(20);
          return 'data';
        },
        enabled: false,
        initialData: 'initialData',
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <button
            onClick={() => {
              query().refetch();
              query().refetch();
            }}
          >
            refetch
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(fetchCount).toBe(2);
  });

  test('should not cancel an ongoing fetch when refetch is called (cancelRefetch=true) if we do not have data yet', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    let fetchCount = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          fetchCount++;
          await sleep(20);
          return 'data';
        },
        enabled: false,
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <button
            onClick={() => {
              query().refetch();
              query().refetch();
            }}
          >
            refetch
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(11);
    expect(fetchCount).toBe(1);
  });

  test('should update query state and refetch when reset with resetQueries', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const states: Array<any> = [];
    let count = 0;

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          await sleep(10);
          count++;
          return count;
        },
        staleTime: Infinity,
      });
      useEffect(() => {
        states.push(snapshot(query()));
      });
      return (
        <div>
          <button onClick={() => queryClient.resetQueries({ queryKey: key })}>reset</button>
          <span>data: {() => String(query().data() ?? 'null')}</span>
          <span>isFetching: {() => String(query().isFetching())}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('data: 1');
    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(11);
    expect(states.length).toBe(4);
    expect(document.body.textContent).toContain('data: 2');
    expect(count).toBe(2);

    expect(states[0]).toMatchObject({
      data: undefined,
      isPending: true,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    });
    expect(states[1]).toMatchObject({
      data: 1,
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isStale: false,
    });
    expect(states[2]).toMatchObject({
      data: undefined,
      isPending: true,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    });
    expect(states[3]).toMatchObject({
      data: 2,
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isStale: false,
    });
  });

  // #endregion

  // #region query key reactivity

  test('should create a new query when the query key changes', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();
    const index = $(1);

    function Page() {
      const query = useQuery({
        queryKey: [key, index],
        queryFn: () => 'data for ' + index(),
      });
      return (
        <div>
          <span>data: {() => query().data() as unknown as string}</span>
          <button
            onClick={() => {
              index(2);
            }}
          >
            change
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: data for 1');

    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('data: data for 2');
  });

  // #endregion

  // #region dependent queries

  test('should work with dependent queries', async () => {
    const queryClient = createQueryClient();
    const key1 = queryKey();
    const key2 = queryKey();

    function Page() {
      const query1 = useQuery({
        queryKey: key1,
        queryFn: () => 'first',
      });
      const query2 = useQuery({
        queryKey: [key2, query1().data()],
        queryFn: () => 'second:' + query1().data(),
        enabled: () => !!query1().data(),
      });
      return (
        <div>
          <span>q1: {() => query1().data() as unknown as string}</span>
          <span>q2: {() => query2().data() as unknown as string}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(document.body.textContent).toContain('q1: first');
    expect(document.body.textContent).toContain('q2: second:first');
  });

  // #endregion

  // #region For component

  test('should work with For component (list rendering)', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Item({ id }: { id: number }) {
      const query = useQuery({
        queryKey: [key, id],
        queryFn: () => 'item-' + id,
      });
      return <li>{() => query().data() as unknown as string}</li>;
    }

    function Page() {
      const items = $([1, 2, 3]);
      return (
        <ul>
          <For values={items}>{(id) => <Item id={id} />}</For>
        </ul>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toContain('item-1');
    expect(document.body.textContent).toContain('item-2');
    expect(document.body.textContent).toContain('item-3');
  });

  // #endregion

  // #region queryKeyHashFn

  test('should handle queryKeyHashFn option', async () => {
    const queryClient = createQueryClient();
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: () => 'data',
        queryKeyHashFn: (k: any) => JSON.stringify(k),
      });
      return <div>{() => query().data() as unknown as string}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('data');
  });

  // #endregion

  // #region structuralSharing (default)

  test('should handle structural sharing of query results', async () => {
    const queryClient = createQueryClient({
      defaultOptions: { queries: { structuralSharing: true } as any },
    });
    const key = queryKey();

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => {
          await new Promise((r) => setTimeout(r, 0));
          return { id: 1, name: 'test' };
        },
      });
      return <div>{() => query().data()?.name ?? ''}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.textContent).toBe('test');
  });
});
// #endregion
