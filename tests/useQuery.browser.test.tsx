import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { render, sleep } from './utils';
import { createQueryClient, keepPreviousData } from '../src';
import { useQuery } from '../src/useQuery';
import { QueryClientProvider } from '../src/context';
import { For, If, $, useMemo } from 'voby';

describe('useQuery.browser.test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('useQuery with provider', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const query = useQuery({
        queryKey: ['test'],
        queryFn: async () => {
          return 'test data';
        },
        staleTime: 0,
      });

      return (
        <>
          <If when={() => query().isLoading()}>Loading...</If>
          <If when={() => query().isError()}>Error</If>
          <If when={() => query().isSuccess()}>{() => query().data()}</If>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('Loading...');

    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toBe('test data');

    const cachedData = queryClient.getQueryData(['test']);
    expect(cachedData).toBe('test data');
  });

  test('useQuery staleTime behavior', async () => {
    const queryClient = createQueryClient();

    let fetchCount = 0;
    function TestComponent() {
      const query = useQuery({
        queryKey: ['stale-test'],
        queryFn: async () => {
          fetchCount++;
          return 'stale data';
        },
        staleTime: 50, // ms
      });

      return (
        <>
          <p>Data: {() => query().data()}</p>
          <p>Stale: {() => query().isStale().toString()}</p>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(1);
    // Check initial state: data is fetched, not stale
    expect(document.body.textContent).toContain('Data: stale data');
    expect(document.body.textContent).toContain('Stale: false');

    // Wait for staleTime to pass
    await vi.advanceTimersByTimeAsync(51);
    // Check state after staleTime: data is still there, but now stale
    expect(document.body.textContent).toContain('Data: stale data');
    expect(document.body.textContent).toContain('Stale: true');

    // Refetch and check state: data is updated (fetchCount increments), not stale
    const p = queryClient.refetchQueries({ queryKey: ['stale-test'] });
    await vi.advanceTimersByTimeAsync(10);
    await p;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain('Data: stale data'); // Data remains the same as mock fn returns same data
    expect(document.body.textContent).toContain('Stale: false');
    expect(fetchCount).toBe(2); // fetchFn was called again
  });

  test('useQuery enabled option: starts disabled, then enabled', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      return 'Data when enabled';
    });
    const enabled = $(false);

    function TestComponent() {
      const query = useQuery({
        queryKey: ['enabled-test-1'],
        queryFn: queryFnMock,
        enabled: enabled, // Controlled by reactive variable
      });
      return (
        <>
          <If when={() => query().isLoading() || (query().isIdle() && !query().data())}>
            Initial/Loading
          </If>
          <If when={() => query().isSuccess()}>{() => query().data()}</If>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('Initial/Loading');
    expect(queryFnMock).not.toHaveBeenCalled();

    enabled(true); // Enable the query
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('Data when enabled');
    expect(document.body.textContent).toBe('Data when enabled');
  });

  test('useQuery enabled option: starts enabled, then disabled', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'Data initially enabled';
    });
    const enabled = $(true);

    function TestComponent() {
      const query = useQuery({
        queryKey: ['enabled-test-2'],
        queryFn: queryFnMock,
        enabled: enabled,
        staleTime: 0,
      });
      return (
        <>
          <If when={() => query().isLoading()}>Loading...</If>
          <If when={() => query().isSuccess()}>{() => query().data()}</If>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(queryFnMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21);
    expect(document.body.textContent).toBe('Data initially enabled');

    enabled(false); // Disable the query
    await vi.advanceTimersByTimeAsync(1);

    queryFnMock.mockClear();

    const p = queryClient.invalidateQueries({ queryKey: ['enabled-test-2'] });
    await vi.advanceTimersByTimeAsync(1);
    await p;
    await vi.advanceTimersByTimeAsync(11);

    expect(queryFnMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toBe('Data initially enabled');
  });

  test('useQuery initialData option', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'Fetched data';
    });

    function TestComponent() {
      const query = useQuery({
        queryKey: ['initial-data-test'],
        queryFn: queryFnMock,
        initialData: 'Initial data value',
        staleTime: 10,
      });
      return (
        <>
          <div>Status: {() => query().status()}</div>
          <div>Data: {() => query().data()}</div>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Status: success');
    expect(document.body.textContent).toContain('Data: Initial data value');
    expect(queryFnMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(11);

    const p = queryClient.invalidateQueries({ queryKey: ['initial-data-test'] });
    await vi.advanceTimersByTimeAsync(21);
    await p;
    await vi.advanceTimersByTimeAsync(1);

    expect(queryFnMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('Fetched data');
    expect(document.body.textContent).toContain('Data: Fetched data');
  });

  test('useQuery placeholderData option', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'Actual fetched data';
    });

    function TestComponent() {
      const query = useQuery({
        queryKey: ['placeholder-data-test'],
        queryFn: queryFnMock,
        placeholderData: 'Placeholder value',
      });
      return (
        <>
          <div>Status: {() => query().status()}</div>
          <div>Data: {() => query().data()}</div>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Status: pending');
    expect(document.body.textContent).toContain('Data: Placeholder value');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(51);
    expect(document.body.textContent).toContain('Actual fetched data');
    expect(document.body.textContent).toContain('Status: success');
    expect(document.body.textContent).toContain('Data: Actual fetched data');
  });

  test('useQuery select option', async () => {
    const queryClient = createQueryClient();
    const originalData = { id: 1, name: 'Original Name', value: 100 };
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return originalData;
    });

    function TestComponent() {
      const query = useQuery({
        queryKey: ['select-test'],
        queryFn: queryFnMock,
        select: (data) => data.name,
      });
      return (
        <>
          <div>Data: {() => query().data()}</div>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(21);
    expect(document.body.textContent).toBe('Data: Original Name');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    const cachedData = queryClient.getQueryData(['select-test']);
    expect(cachedData).toEqual(originalData);
  });

  test('useQuery gcTime (garbage collection with component unmount)', async () => {
    const queryClient = createQueryClient({
      defaultOptions: {
        queries: {
          gcTime: 50,
        },
      },
    });
    const queryKey = ['gc-test'];
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'GC Test Data';
    });
    const showComponent = $(true);

    function TestComponent() {
      const query = useQuery({
        queryKey: queryKey,
        queryFn: queryFnMock,
      });
      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    function App() {
      return (
        <QueryClientProvider value={queryClient}>
          <If when={showComponent}>
            <TestComponent />
          </If>
        </QueryClientProvider>
      );
    }

    render(<App />, document.body);

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toBe('GC Test Data');
    expect(queryFnMock).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKey)).toBe('GC Test Data');

    showComponent(false);
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(51);

    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });

  test('useQuery refetchOnWindowFocus: true (default)', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `Data fetched at ${Date.now()}`;
    });

    function TestComponent() {
      const query = useQuery({
        queryKey: ['refetch-focus-true'],
        queryFn: queryFnMock,
        staleTime: 20,
        refetchOnWindowFocus: true,
      });
      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data fetched at');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(21);

    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1);
    if (originalVisibility) {
      Object.defineProperty(document, 'visibilityState', originalVisibility);
    }

    await vi.advanceTimersByTimeAsync(51);

    expect(queryFnMock).toHaveBeenCalledTimes(2);
  });

  test('useQuery refetchOnWindowFocus: false', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `Data fetched at ${Date.now()}`;
    });

    function TestComponent() {
      const query = useQuery({
        queryKey: ['refetch-focus-false'],
        queryFn: queryFnMock,
        staleTime: 20,
        refetchOnWindowFocus: false,
      });
      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data fetched at');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(21);

    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(1);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(51);

    expect(queryFnMock).toHaveBeenCalledTimes(1);
  });

  test(
    'useQuery refetchOnWindowFocus cancels the active request when cancelRefetch is true',
    { retry: 3 },
    async () => {
      const queryClient = createQueryClient();
      let fetchCount = 0;
      const abortedSignals: AbortSignal[] = [];
      const resolveFetches = new Map<number, (value: string) => void>();
      let refetch: () => Promise<void> = async () => {};

      function TestComponent() {
        const query = useQuery({
          queryKey: ['refetch-focus-cancel-refetch'],
          queryFn: async ({ signal }) => {
            fetchCount++;
            const requestId = fetchCount;

            signal.addEventListener(
              'abort',
              () => {
                abortedSignals.push(signal);
              },
              { once: true },
            );

            return new Promise<string>((resolve, reject) => {
              const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Aborted', 'AbortError'));
              };

              signal.addEventListener('abort', onAbort, { once: true });
              resolveFetches.set(requestId, (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
              });
            });
          },
          staleTime: 0,
          cancelRefetch: true,
          refetchOnWindowFocus: true,
        });

        refetch = () => query().refetch();

        return <div>{() => query().data() ?? 'Loading...'}</div>;
      }

      render(
        <QueryClientProvider value={queryClient}>
          <TestComponent />
        </QueryClientProvider>,
        document.body,
      );

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchCount).toBe(1);

      resolveFetches.get(1)?.('Initial value');
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.textContent).toBe('Initial value');

      const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });

      const refetchPromise = refetch();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchCount).toBe(2);

      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1);

      if (originalVisibility) {
        Object.defineProperty(document, 'visibilityState', originalVisibility);
      }

      expect(fetchCount).toBe(3);
      expect(abortedSignals).toHaveLength(1);
      expect(abortedSignals[0]?.aborted).toBe(true);

      resolveFetches.get(2)?.('Stale value');
      await vi.advanceTimersByTimeAsync(1);
      expect(document.body.textContent).toBe('Initial value');

      resolveFetches.get(3)?.('Focused value');
      await refetchPromise;
      await vi.advanceTimersByTimeAsync(10);
      expect(document.body.textContent).toBe('Focused value');
    },
  );

  test('useQuery refetchInterval: data refetches periodically', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `Interval data ${Date.now()}`;
    });
    const intervalMs = 100;
    const showComponent = $(true);

    function TestComponent() {
      const query = useQuery({
        queryKey: ['refetch-interval-test'],
        queryFn: queryFnMock,
        refetchInterval: intervalMs,
      });
      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    function App() {
      return (
        <QueryClientProvider value={queryClient}>
          <If when={showComponent}>
            <TestComponent />
          </If>
        </QueryClientProvider>
      );
    }

    render(<App />, document.body);

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Interval data');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(351);
    expect(queryFnMock.mock.calls.length).toBeGreaterThanOrEqual(4);

    showComponent(false);
    await vi.advanceTimersByTimeAsync(1);
  });

  test('useQuery refetchInterval: stops if component unmounts', async () => {
    const queryClient = createQueryClient();
    const queryFnMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `Interval unmount data ${Date.now()}`;
    });
    const intervalMs = 50;
    const showComponent = $(true);

    function TestComponent() {
      const query = useQuery({
        queryKey: ['refetch-interval-unmount-test'],
        queryFn: queryFnMock,
        refetchInterval: intervalMs,
      });
      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    function App() {
      return (
        <QueryClientProvider value={queryClient}>
          <If when={showComponent}>
            <TestComponent />
          </If>
        </QueryClientProvider>
      );
    }

    render(<App />, document.body);

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Interval unmount data');
    expect(queryFnMock).toHaveBeenCalledTimes(1);

    showComponent(false);
    await vi.advanceTimersByTimeAsync(1);
    queryFnMock.mockClear();

    await vi.advanceTimersByTimeAsync(51);

    expect(queryFnMock).not.toHaveBeenCalled();
  });

  test('gcTime cache: remount within and after gcTime', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;
    const queryKey = ['gc-test'];
    const gcTime = 1000;

    function TestComponent() {
      const query = useQuery({
        queryKey,
        queryFn: async () => {
          fetchCount++;
          await sleep(100);
          return 'cached data';
        },
        gcTime,
        staleTime: Infinity,
      });
      return (
        <>
          <If when={() => query().isLoading()}>Loading...</If>
          <If when={() => query().isSuccess()}>{() => query().data()}</If>
        </>
      );
    }

    const show = $(true);
    function App() {
      return (
        <QueryClientProvider value={queryClient}>
          <If when={show}>
            <TestComponent />
          </If>
        </QueryClientProvider>
      );
    }

    render(<App />, document.body);

    expect(document.body.textContent).toContain('Loading...');
    await vi.advanceTimersByTimeAsync(101);
    expect(document.body.textContent).toBe('cached data');
    expect(fetchCount).toBe(1);

    show(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(51);
    show(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toBe('cached data');
    expect(fetchCount).toBe(1);

    show(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1001);
    const cacheData = queryClient.getQueryData(queryKey);
    expect(cacheData).toBe(undefined);

    show(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toBe('Loading...');
    await vi.advanceTimersByTimeAsync(101);
    expect(document.body.textContent).toBe('cached data');
    expect(fetchCount).toBe(2);
  });

  test('multiple useQuery instances - unmounting one should not affect the other', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;

    const sharedQueryKey = 'shared-query-key';
    const expectedData = 'Shared query data';

    function TestComponent() {
      const query = useQuery({
        queryKey: [sharedQueryKey],
        queryFn: async () => {
          fetchCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return expectedData;
        },
        staleTime: 0,
      });

      return (
        <div>
          <If when={() => query().isLoading()}>Loading...</If>
          <If when={() => query().isSuccess()}>{() => query().data()}</If>
        </div>
      );
    }

    const showFirst = $(true);

    function App() {
      return (
        <QueryClientProvider value={queryClient}>
          <If when={showFirst}>
            <TestComponent />
          </If>
          <TestComponent />
        </QueryClientProvider>
      );
    }

    render(<App />, document.body);

    expect(document.body.textContent).toContain('Loading...');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain(expectedData);

    expect(fetchCount).toBe(1);

    showFirst(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain(expectedData);

    const p = queryClient.refetchQueries({ queryKey: [sharedQueryKey] });
    await vi.advanceTimersByTimeAsync(11);
    await p;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toBe(expectedData);
    expect(fetchCount).toBe(2);
  });

  test('useQuery dynamic queryKey with observable elements', async () => {
    const queryClient = createQueryClient();
    const id = $(1);
    const fetchHistory: number[] = [];

    function TestComponent() {
      const query = useQuery({
        queryKey: ['dynamic-profile', id],
        queryFn: async () => {
          const currentId = id();
          fetchHistory.push(currentId);
          return `Profile ${currentId}`;
        },
      });

      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('Profile 1');
    expect(fetchHistory).toEqual([1]);

    id(2);
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('Profile 2');
    expect(fetchHistory).toEqual([1, 2]);

    const data1 = queryClient.getQueryData(['dynamic-profile', 1]);
    const data2 = queryClient.getQueryData(['dynamic-profile', 2]);
    expect(data1).toBe('Profile 1');
    expect(data2).toBe('Profile 2');
  });

  test('Dependent Queries (enabled changes dynamically)', async () => {
    const queryClient = createQueryClient();
    const userId = $(undefined as number | undefined);

    let userFetchCount = 0;
    let todoFetchCount = 0;

    function App() {
      const userQuery = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
          userFetchCount++;
          return { id: 42, name: 'John Doe' };
        },
      });

      const isTodoEnabled = useMemo(() => userId() !== undefined);
      const todoQuery = useQuery({
        queryKey: ['todos', userId],
        enabled: isTodoEnabled,
        queryFn: async () => {
          todoFetchCount++;
          return ['Todo 1', 'Todo 2'];
        },
      });

      return (
        <div>
          <p>UserId: {() => userId() ?? 'none'}</p>
          <p>UserQueryStatus: {() => userQuery().status()}</p>
          <p>TodoQueryStatus: {() => todoQuery().status()}</p>
          <p>TodoQueryFetchStatus: {() => todoQuery().fetchStatus()}</p>
          <p>TodoQueryData: {() => todoQuery().data()?.join(', ') ?? 'no data'}</p>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <App />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(userFetchCount).toBe(1);
    expect(todoFetchCount).toBe(0);
    expect(document.body.textContent).toContain('UserQueryStatus: success');
    expect(document.body.textContent).toContain('TodoQueryStatus: pending');
    expect(document.body.textContent).toContain('TodoQueryFetchStatus: idle');
    expect(document.body.textContent).toContain('TodoQueryData: no data');

    const userData = queryClient.getQueryData<{ id: number; name: string }>(['user']);
    expect(userData).toEqual({ id: 42, name: 'John Doe' });

    userId(userData?.id);
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('TodoQueryStatus: success');
    expect(todoFetchCount).toBe(1);
    expect(document.body.textContent).toContain('TodoQueryData: Todo 1, Todo 2');
  });

  test('Refetching transitions and previous data caching', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;
    let resolvePromise: (value: string) => void = () => {};

    function TestComponent() {
      const query = useQuery({
        queryKey: ['transitions'],
        queryFn: async () => {
          fetchCount++;
          return new Promise<string>((resolve) => {
            resolvePromise = resolve;
          });
        },
      });

      return (
        <div>
          <p>Data: {() => query().data() ?? 'none'}</p>
          <p>isPending: {() => query().isPending().toString()}</p>
          <p>isFetching: {() => query().isFetching().toString()}</p>
          <p>isRefetching: {() => query().isRefetching().toString()}</p>
          <p>status: {() => query().status()}</p>
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
    expect(fetchCount).toBe(1);
    expect(document.body.textContent).toContain('Data: none');
    expect(document.body.textContent).toContain('isPending: true');
    expect(document.body.textContent).toContain('isFetching: true');
    expect(document.body.textContent).toContain('isRefetching: false');
    expect(document.body.textContent).toContain('status: pending');

    resolvePromise('Value 1');
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain('status: success');
    expect(document.body.textContent).toContain('Data: Value 1');
    expect(document.body.textContent).toContain('isPending: false');
    expect(document.body.textContent).toContain('isFetching: false');
    expect(document.body.textContent).toContain('isRefetching: false');

    const refetchPromise = queryClient.refetchQueries({ queryKey: ['transitions'] });
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchCount).toBe(2);
    expect(document.body.textContent).toContain('Data: Value 1');
    expect(document.body.textContent).toContain('isPending: false');
    expect(document.body.textContent).toContain('isFetching: true');
    expect(document.body.textContent).toContain('isRefetching: true');

    resolvePromise('Value 2');
    await refetchPromise;
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain('Data: Value 2');
    expect(document.body.textContent).toContain('isPending: false');
    expect(document.body.textContent).toContain('isFetching: false');
    expect(document.body.textContent).toContain('isRefetching: false');
    expect(document.body.textContent).toContain('status: success');
  });

  test('refetch reuses the active request by default', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;
    let resolveFetch: (value: string) => void = () => {};
    let refetch: () => Promise<void> = async () => {};

    function TestComponent() {
      const query = useQuery({
        queryKey: ['deduped-refetch'],
        queryFn: async () => {
          fetchCount++;
          return new Promise<string>((resolve) => {
            resolveFetch = resolve;
          });
        },
      });

      refetch = () => query().refetch();

      return <div>{() => query().data() ?? 'Loading...'}</div>;
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toBe(1);
    expect(queryClient.isFetching({ queryKey: ['deduped-refetch'] })).toBe(1);

    const refetchPromise = refetch();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchCount).toBe(1);
    expect(queryClient.isFetching({ queryKey: ['deduped-refetch'] })).toBe(1);

    resolveFetch('First result');
    await refetchPromise;
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('First result');

    expect(fetchCount).toBe(1);
    expect(queryClient.isFetching({ queryKey: ['deduped-refetch'] })).toBe(0);
  });

  test('should keep the previous data when placeholderData is set and select fn transform is used', async () => {
    const queryClient = createQueryClient();
    const key = 'keep-previous-select-test';
    const idx = $(0);

    function TestComponent() {
      const query = useQuery<{ count: number }, Error, number>({
        queryKey: [key, idx],
        queryFn: async () => {
          await sleep(10);
          return { count: idx() };
        },
        select: (data) => data.count,
        placeholderData: keepPreviousData,
      });

      return (
        <>
          <p>Data: {() => String(query().data() ?? 'none')}</p>
          <p>isPlaceholderData: {() => query().isPlaceholderData().toString()}</p>
        </>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Data: none');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: 0');
    expect(document.body.textContent).toContain('isPlaceholderData: false');

    idx(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain('Data: 0');
    expect(document.body.textContent).toContain('isPlaceholderData: true');

    await vi.advanceTimersByTimeAsync(11);
    expect(document.body.textContent).toContain('Data: 1');
    expect(document.body.textContent).toContain('isPlaceholderData: false');
  });

  test('should show the correct data when switching keys with initialData, placeholderData & staleTime', async () => {
    const queryClient = createQueryClient();
    const key = 'initialdata-placeholder-staletime';

    const ALL_TODOS = [
      { name: 'todo A', priority: 'high' },
      { name: 'todo B', priority: 'medium' },
    ];

    const initialTodos = ALL_TODOS;
    const filter = $('');

    function Page() {
      const query = useQuery({
        queryKey: [key, filter],
        queryFn: async () => {
          return ALL_TODOS.filter((todo) => (filter() ? todo.priority === filter() : true));
        },
        initialData() {
          return filter() === '' ? initialTodos : undefined;
        },
        placeholderData: keepPreviousData,
        staleTime: 5000,
      });

      return (
        <div>
          <p>Current Todos, filter: {() => filter() || 'all'}</p>
          <button onClick={() => filter('')}>All</button>
          <button onClick={() => filter('high')}>High</button>
          <ul>
            <For values={() => query().data() ?? []}>
              {(todo) => <li>{() => `${todo.name} - ${todo.priority}`}</li>}
            </For>
          </ul>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Current Todos, filter: all');
    expect(document.body.textContent).toContain('todo A - high');
    expect(document.body.textContent).toContain('todo B - medium');

    const buttons = document.querySelectorAll('button');
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toContain('Current Todos, filter: high');

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.textContent).toContain('todo B - medium');
  });

  test('should initialize state properly, when initialData is falsy', async () => {
    const queryClient = createQueryClient();
    const key = ['initial-data-falsy'];

    function Page() {
      const query = useQuery({
        queryKey: key,
        queryFn: async () => 1,
        initialData: 0,
      });

      return (
        <div>
          <p>Data: {() => String(query().data() ?? 'none')}</p>
          <p>Fetching: {() => query().isFetching().toString()}</p>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <Page />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toContain('Data: 0');
    expect(document.body.textContent).toContain('Fetching: true');

    await vi.advanceTimersByTimeAsync(1);

    expect(document.body.textContent).toContain('Data: 1');
    expect(document.body.textContent).toContain('Fetching: false');
  });
});
