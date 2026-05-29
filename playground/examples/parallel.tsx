import { useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

const fetchCount = async (resource: string, signal: AbortSignal): Promise<number> => {
  const res = await fetch(`https://jsonplaceholder.typicode.com/${resource}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as unknown[];
  return data.length;
};

const StatWidget = ({
  label,
  count,
  status,
  onRefetch,
}: {
  label: string;
  count: () => number | undefined;
  status: () => string;
  onRefetch: () => void;
}) => (
  <div class="rounded-lg bg-white/3 border border-white/6 p-4 flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <p class="text-xs font-mono text-white/30 uppercase tracking-widest">{label}</p>
      <Tag>{status}</Tag>
    </div>
    <p class="text-4xl font-bold font-mono text-white">{() => count() ?? '—'}</p>
    <Btn onClick={onRefetch}>Refetch</Btn>
  </div>
);

export const ParallelDemo = () => {
  const users = useQuery({
    queryKey: ['par-users'],
    queryFn: ({ signal }) => fetchCount('users', signal),
    staleTime: 30_000,
  });

  const posts = useQuery({
    queryKey: ['par-posts'],
    queryFn: ({ signal }) => fetchCount('posts', signal),
    staleTime: 30_000,
  });

  const todos = useQuery({
    queryKey: ['par-todos'],
    queryFn: ({ signal }) => fetchCount('todos', signal),
    staleTime: 30_000,
  });

  return (
    <Card>
      <div>
        <h2 class="text-base font-semibold text-white">Parallel queries</h2>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <StatWidget
          label="users"
          count={() => users().data()}
          status={() => users().fetchStatus()}
          onRefetch={() => users().refetch()}
        />
        <StatWidget
          label="posts"
          count={() => posts().data()}
          status={() => posts().fetchStatus()}
          onRefetch={() => posts().refetch()}
        />
        <StatWidget
          label="todos"
          count={() => todos().data()}
          status={() => todos().fetchStatus()}
          onRefetch={() => todos().refetch()}
        />
      </div>

      <p class="text-xs text-white/25 font-mono">
        Three <code class="text-white/40">useQuery</code> calls fire simultaneously on mount.
      </p>
    </Card>
  );
};

export const meta = { id: 'parallel', label: 'Parallel queries' };
