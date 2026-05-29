import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

type User = { id: number; name: string; email: string };
type Post = { id: number; title: string };

export const DependentDemo = () => {
  const userId = $(1);

  const user = useQuery({
    queryKey: ['dep-user', userId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<User>;
    },
    staleTime: 30_000,
  });

  const posts = useQuery({
    queryKey: ['dep-posts', userId],
    enabled: () => user().isSuccess(),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `https://jsonplaceholder.typicode.com/users/${userId()}/posts?_limit=3`,
        { signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Post[]>;
    },
    staleTime: 30_000,
  });

  return (
    <Card>
      <div>
        <h2 class="text-base font-semibold text-white">Dependent queries</h2>
      </div>

      <div class="flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((id) => (
          <Btn onClick={() => userId(id)}>
            {() => (userId() === id ? `▶ User ${id}` : `User ${id}`)}
          </Btn>
        ))}
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-white/3 border border-white/6 p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-mono text-white/30 uppercase tracking-widest">user</p>
            <Tag>{() => user().fetchStatus()}</Tag>
          </div>
          <If when={() => user().isSuccess()}>
            <p class="text-sm text-white font-medium">{() => user().data()?.name}</p>
            <p class="text-xs font-mono text-white/30">{() => user().data()?.email}</p>
          </If>
          <If when={() => user().isLoading()}>
            <div class="h-8 rounded bg-white/5 animate-pulse" />
          </If>
        </div>

        <div class="rounded-lg bg-white/3 border border-white/6 p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-mono text-white/30 uppercase tracking-widest">posts</p>
            <Tag>{() => posts().fetchStatus()}</Tag>
          </div>
          <If when={() => !user().isSuccess()}>
            <p class="text-xs text-white/20 font-mono italic">Waiting for user…</p>
          </If>
          <If when={() => posts().isLoading() && user().isSuccess()}>
            <div class="h-8 rounded bg-white/5 animate-pulse" />
          </If>
          <If when={() => posts().isSuccess()}>
            <For values={() => posts().data() ?? []}>
              {(post) => (
                <p class="text-xs text-white/60 leading-snug truncate">{() => post.title}</p>
              )}
            </For>
          </If>
        </div>
      </div>

      <p class="text-xs text-white/25 font-mono">
        posts query is <span class="text-white/40">enabled: {'() => user().isSuccess()'}</span>
      </p>
    </Card>
  );
};

export const meta = { id: 'dependent', label: 'Dependent queries' };
