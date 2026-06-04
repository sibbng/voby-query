import { $, For, If } from 'voby';
import { useIsFetching, useIsMutating, useMutation, useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

const endpoints = [
  { key: 'c', delay: 800, label: '800ms', group: 'fast' },
  { key: 'b', delay: 2500, label: '2.5s', group: 'slow' },
  { key: 'a', delay: 5000, label: '5s', group: 'slow' },
] as const;

// Module-level counter so it survives navigation
const tick = $<Record<string, number>>({});

export const IsFetchingDemo = () => {
  const allFetching = useIsFetching();
  const slowFetching = useIsFetching({ filters: { queryKey: ['slow'] } });
  const fastFetching = useIsFetching({ filters: { queryKey: ['fast'] } });

  const launch = (key: string) => {
    tick((prev) => ({ ...prev, [key]: prev[key] ? prev[key] + 1 : 1 }));
  };

  return (
    <>
      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-white">useIsFetching</h2>
            <p class="text-sm text-white/40 mt-0.5">
              Each click launches a simulated fetch. The counters update reactively.
            </p>
          </div>
          <Tag>{() => `${allFetching()} active`}</Tag>
        </div>

        <div class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p class="text-white/30 text-xs mb-0.5">All queries</p>
            <p class="font-mono text-2xl font-bold text-[#d7fffa]">{() => allFetching()}</p>
          </div>
          <div>
            <p class="text-white/30 text-xs mb-0.5">Fast queries</p>
            <p class="font-mono text-2xl font-bold text-[#d7fffa]">{() => fastFetching()}</p>
          </div>
          <div>
            <p class="text-white/30 text-xs mb-0.5">Slow queries (≥2.5s)</p>
            <p class="font-mono text-2xl font-bold text-[#d7fffa]">{() => slowFetching()}</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <For values={endpoints}>
            {(ep) => <Btn onClick={() => launch(ep.key)}>Fetch {ep.label}</Btn>}
          </For>
        </div>
      </Card>

      <div class="flex flex-col gap-3 mt-4">
        <For values={endpoints}>
          {(ep) => (
            <QueryItem
              name={ep.key}
              delay={ep.delay}
              label={ep.label}
              tick={() => tick()[ep.key] ?? 0}
              group={ep.group}
            />
          )}
        </For>
      </div>

      <div class="mt-10">
        <MutateDemo />
      </div>

      <div class="mt-10">
        <PostDemo />
      </div>
    </>
  );
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

const QueryItem = ({
  name,
  delay,
  label,
  tick,
  group,
}: {
  name: string;
  delay: number;
  label: string;
  tick: () => number;
  group: string;
}) => {
  const inFlight = useIsFetching({ filters: { queryKey: [group, name] } });
  const query = useQuery({
    queryKey: [group, name, tick],
    queryFn: async ({ signal }) => {
      await wait(delay, signal);
      return `Done in ${label}`;
    },
    staleTime: 30_000,
  });

  return (
    <div
      class={() =>
        `rounded-xl border p-4 flex items-center justify-between gap-3 ${
          tick() > 0 && (query().isFetching() || query().isLoading())
            ? 'bg-cyan-500/10 border-cyan-500/30'
            : 'border-white/8 bg-[#111]'
        }`
      }
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-white min-w-12">{name}</span>
        <If when={() => inFlight() > 0}>
          <span class="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold">
            {() => inFlight()}
          </span>
        </If>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-white/40 font-mono">{label}</span>
        <Tag>{() => (tick() > 0 ? query().fetchStatus() : 'idle')}</Tag>
        <If when={() => tick() > 0 && query().isSuccess()}>
          <span class="text-xs text-white/50 font-mono">{() => query().data() as string}</span>
        </If>
      </div>
    </div>
  );
};

// ─── Mutations ───────────────────────────────────────────────

const MutateDemo = () => {
  const isMutating = useIsMutating();
  const slowMutating = useIsMutating({ filters: { mutationKey: ['mutate-slow'] } });

  const fast = useMutation<string, Error, void>({
    mutationKey: ['mutate-fast'],
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 'Fast done';
    },
  });

  const slow = useMutation<string, Error, void>({
    mutationKey: ['mutate-slow'],
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 3000));
      return 'Slow done';
    },
  });

  return (
    <>
      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-white">useIsMutating</h2>
            <p class="text-sm text-white/40 mt-0.5">
              Mutations set status to <em>pending</em> while in flight. The counter reacts to status
              changes.
            </p>
          </div>
          <Tag>{() => `${isMutating()} pending`}</Tag>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-white/30 text-xs mb-0.5">All mutations</p>
            <p class="font-mono text-2xl font-bold text-[#f0c77d]">{() => isMutating()}</p>
          </div>
          <div>
            <p class="text-white/30 text-xs mb-0.5">Slow mutations (3s)</p>
            <p class="font-mono text-2xl font-bold text-[#f0c77d]">{() => slowMutating()}</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Btn onClick={() => fast().mutate()}>Fast (100ms)</Btn>
          <Btn onClick={() => slow().mutate()}>Slow (3s)</Btn>
        </div>
      </Card>

      <div class="flex flex-col gap-2 mt-4 text-sm">
        <p class="text-xs text-white/30 font-mono uppercase tracking-widest">Status</p>
        <div class="flex items-center gap-4">
          <Tag>fast: {() => fast().status()}</Tag>
          <Tag>slow: {() => slow().status()}</Tag>
        </div>
      </div>
    </>
  );
};

