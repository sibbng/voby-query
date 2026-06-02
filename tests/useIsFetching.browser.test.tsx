import { expect, test } from 'vite-plus/test';
import { flush, render } from './utils';
import { createQueryClient, useIsFetching } from '../src';
import { useQuery } from '../src/useQuery';
import { QueryClientProvider } from '../src/context';

test('returns 0 when no queries are fetching', async () => {
  const queryClient = createQueryClient();

  function TestComponent() {
    const isFetching = useIsFetching();
    return <div>{() => isFetching()}</div>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toBe('0');
});

test('tracks fetching queries reactively', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};

  function TestComponent() {
    const isFetching = useIsFetching();
    const query = useQuery({
      queryKey: ['test'],
      queryFn: async () => {
        return new Promise<string>((resolve) => {
          resolveFetch = resolve;
        });
      },
    });
    return (
      <div>
        {() => isFetching()}
        {() => query().data() ?? ''}
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toBe('1');

  resolveFetch('data');
  await flush();
  expect(document.body.textContent).toBe('0data');
});

test('filters by queryKey prefix', async () => {
  const queryClient = createQueryClient();
  let resolvePosts: (value: string) => void = () => {};
  let resolveTodos: (value: string) => void = () => {};

  function TestComponent() {
    const postsFetching = useIsFetching({ filters: { queryKey: ['posts'] } });
    const todosFetching = useIsFetching({ filters: { queryKey: ['todos'] } });
    const postsQuery = useQuery({
      queryKey: ['posts'],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolvePosts = r;
        }),
    });
    const todosQuery = useQuery({
      queryKey: ['todos'],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolveTodos = r;
        }),
    });

    return (
      <div>
        <span>Posts: {() => postsFetching()}</span>
        <span>Todos: {() => todosFetching()}</span>
        <span>{() => postsQuery().data() ?? ''}</span>
        <span>{() => todosQuery().data() ?? ''}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toContain('Posts: 1');
  expect(document.body.textContent).toContain('Todos: 1');

  resolvePosts('posts data');
  await flush();
  expect(document.body.textContent).toContain('Posts: 0');
  expect(document.body.textContent).toContain('Todos: 1');

  resolveTodos('todos data');
  await flush();
  expect(document.body.textContent).toContain('Posts: 0');
  expect(document.body.textContent).toContain('Todos: 0');
});

test('filters by exact queryKey', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};

  function TestComponent() {
    const exactFetching = useIsFetching({
      filters: { queryKey: ['posts', 'latest'], exact: true },
    });
    const query = useQuery({
      queryKey: ['posts'],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolveFetch = r;
        }),
    });

    return (
      <div>
        {() => exactFetching()}
        {() => query().data() ?? ''}
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toBe('0');

  resolveFetch('data');
  await flush();
});

test('filter key must match query key prefix (demo bug: fetch-slow filter does not match slow query key)', async () => {
  const queryClient = createQueryClient();
  let resolveFetch: (value: string) => void = () => {};

  function TestComponent() {
    const slowFilter = useIsFetching({ filters: { queryKey: ['slow'] } });
    const wrongFilter = useIsFetching({ filters: { queryKey: ['fetch-slow'] } });
    const query = useQuery({
      queryKey: ['slow', 'item', 1],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolveFetch = r;
        }),
    });
    return (
      <div>
        <span>correct: {() => slowFilter()}</span>
        <span>wrong: {() => wrongFilter()}</span>
        <span>{() => query().data() ?? ''}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toContain('correct: 1');
  expect(document.body.textContent).toContain('wrong: 0');

  resolveFetch('data');
  await flush();
  expect(document.body.textContent).toContain('correct: 0');
  expect(document.body.textContent).toContain('wrong: 0');
});

test('prefix filter matches nested keys (demo scenario: fetch-slow includes fetch-slow/*)', async () => {
  const queryClient = createQueryClient();
  let resolve800: (value: string) => void = () => {};
  let resolveSlow: (value: string) => void = () => {};

  function TestComponent() {
    const allFetching = useIsFetching();
    const prefixFetching = useIsFetching({ filters: { queryKey: ['fetch-slow'] } });
    const query800 = useQuery({
      queryKey: ['fetch-slow', 'c', 1],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolve800 = r;
        }),
    });
    const querySlow = useQuery({
      queryKey: ['fetch-slow', 'b', 1],
      queryFn: async () =>
        new Promise<string>((r) => {
          resolveSlow = r;
        }),
    });
    return (
      <div>
        <span>all: {() => allFetching()}</span>
        <span>prefix: {() => prefixFetching()}</span>
        <span>{() => query800().data() ?? ''}</span>
        <span>{() => querySlow().data() ?? ''}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  // Both queries are fetching, both match the prefix filter
  expect(document.body.textContent).toContain('all: 2');
  expect(document.body.textContent).toContain('prefix: 2');

  // Resolve only the 800ms query
  resolve800('fast');
  await flush();
  expect(document.body.textContent).toContain('all: 1');
  expect(document.body.textContent).toContain('prefix: 1');

  resolveSlow('slow');
  await flush();
  expect(document.body.textContent).toContain('all: 0');
  expect(document.body.textContent).toContain('prefix: 0');
});

test('accepts override queryClient', async () => {
  const queryClient = createQueryClient();
  const overrideClient = createQueryClient();
  let _resolveFetch: (value: string) => void = () => {};

  function TestComponent() {
    const isFetching = useIsFetching({ queryClient: overrideClient });
    const query = useQuery({
      queryKey: ['test'],
      queryFn: async () => {
        return new Promise<string>((resolve) => {
          _resolveFetch = resolve;
        });
      },
    });
    return (
      <div>
        {() => isFetching()}
        {() => query().data() ?? ''}
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toBe('0');
});
