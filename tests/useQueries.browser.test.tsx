import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { render, sleep } from './utils';
import { $, For, If } from 'voby';
import { createQueryClient } from '../src';
import { useQueries } from '../src/useQueries';
import { QueryClientProvider } from '../src/context';

describe('useQueries.browser.test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('useQueries fetches multiple queries in parallel', async () => {
    const queryClient = createQueryClient();
    let result: any;

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['a'],
            queryFn: async () => {
              await sleep(10);
              return 'result-a';
            },
          },
          {
            queryKey: ['b'],
            queryFn: async () => {
              await sleep(10);
              return 'result-b';
            },
          },
        ],
      });
      result = queries;

      return (
        <div>
          {() => {
            const qs = queries();
            return qs.map((q: any, i: number) => `[${i}]:${q.data() ?? 'loading'}`).join(' | ');
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('[0]:result-a | [1]:result-b');

    expect(queryClient.getQueryData(['a'])).toBe('result-a');
    expect(queryClient.getQueryData(['b'])).toBe('result-b');
  });

  test('useQueries returns reactive observable objects per query', async () => {
    const queryClient = createQueryClient();
    let result: any;

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['react-a'],
            queryFn: async () => {
              await sleep(10);
              return { id: 1 };
            },
          },
        ],
      });
      result = queries;

      return (
        <div>
          {() => {
            const qs = queries();
            const d = qs[0].data() as any;
            return d?.id ?? 'pending';
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    expect(document.body.textContent).toBe('pending');

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('1');

    const qs = result();
    expect(typeof qs[0].isLoading).toBe('function');
    expect(typeof qs[0].isSuccess).toBe('function');
    expect(typeof qs[0].isPending).toBe('function');
    expect(typeof qs[0].status).toBe('function');
    expect(typeof qs[0].data).toBe('function');
    expect(typeof qs[0].refetch).toBe('function');
    expect(typeof qs[0].cancel).toBe('function');
    expect(qs[0].isSuccess()).toBe(true);
    expect(qs[0].isPending()).toBe(false);
  });

  test('useQueries combine transforms the result', async () => {
    const queryClient = createQueryClient();
    let tickCount = 0;

    function TestComponent() {
      const combined = useQueries({
        queries: [
          {
            queryKey: ['combine-a'],
            queryFn: async () => {
              await sleep(10);
              return { name: 'Alice', age: 30 };
            },
          },
          {
            queryKey: ['combine-b'],
            queryFn: async () => {
              await sleep(10);
              return { name: 'Bob', age: 25 };
            },
          },
        ],
        combine: (results) => {
          tickCount++;
          const items = results.map((r) => r.data() as any);
          const totalAge = items.reduce((sum, item) => sum + ((item as any)?.age ?? 0), 0);
          const names = items
            .map((item: any) => item?.name)
            .filter(Boolean)
            .join(', ');
          return { totalAge, names };
        },
      });

      return (
        <div>
          <span>Names: {() => combined().names}</span>
          <span> | </span>
          <span>TotalAge: {() => String(combined().totalAge)}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toContain('Names: Alice, Bob');
    expect(document.body.textContent).toContain('TotalAge: 55');
  });

  test('useQueries select option transforms individual query data', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['select-a'],
            queryFn: async () => {
              await sleep(10);
              return { value: 42 };
            },
            select: (data: any) => data.value * 2,
          },
          {
            queryKey: ['select-b'],
            queryFn: async () => {
              await sleep(10);
              return { value: 100 };
            },
            select: (data: any) => `$${data.value}`,
          },
        ],
      });

      return (
        <div>
          {() => {
            const qs = queries();
            return qs.map((q: any, i: number) => q.data() as string).join(' | ');
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('84 | $100');

    const cachedA = queryClient.getQueryData(['select-a']);
    expect(cachedA).toEqual({ value: 42 });
  });

  test('useQueries placeholderData shown while loading', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['placeholder-a'],
            queryFn: async () => {
              await sleep(30);
              return 'actual-a';
            },
            placeholderData: 'placeholder-a',
          },
          {
            queryKey: ['placeholder-b'],
            queryFn: async () => {
              await sleep(30);
              return 'actual-b';
            },
            placeholderData: 'placeholder-b',
          },
        ],
      });

      return (
        <div>
          {() => {
            const qs = queries();
            return qs.map((q: any, i: number) => q.data() as string).join(' | ');
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    // Placeholder data shown immediately
    expect(document.body.textContent).toBe('placeholder-a | placeholder-b');

    await vi.advanceTimersByTimeAsync(40);
    expect(document.body.textContent).toBe('actual-a | actual-b');
  });

  test('useQueries with one error and one success', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['err-ok'],
            queryFn: async () => {
              await sleep(10);
              return 'ok-data';
            },
            retry: false,
          },
        ],
      });

      const errorQueries = useQueries({
        queries: [
          {
            queryKey: ['err-fail'],
            queryFn: async () => {
              await sleep(10);
              throw new Error('test error');
            },
            retry: false,
          },
        ],
      });

      return (
        <div>
          <If when={() => queries()[0]?.isSuccess()}>
            <span>OK: {() => queries()[0].data() as string}</span>
          </If>
          <If when={() => errorQueries()[0]?.isError()}>
            <span> | ERR: {() => errorQueries()[0].error()?.message}</span>
          </If>
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('OK: ok-data | ERR: test error');
  });

  test('useQueries reactive query keys trigger re-fetch', async () => {
    const queryClient = createQueryClient();
    const id = $(1);
    const fetchHistory: number[] = [];

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['reactive-key', id],
            queryFn: async () => {
              const currentId = id();
              fetchHistory.push(currentId);
              return `item-${currentId}`;
            },
          },
        ],
      });

      return (
        <div>
          {() => {
            const qs = queries();
            return (qs[0]?.data() as string) ?? 'loading';
          }}
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
    expect(document.body.textContent).toBe('item-1');
    expect(fetchHistory).toEqual([1]);

    id(2);
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('item-2');
    expect(fetchHistory).toEqual([1, 2]);
  });

  test('useQueries subscribed: false returns initial snapshot only', async () => {
    const queryClient = createQueryClient();
    let renderCount = 0;

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['no-sub'],
            queryFn: async () => {
              await sleep(10);
              return 'initial';
            },
          },
        ],
        subscribed: false,
      });

      renderCount++;

      return (
        <div>
          {() => {
            const qs = queries();
            return (qs[0]?.data() as string) ?? 'loading';
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('initial');

    const renderCountBefore = renderCount;

    queryClient.setQueryData(['no-sub'], 'updated');
    await vi.advanceTimersByTimeAsync(1);

    expect(renderCount).toBe(renderCountBefore);
  });

  test('useQueries cache updates propagate to all results', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const queries = useQueries({
        queries: [
          {
            queryKey: ['cache-prop-a'],
            queryFn: async () => {
              await sleep(10);
              return 'v1';
            },
            staleTime: 50,
          },
          {
            queryKey: ['cache-prop-b'],
            queryFn: async () => {
              await sleep(10);
              return 'x';
            },
          },
        ],
      });

      return (
        <div>
          {() => {
            const qs = queries();
            const dataA = qs[0]?.data() as string;
            const dataB = qs[1]?.data() as string;
            return `${dataA ?? '..'} | ${dataB ?? '..'}`;
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('v1 | x');

    queryClient.setQueryData(['cache-prop-a'], 'v2');
    await vi.advanceTimersByTimeAsync(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toBe('v2 | x');
  });

  test('useQueries combine receives reactive properties', async () => {
    const queryClient = createQueryClient();

    function TestComponent() {
      const combined = useQueries({
        queries: [
          {
            queryKey: ['reactive-combine'],
            queryFn: async () => {
              await sleep(10);
              return 42;
            },
          },
        ],
        combine: (results) => {
          return {
            hasData: results[0]?.isSuccess() ?? false,
            value: (results[0]?.data() as any) ?? '?',
          };
        },
      });

      return (
        <div>
          {() => {
            const c = combined() as { hasData: boolean; value: string };
            return `hasData=${c.hasData} value=${c.value}`;
          }}
        </div>
      );
    }

    render(
      <QueryClientProvider value={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
      document.body,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('hasData=true value=42');
  });

  test('useQueries unmount cleanup removes instances', async () => {
    const queryClient = createQueryClient();
    const show = $(true);
    let fetchCount = 0;

    function TestComponent() {
      useQueries({
        queries: [
          {
            queryKey: ['unmount-cleanup'],
            queryFn: async () => {
              fetchCount++;
              await sleep(10);
              return 'data';
            },
            staleTime: 0,
          },
        ],
      });

      return <div>visible</div>;
    }

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

    await vi.advanceTimersByTimeAsync(20);
    expect(document.body.textContent).toBe('visible');
    expect(fetchCount).toBe(1);

    const query = queryClient.getQueryCache().find({ queryKey: ['unmount-cleanup'] });
    expect(query).toBeDefined();
    expect(query!.isActive).toBe(true);

    show(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(query!.isActive).toBe(false);
  });
});
