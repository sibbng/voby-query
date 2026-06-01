import { $, For, If } from 'voby';
import { useQuery, useMutation, useMutationState } from 'voby-query';
import { Tag, Card, Btn } from '../src/ui';
import { queryClient } from '../src/client';

type Todo = { id: number; title: string; completed: boolean };

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const todoStore = {
  value: [
    { id: 1, title: 'Document reactive query keys', completed: false },
    { id: 2, title: 'Add mutation invalidation demo', completed: true },
    { id: 3, title: 'Wire playground into pnpm workspace', completed: false },
  ] as Todo[],
};

const todoApi = {
  async list(signal?: AbortSignal) {
    await wait(250, signal);
    return todoStore.value.map((t) => ({ ...t }));
  },
  async add(title: string) {
    await wait(400);
    const next = { id: Math.max(...todoStore.value.map((t) => t.id)) + 1, title, completed: false };
    todoStore.value = [...todoStore.value, next];
    return next;
  },
  async toggle(id: number) {
    await wait(300);
    todoStore.value = todoStore.value.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t,
    );
    return todoStore.value.find((t) => t.id === id)!;
  },
};

export const TodosDemo = () => {
  const draft = $('');

  const todos = useQuery({ queryKey: ['todos'], queryFn: ({ signal }) => todoApi.list(signal) });

  const addTodo = useMutation<Todo, Error, string>({
    mutationKey: ['todos', 'add'],
    mutationFn: (title) => todoApi.add(title),
    onSuccess: async () => {
      await todos().refetch();
      draft('');
    },
  });

  const toggleTodo = useMutation<Todo, Error, number>({
    mutationKey: ['todos', 'toggle'],
    mutationFn: (id) => todoApi.toggle(id),
    onSuccess: async () => {
      await todos().refetch();
    },
  });

  const pending = useMutationState({
    filters: { status: 'pending' },
    select: (m) => ({
      key: (m.resolvedOptions.mutationKey as (string | number)[]).join('/'),
      at: m.state.submittedAt() ?? 0,
    }),
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Mutations + invalidation</h2>
          <p class="text-sm text-white/40 mt-0.5">
            Write through mutation, refresh via cache invalidation.
          </p>
        </div>
        <Tag>{() => `${pending().length} pending`}</Tag>
      </div>

      <form
        class="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft().trim();
          if (t) void addTodo().mutate(t);
        }}
      >
        <input
          value={draft}
          onInput={(e) => draft(e.currentTarget.value)}
          placeholder="New todo…"
          class="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/20"
        />
        <Btn type="submit">Add</Btn>
        <Btn onClick={() => queryClient.invalidateQueries({ queryKey: ['todos'] })}>Invalidate</Btn>
      </form>

      <If when={() => addTodo().isError() || toggleTodo().isError()}>
        <p class="text-xs text-red-400 font-mono">
          {() => addTodo().error()?.message ?? toggleTodo().error()?.message}
        </p>
      </If>

      <div class="flex flex-col gap-1">
        <For
          values={() => todos().data() ?? []}
          fallback={<p class="text-sm text-white/30">Loading…</p>}
        >
          {(todo) => (
            <button
              onClick={() => toggleTodo().mutate(todo.id)}
              class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/3 hover:bg-white/6 border border-white/6 text-sm text-left transition-colors cursor-pointer"
            >
              <span class="font-mono text-xs text-white/30">
                {() => (todo.completed ? '✓' : '○')}
              </span>
              <span class={() => (todo.completed ? 'line-through text-white/30' : 'text-white/70')}>
                {() => todo.title}
              </span>
            </button>
          )}
        </For>
      </div>

      <If when={() => pending().length > 0}>
        <div class="rounded-lg bg-white/3 border border-white/6 p-3">
          <p class="text-xs font-mono text-white/30 mb-2 uppercase tracking-widest">
            Active mutations
          </p>
          <For values={pending}>
            {(entry) => (
              <p class="text-xs font-mono text-white/50">
                <span class="text-white/70">{() => entry.key}</span>
                {' — '}
                {() => new Date(entry.at).toLocaleTimeString()}
              </p>
            )}
          </For>
        </div>
      </If>
    </Card>
  );
};

export const meta = {
  id: 'todos',
  label: 'Mutations + invalidation',
};
