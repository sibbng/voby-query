import { $, For, If, render } from 'voby';
import {
  QueryClientProvider,
  createQueryClient,
  useQuery,
  useMutation,
  useMutationState,
} from 'voby-query';
import './styles.css';

type Todo = { id: number; title: string; completed: boolean };
type Profile = { id: number; name: string; handle: string; bio: string };

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

const PROFILES: Profile[] = [
  {
    id: 1,
    name: 'Ada Lovelace',
    handle: '@ada',
    bio: 'Drives architecture and roadmap decisions.',
  },
  {
    id: 2,
    name: 'Grace Hopper',
    handle: '@grace',
    bio: 'Keeps delivery predictable and observable.',
  },
  {
    id: 3,
    name: 'Margaret Hamilton',
    handle: '@margaret',
    bio: 'Turns edge cases into boring incidents.',
  },
];

const todoStore = {
  value: [
    { id: 1, title: 'Document reactive query keys', completed: false },
    { id: 2, title: 'Add mutation invalidation demo', completed: true },
    { id: 3, title: 'Wire playground into pnpm workspace', completed: false },
  ] as Todo[],
};

const queryClient = createQueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchInterval: 0, staleTime: 15_000 },
  },
});

const profileApi = {
  async get(id: number, signal?: AbortSignal) {
    await wait(350, signal);
    const p = PROFILES.find((x) => x.id === id);
    if (!p) throw new Error(`Profile ${id} not found`);
    return { ...p, fetchedAt: new Date().toLocaleTimeString() };
  },
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

const Tag = ({ children }: { children: any }) => (
  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-white/5 text-white/40 border border-white/10">
    {children}
  </span>
);

const Card = ({ children }: { children: any }) => (
  <div class="rounded-xl border border-white/8 bg-[#111] p-5 flex flex-col gap-4">{children}</div>
);

const Btn = ({
  children,
  onClick,
  type = 'button',
}: {
  children: any;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) => (
  <button
    type={type}
    onClick={onClick}
    class="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/8 text-white/70 border border-white/10 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
  >
    {children}
  </button>
);

// ── Demo 1: Reactive query key ──────────────────────────────────────────────
const ProfileDemo = () => {
  const id = $(1);
  const enabled = $(true);

  const profile = useQuery({
    queryKey: ['profile', id],
    enabled,
    placeholderData: {
      id: 0,
      name: '—',
      handle: '—',
      bio: 'Enable the query to load.',
      fetchedAt: '—',
    },
    queryFn: ({ signal }) => profileApi.get(id(), signal),
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-xs font-mono text-white/30 uppercase tracking-widest mb-1">Demo 01</p>
          <h2 class="text-base font-semibold text-white">Reactive query key</h2>
          <p class="text-sm text-white/40 mt-0.5">
            Observable key — query re-runs when it changes.
          </p>
        </div>
        <Tag>{() => profile().fetchStatus()}</Tag>
      </div>

      <div class="flex flex-wrap gap-2">
        <Btn onClick={() => id((n) => (n % PROFILES.length) + 1)}>Next profile</Btn>
        <Btn onClick={() => enabled((v) => !v)}>{() => (enabled() ? 'Disable' : 'Enable')}</Btn>
        <Btn onClick={() => profile().refetch()}>Refetch</Btn>
      </div>

      <div class="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p class="text-white/30 text-xs mb-0.5">id</p>
          <p class="font-mono">{id}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">status</p>
          <p class="font-mono">{() => profile().status()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">fetched at</p>
          <p class="font-mono">{() => profile().data()?.fetchedAt}</p>
        </div>
      </div>

      <div class="rounded-lg bg-white/4 border border-white/6 p-4">
        <p class="font-semibold text-white">{() => profile().data()?.name}</p>
        <p class="text-xs font-mono text-white/30 mt-0.5">{() => profile().data()?.handle}</p>
        <p class="text-sm text-white/50 mt-2">{() => profile().data()?.bio}</p>
      </div>
    </Card>
  );
};

// ── Demo 2: Mutations + invalidation ───────────────────────────────────────
const TodosDemo = () => {
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

  // Reactive pending list via useMutationState — now properly reactive
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
          <p class="text-xs font-mono text-white/30 uppercase tracking-widest mb-1">Demo 02</p>
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

// ── Demo 3: Cache inspector ─────────────────────────────────────────────────
const CacheDemo = () => {
  const info = useQuery({
    queryKey: ['cache-summary'],
    queryFn: async () => ({
      total: queryClient.getQueryCache().size,
      todos: (queryClient.getQueryData<Todo[]>(['todos']) ?? []).length,
      at: new Date().toLocaleTimeString(),
    }),
    refetchInterval: 1000,
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-xs font-mono text-white/30 uppercase tracking-widest mb-1">Demo 03</p>
          <h2 class="text-base font-semibold text-white">Cache inspector</h2>
          <p class="text-sm text-white/40 mt-0.5">
            Polls the client every second to report cache state.
          </p>
        </div>
        <Tag>{() => info().status()}</Tag>
      </div>

      <div class="rounded-lg bg-white/4 border border-white/6 p-4 font-mono text-sm flex flex-col gap-2">
        <div class="flex justify-between">
          <span class="text-white/30">total queries</span>
          <span class="text-white">{() => info().data()?.total ?? '—'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/30">cached todos</span>
          <span class="text-white">{() => info().data()?.todos ?? '—'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/30">last sampled</span>
          <span class="text-white/50">{() => info().data()?.at ?? '—'}</span>
        </div>
      </div>

      <Btn onClick={() => queryClient.clear()}>Clear cache</Btn>
    </Card>
  );
};

// ── App ─────────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider value={queryClient}>
    <div class="min-h-screen bg-[#0a0a0a] text-white antialiased">
      <div class="max-w-5xl mx-auto px-4 py-16">
        <header class="mb-12">
          <p class="text-xs font-mono text-white/25 uppercase tracking-widest mb-3">
            voby-query / playground
          </p>
          <h1 class="text-3xl font-bold tracking-tight text-white mb-2">Query demos</h1>
          <p class="text-sm text-white/40 max-w-xl">
            Live examples wired to the local workspace package. Edit{' '}
            <code class="font-mono bg-white/8 px-1 rounded">src/</code> and the playground updates
            instantly.
          </p>
        </header>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProfileDemo />
          <TodosDemo />
          <CacheDemo />
        </div>
      </div>
    </div>
  </QueryClientProvider>
);

render(<App />, document.querySelector('#app')!);
