import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Tag } from '../src/ui';

type Post = { id: number; title: string };
type RequestStatus = 'running' | 'aborted' | 'completed' | 'failed';
type LogEntry = {
  id: number;
  requestId: number;
  term: string;
  status: RequestStatus;
  at: string;
};
type CancellationResult = {
  requestId: number;
  term: string;
  posts: Post[];
  startedAt: string;
  finishedAt: string;
};

let logId = 0;
let requestId = 0;

const initialResult: CancellationResult = {
  requestId: 0,
  term: 'none',
  posts: [],
  startedAt: 'not started',
  finishedAt: 'not finished',
};

const now = () => new Date().toLocaleTimeString();

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });

const statusClass = (status: RequestStatus) => {
  if (status === 'aborted') return 'text-orange-400';
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-[#d7fffa]';
};

export const CancellationDemo = () => {
  const draft = $('reactivity');
  const submitted = $('reactivity');
  const log = $<LogEntry[]>([]);

  const pushLog = (entry: Omit<LogEntry, 'id'>) => {
    const id = ++logId;
    log((items) => [{ id, ...entry }, ...items].slice(0, 12));
    return id;
  };

  const updateLog = (id: number, status: RequestStatus) => {
    log((items) =>
      items.map((entry) => (entry.id === id ? { ...entry, status, at: now() } : entry)),
    );
  };

  const request = useQuery({
    queryKey: ['cancellation-demo'],
    initialData: initialResult,
    refetchOnMount: false,
    retry: false,
    staleTime: 'static',
    queryFn: async ({ signal }) => {
      const id = ++requestId;
      const term = submitted().trim() || 'posts';
      const startedAt = now();
      const entryId = pushLog({
        requestId: id,
        term,
        status: 'running',
        at: startedAt,
      });

      const onAbort = () => updateLog(entryId, 'aborted');
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        await wait(2000, signal);

        const response = await fetch(
          `https://jsonplaceholder.typicode.com/posts?title_like=${encodeURIComponent(term)}&_limit=5`,
          { signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const posts = (await response.json()) as Post[];
        const finishedAt = now();
        updateLog(entryId, 'completed');
        return { requestId: id, term, posts, startedAt, finishedAt };
      } catch (error) {
        if (!signal.aborted) updateLog(entryId, 'failed');
        throw error;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
  });

  const run = () => {
    submitted(draft().trim() || 'posts');
    void request().refetch({ cancelRefetch: true });
  };

  const cancel = () => {
    if (request().isFetching()) {
      void request().cancel({ silent: true });
    }
  };

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Query cancellation</h2>
        </div>
        <Tag>{() => request().fetchStatus()}</Tag>
      </div>

      <div class="flex flex-col gap-2">
        <input
          value={draft}
          onInput={(event) => draft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') run();
          }}
          placeholder="Search post titles"
          class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/20"
        />

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            class="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/8 text-white/70 border border-white/10 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
          >
            {() => (request().isFetching() ? 'Abort and restart' : 'Run request')}
          </button>
          <button
            type="button"
            disabled={() => !request().isFetching()}
            onClick={cancel}
            class={() =>
              `px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                request().isFetching()
                  ? 'cursor-pointer bg-orange-400/12 text-orange-200 border-orange-300/20 hover:bg-orange-400/18'
                  : 'cursor-not-allowed bg-white/4 text-white/25 border-white/8'
              }`
            }
          >
            Cancel request
          </button>
          <button
            type="button"
            onClick={() => log([])}
            class="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 text-white/45 border border-white/8 hover:bg-white/8 hover:text-white/70 transition-colors cursor-pointer"
          >
            Clear log
          </button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p class="text-white/30 text-xs mb-0.5">status</p>
          <p class="font-mono">{() => request().status()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">request</p>
          <p class="font-mono">{() => request().data().requestId}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">term</p>
          <p class="font-mono truncate">{() => request().data().term}</p>
        </div>
      </div>

      <If when={() => request().isFetching()}>
        <div class="h-2 overflow-hidden rounded-full bg-white/5">
          <div class="h-full w-1/2 animate-pulse rounded-full bg-[#d7fffa]/70" />
        </div>
      </If>

      <div class="rounded-lg bg-black/30 border border-white/6 p-3 font-mono text-xs flex flex-col gap-1 min-h-[7rem] max-h-44 overflow-y-auto">
        <p class="text-white/25 uppercase tracking-widest mb-1">request log</p>
        <For values={log} fallback={<p class="text-white/20">No requests yet.</p>}>
          {(entry) => (
            <p class="grid grid-cols-[4.5rem_5rem_1fr] gap-2">
              <span class={() => `${statusClass(entry.status)} shrink-0`}>
                {() => entry.status}
              </span>
              <span class="text-white/28">#{() => entry.requestId}</span>
              <span class="min-w-0 truncate text-white/45">
                {() => `"${entry.term}" at ${entry.at}`}
              </span>
            </p>
          )}
        </For>
      </div>

      <If when={() => request().isError()}>
        <div class="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs font-mono">
          <p class="text-red-400">{() => request().error()?.message}</p>
        </div>
      </If>

      <div class="flex flex-col gap-1.5">
        <For
          values={() => request().data().posts}
          fallback={<p class="text-xs text-white/30 font-mono">No completed result.</p>}
        >
          {(post) => (
            <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
              <p class="text-sm text-white/75">{() => post.title}</p>
              <p class="text-xs font-mono text-white/25 mt-0.5">id: {() => post.id}</p>
            </div>
          )}
        </For>
      </div>
    </Card>
  );
};

export const meta = { id: 'cancellation', label: 'Query cancellation' };
