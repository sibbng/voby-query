import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

type Post = { id: number; title: string; userId: number };

export const BasicQueryDemo = () => {
  const broken = $(false);

  const posts = useQuery({
    queryKey: ['basic-posts', broken],
    queryFn: async ({ signal }) => {
      const url = broken()
        ? 'https://jsonplaceholder.typicode.com/nonexistent-404'
        : 'https://jsonplaceholder.typicode.com/posts?_limit=5';
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Post[]>;
    },
    retry: 2,
    retryDelay: (attempt) => attempt * 700,
    staleTime: 15_000,
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Basic query fetching</h2>
        </div>
        <Tag>{() => posts().fetchStatus()}</Tag>
      </div>

      <div class="flex flex-wrap gap-2">
        <Btn onClick={() => broken((v) => !v)}>{() => (broken() ? '✓ Fix URL' : 'Break URL')}</Btn>
        <Btn onClick={() => posts().refetch()}>Refetch</Btn>
      </div>

      <div class="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p class="text-white/30 text-xs mb-0.5">status</p>
          <p class="font-mono">{() => posts().status()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">retries</p>
          <p class="font-mono">{() => posts().errorUpdateCount()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">stale</p>
          <p class="font-mono">{() => String(posts().isStale())}</p>
        </div>
      </div>

      <If when={() => posts().isError()}>
        <div class="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs font-mono">
          <p class="text-red-400">{() => (posts().error() as Error)?.message}</p>
          <p class="text-white/30 mt-1">
            Gave up after {() => posts().errorUpdateCount()} retries.
          </p>
        </div>
      </If>

      <If when={() => posts().isLoading()}>
        <div class="flex flex-col gap-2">
          {([0, 1, 2] as const).map(() => (
            <div class="h-10 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      </If>

      <If when={() => posts().isSuccess()}>
        <div class="flex flex-col gap-1.5">
          <For values={() => posts().data() ?? []}>
            {(post) => (
              <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                <p class="text-sm text-white/80">{() => post.title}</p>
                <p class="text-xs font-mono text-white/25 mt-0.5">id: {() => post.id}</p>
              </div>
            )}
          </For>
        </div>
      </If>
    </Card>
  );
};

export const meta = { id: 'basic-query', label: 'Basic query fetching' };
