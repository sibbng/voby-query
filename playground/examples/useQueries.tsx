import { $, For, type ObservableReadonly } from 'voby';
import { useQueries, type QueriesResultItem } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

type User = { id: number; name: string; handle: string; bio: string };
type Post = { id: number; title: string; date: string; views: number };
type Stats = { followers: number; following: number; totalPosts: number; totalViews: number };

type DashboardView = {
  user: QueriesResultItem<User>;
  posts: QueriesResultItem<Post[]>;
  stats: QueriesResultItem<Stats>;
  ready: boolean;
  anyError: boolean;
};

const USERS: User[] = [
  {
    id: 1,
    name: 'Ada Lovelace',
    handle: '@ada',
    bio: 'Compiler enthusiast · type-safe since 1843',
  },
  { id: 2, name: 'Grace Hopper', handle: '@grace', bio: 'Ship it. Then ship the next thing.' },
  {
    id: 3,
    name: 'Margaret Hamilton',
    handle: '@margaret',
    bio: 'Apollo guidance code · reliability first',
  },
];

const POSTS: Record<number, Post[]> = {
  1: [
    { id: 1, title: 'Reactive programming patterns', date: '2026-05-20', views: 1240 },
    { id: 2, title: 'TypeScript 6.0 deep dive', date: '2026-05-18', views: 890 },
    { id: 3, title: 'Fine-grained reactivity explained', date: '2026-05-15', views: 2100 },
  ],
  2: [
    { id: 4, title: 'Sprint planning for teams', date: '2026-05-21', views: 560 },
    { id: 5, title: 'Monitoring microservices', date: '2026-05-17', views: 1340 },
  ],
  3: [
    { id: 6, title: 'Formal verification in practice', date: '2026-05-22', views: 980 },
    { id: 7, title: 'Error handling strategies', date: '2026-05-19', views: 720 },
    { id: 8, title: 'Writing reliable distributed systems', date: '2026-05-14', views: 1650 },
    { id: 9, title: 'Code review checklist', date: '2026-05-12', views: 3100 },
  ],
};

const STATS: Record<number, Stats> = {
  1: { followers: 12400, following: 320, totalPosts: 47, totalViews: 186000 },
  2: { followers: 8900, following: 510, totalPosts: 33, totalViews: 142000 },
  3: { followers: 15700, following: 280, totalPosts: 62, totalViews: 254000 },
};

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

const userApi = {
  async get(id: number, signal?: AbortSignal) {
    await wait(250 + Math.random() * 200, signal);
    const u = USERS.find((x) => x.id === id);
    if (!u) throw new Error(`User ${id} not found`);
    return u;
  },
  async posts(id: number, signal?: AbortSignal) {
    await wait(350 + Math.random() * 250, signal);
    return POSTS[id] ?? [];
  },
  async stats(id: number, signal?: AbortSignal) {
    await wait(200 + Math.random() * 200, signal);
    const s = STATS[id];
    if (!s) throw new Error(`Stats for user ${id} not found`);
    return s;
  },
};

