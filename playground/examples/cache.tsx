import { useQuery } from 'voby-query';
import { Tag, Card, Btn } from '../src/ui';
import { queryClient } from '../src/client';

type Todo = { id: number; title: string; completed: boolean };

export const CacheDemo = () => {
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

export const meta = {
  id: 'cache',
  label: 'Cache inspector',
};