// ─── Partial key matching ────────────────────────────────────

const postIds = [1, 2, 3] as const;

const PostDemo = () => {
  const allPostsFetching = useIsFetching({ filters: { queryKey: ['post'] } });

  return (
    <>
      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-white">Partial key matching</h2>
            <p class="text-sm text-white/40 mt-0.5">
              Queries with keys <code>['post', 1]</code>, <code>['post', 2]</code>,{' '}
              <code>['post', 3]</code> are all matched by filter <code>queryKey: ['post']</code>.
            </p>
          </div>
          <Tag>{() => `${allPostsFetching()} fetching`}</Tag>
        </div>

        <p class="text-sm font-mono font-bold text-[#d7fffa]">
          posts counter: {() => allPostsFetching()}
        </p>
      </Card>

      <div class="flex flex-col gap-2 mt-4">
        <For values={postIds}>{(id) => <PostItem id={id} />}</For>
      </div>
    </>
  );
};

const PostItem = ({ id }: { id: number }) => {
  const fetchId = $<number>(0);
  const query = useQuery({
    queryKey: ['post', id, () => fetchId()],
    queryFn: async ({ signal }) => {
      await wait(1000 + id * 200, signal);
      return `Post #${id}`;
    },
    staleTime: 30_000,
  });

  return (
    <div
      class={() =>
        `rounded-xl border p-4 flex items-center justify-between gap-3 ${
          fetchId() > 0 && (query().isFetching() || query().isLoading())
            ? 'bg-cyan-500/10 border-cyan-500/30'
            : 'border-white/8 bg-[#111]'
        }`
      }
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-white">Post #{id}</span>
        <span class="text-xs text-white/40 font-mono">['post', {id}]</span>
      </div>
      <div class="flex items-center gap-3">
        <Btn onClick={() => fetchId((p) => p + 1)}>Fetch</Btn>
        <Tag>{() => (fetchId() > 0 ? query().fetchStatus() : 'idle')}</Tag>
        <If when={() => fetchId() > 0 && query().isSuccess()}>
          <span class="text-xs text-white/50 font-mono">{() => query().data() as string}</span>
        </If>
      </div>
    </div>
  );
};

export const meta = { id: 'is-fetching', label: 'useIsFetching' };