export const UseQueriesDemo = () => {
  const userId = $(1);

  const dashboard = useQueries({
    queries: [
      {
        queryKey: ['dashboard-user', userId],
        queryFn: ({ signal }) => userApi.get(userId(), signal),
        placeholderData: { id: 0, name: '—', handle: '—', bio: 'Loading…' } satisfies User,
      },
      {
        queryKey: ['dashboard-posts', userId],
        queryFn: ({ signal }) => userApi.posts(userId(), signal),
        select: (data) =>
          (data as Post[])
            .slice()
            .sort((a, b) => b.views - a.views)
            .slice(0, 3),
        placeholderData: [] satisfies Post[],
      },
      {
        queryKey: ['dashboard-stats', userId],
        queryFn: ({ signal }) => userApi.stats(userId(), signal),
        placeholderData: {
          followers: 0,
          following: 0,
          totalPosts: 0,
          totalViews: 0,
        } satisfies Stats,
      },
    ],
    combine: (results) => ({
      user: results[0] as unknown as QueriesResultItem<User>,
      posts: results[1] as unknown as QueriesResultItem<Post[]>,
      stats: results[2] as unknown as QueriesResultItem<Stats>,
      ready: results[0].isSuccess() && results[1].isSuccess() && results[2].isSuccess(),
      anyError: results[0].isError() || results[1].isError() || results[2].isError(),
    }),
  }) as unknown as ObservableReadonly<DashboardView>;

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Dashboard (useQueries)</h2>
          <p class="text-sm text-white/40 mt-0.5">
            Three queries fetched in parallel, combined into one view.
          </p>
        </div>
        <Tag>
          {() => (dashboard().anyError ? 'error' : dashboard().ready ? 'ready' : 'loading')}
        </Tag>
      </div>

      <div class="flex flex-wrap gap-2">
        <For values={USERS}>
          {(user) => (
            <Btn onClick={() => userId(user.id)}>
              {() => `${user.name} ${userId() === user.id ? '●' : ''}`}
            </Btn>
          )}
        </For>
      </div>

      <div class="grid grid-cols-[1fr_1.5fr] gap-4">
        {/* Profile card */}
        <div class="rounded-lg bg-white/3 border border-white/6 p-4 flex flex-col gap-3">
          <p class="text-xs font-mono text-white/25 uppercase tracking-widest">Profile</p>
          <div>
            <p class="text-white font-semibold">{() => dashboard().user.data()?.name}</p>
            <p class="text-xs font-mono text-white/30">{() => dashboard().user.data()?.handle}</p>
          </div>
          <p class="text-sm text-white/50 leading-relaxed">{() => dashboard().user.data()?.bio}</p>
          <Btn onClick={() => dashboard().user.refetch()}>Refetch</Btn>
        </div>

        {/* Stats grid */}
        <div class="rounded-lg bg-white/3 border border-white/6 p-4 flex flex-col gap-3">
          <p class="text-xs font-mono text-white/25 uppercase tracking-widest">Analytics</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-white/30">Followers</p>
              <p class="text-xl font-bold font-mono text-white">
                {() => (dashboard().stats.data()?.followers ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p class="text-xs text-white/30">Following</p>
              <p class="text-xl font-bold font-mono text-white">
                {() => (dashboard().stats.data()?.following ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p class="text-xs text-white/30">Total posts</p>
              <p class="text-xl font-bold font-mono text-white">
                {() => (dashboard().stats.data()?.totalPosts ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p class="text-xs text-white/30">Total views</p>
              <p class="text-xl font-bold font-mono text-white">
                {() => (dashboard().stats.data()?.totalViews ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <Btn onClick={() => dashboard().stats.refetch()}>Refetch</Btn>
        </div>
      </div>

      {/* Top posts table */}
      <div class="rounded-lg bg-white/3 border border-white/6 p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-mono text-white/25 uppercase tracking-widest">Top posts</p>
          <Btn onClick={() => dashboard().posts.refetch()}>Refetch</Btn>
        </div>
        <div class="flex flex-col gap-1">
          <For
            values={() => dashboard().posts.data() ?? []}
            fallback={<p class="text-sm text-white/30">Loading…</p>}
          >
            {(post) => (
              <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-white/4 text-sm">
                <span class="text-white/60 truncate mr-3">{() => (post as Post).title}</span>
                <span class="font-mono text-xs text-white/25 shrink-0">
                  {() => (post as Post).views.toLocaleString()} views
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      <p class="text-xs text-white/25 font-mono">
        {() =>
          dashboard().ready
            ? 'All queries resolved — combine aggregates status across all three.'
            : dashboard().anyError
              ? 'One or more queries failed — combine surfaces the error state.'
              : 'Queries are loading — placeholder data keeps the layout stable.'
        }
      </p>
    </Card>
  );
};

export const meta = { id: 'useQueries', label: 'Dashboard (useQueries)' };
