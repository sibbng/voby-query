import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { queryClient } from '../src/client';
import { Card, Tag } from '../src/ui';

type User = { id: number; name: string; email: string; phone: string };

const fetchUser = async (id: number, signal?: AbortSignal): Promise<User> => {
  const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<User>;
};

const USER_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

export const PrefetchDemo = () => {
  const selectedId = $<number | null>(null);
  const prefetched = $(new Set<number>());

  const onHover = (id: number) => {
    if (prefetched().has(id)) return;
    prefetched((s) => new Set([...(s ?? []), id]));
    queryClient.prefetchQuery({
      queryKey: ['pf-user', id],
      queryFn: ({ signal }) => fetchUser(id, signal),
      staleTime: 60_000,
    });
  };

  const detail = useQuery({
    queryKey: ['pf-user', selectedId],
    enabled: () => selectedId() !== null,
    queryFn: ({ signal }) => fetchUser(selectedId()!, signal),
    staleTime: 60_000,
  });

  return (
    <Card>
      <div>
        <h2 class="text-base font-semibold text-white">Prefetching</h2>
      </div>

      <p class="text-xs text-white/30 font-mono">
        Hover a card to prefetch · click to view · green dot = prefetched
      </p>

      <div class="flex flex-wrap gap-2">
        <For values={USER_IDS}>
          {(id) => {
            const isPrefetched = () => prefetched().has(id);
            const isSelected = () => selectedId() === id;
            return (
              <button
                onMouseEnter={() => onHover(id)}
                onClick={() => selectedId(id)}
                class={() =>
                  `relative px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    isSelected()
                      ? 'bg-white/15 text-white border-white/25'
                      : 'bg-white/5 text-white/55 border-white/10 hover:bg-white/10 hover:text-white/80'
                  }`
                }
              >
                User {id}
                <If when={isPrefetched}>
                  <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
                </If>
              </button>
            );
          }}
        </For>
      </div>

      <If when={() => selectedId() !== null}>
        <div class="rounded-lg bg-white/4 border border-white/6 p-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-mono text-white/30 uppercase tracking-widest">detail</p>
            <Tag>{() => detail().fetchStatus()}</Tag>
          </div>
          <If when={() => detail().isSuccess()}>
            <p class="font-semibold text-white">{() => detail().data()?.name}</p>
            <p class="text-xs font-mono text-white/35 mt-0.5">{() => detail().data()?.email}</p>
            <p class="text-xs text-white/40 mt-2">{() => detail().data()?.phone}</p>
          </If>
          <If when={() => detail().isLoading()}>
            <div class="h-14 rounded bg-white/5 animate-pulse" />
          </If>
        </div>
      </If>
    </Card>
  );
};

export const meta = { id: 'prefetch', label: 'Prefetching' };
