# Voby Query

A port of TanStack Query for [Voby](https://voby.dev).

## Feature comparison

| Feature | voby-query | TanStack React Query |
|---|---|---|
| `useQuery` | ✅ | ✅ |
| `useMutation` | ✅ | ✅ |
| `useInfiniteQuery` | ✅ | ✅ |
| `useQueries` | ✅ | ✅ |
| `useSuspenseQuery` | ✅ | ✅ |
| `useSuspenseInfiniteQuery` | ✅ | ✅ |
| `useSuspenseQueries` | ✅ | ✅ |
| `usePrefetchQuery` | ✅ | ✅ |
| `usePrefetchInfiniteQuery` | ✅ | ✅ |
| `useIsFetching` / `useIsMutating` | ✅ | ✅ |
| `useMutationState` | ✅ | ✅ |
| `QueryClient` | ✅ | ✅ |
| `QueryCache` / `MutationCache` | ✅ | ✅ |
| `onlineManager` / `focusManager` | ✅ | ✅ |
| `timeoutManager` | ✅ | ✅ |
| `DataTag` inference | ✅ | ✅ |
| `queryOptions` / `mutationOptions` | ✅ | ✅ |
| `infiniteQueryOptions` | ✅ | ✅ |
| `enabled` / `queryKey` | ✅ | ✅ |
| `staleTime` / `gcTime` | ✅ | ✅ |
| `retry` / `retryDelay` | ✅ | ✅ |
| `networkMode` | ✅ | ✅ |
| `structuralSharing` / `select` | ✅ | ✅ |
| SSR hydration | ❌ | ✅ |
| Devtools | ❌ | ✅ |
| Persist plugin | ❌ | ✅ |

## Architectural notes

The following TanStack Query internals are not present in voby-query:

| Internal | Why |
|---|---|
| `notifyManager` | Voby's signal-based reactivity doesn't require microtask-coalescing — each signal consumer updates independently and synchronously. |
| `environmentManager` | Only 4 inline `typeof window` checks exist. A dedicated manager adds no practical benefit. |
| SSR hydration/dehydration | Voby does not support SSR yet. These can be added later. |

## Installation

```bash
npm i voby-query
```

## Usage

### useQuery

```ts
import { useQuery } from 'voby-query';

const id = $(1);
const query = useQuery({
  queryKey: ['todos', id],
  queryFn: async () => {
    const response = await fetch(`https://jsonplaceholder.typicode.com/todos/${id()}`);
    return response.json();
  },
});
```

`useQuery` returns a read-only observable. Read values through `query()` instead of destructuring.

```tsx
import { For, If } from 'voby';
import { useQuery, type UseQueryResult } from 'voby-query';

type Todo = {
  id: number;
  title: string;
};

async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  return response.json();
}

function TodoList(props: { query: UseQueryResult<Todo[], Error> }) {
  return (
    <>
      <If when={() => props.query().isLoading()}>
        <div>Loading...</div>
      </If>
      <If when={() => props.query().isError()}>
        <div>{() => props.query().error()?.message ?? 'Failed to load todos'}</div>
      </If>
      <ul>
        <For values={() => props.query().data() ?? []}>{(todo) => <li>{todo.title}</li>}</For>
      </ul>
    </>
  );
}

export function App() {
  const query: UseQueryResult<Todo[], Error> = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  return <TodoList query={query} />;
}
```

### useMutation

```tsx
import { useMutation } from 'voby-query';

const mutation = useMutation({
  mutationFn: async (todo: { title: string }) => {
    const res = await fetch('https://jsonplaceholder.typicode.com/todos', {
      method: 'POST',
      body: JSON.stringify(todo),
      headers: { 'Content-Type': 'application/json' },
    });
    return res.json();
  },
});

return (
  <button onClick={() => mutation().mutate({ title: 'New todo' })} disabled={mutation().isPending()}>
    {mutation().isPending() ? 'Saving...' : 'Add Todo'}
  </button>
);
```

### createQueryClient

```ts
import { createQueryClient, QueryClientProvider } from 'voby-query';

const queryClient = createQueryClient();

// Provide to the component tree
<QueryClientProvider value={queryClient}>
  <App />
</QueryClientProvider>
```

## Further reading

For detailed usage guidance, refer to [TanStack Query's documentation](https://tanstack.com/query/latest).

## License

MIT
