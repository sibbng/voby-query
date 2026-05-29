import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Tag } from '../src/ui';

type Post = { id: number; title: string };
type LogEntry = { id: number; term: string; outcome: 'fetching' | 'aborted' | 'done' };

let _logId = 0;

export const CancellationDemo = () => {
  const search = $('');
  const log = $<LogEntry[]>([]);

  const results = useQuery({
    queryKey: ['cancellation-search', search],
    enabled: () => search().trim().length > 0,
    queryFn: async ({ signal }) => {
      const term = search().trim();
      const entryId = ++_logId;
      log((l) => [{ id: entryId, term, outcome: 'fetching' as const }, ...l].slice(0, 10));

      signal.addEventListener('abort', () => {
        log((l) => l.map((e) => (e.id === entryId ? { ...e, outcome: 'aborted' as const } : e)));
      });

      const res = await fetch(
        `https://jsonplaceholder.typicode.com/posts?title_like=${encodeURIComponent(term)}&_limit=4`,
        { signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Post[];
      log((l) => l.map((e) => (e.id === entryId ? { ...e, outcome: 'done' } : e)));
      return data;
    },
    staleTime: 10_000,
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Query cancellation</h2>
        </div>
        <Tag>{() => results().fetchStatus()}</Tag>
      </div>

      <input
        value={search}
        onInput={(e) => search(e.currentTarget.value)}
        placeholder="Type to search posts…"
        class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/20"
      />

      <div class="rounded-lg bg-black/30 border border-white/6 p-3 font-mono text-xs flex flex-col gap-0.5 min-h-[6rem] max-h-40 overflow-y-auto">
        <p class="text-white/25 uppercase tracking-widest mb-1">request log</p>
        <For values={log} fallback={<p class="text-white/20">Type something to start…</p>}>
          {(entry) => (
            <p class="flex gap-2">
              <span
                class={() =>
                  entry.outcome === 'aborted'
                    ? 'text-orange-400 w-14 shrink-0'
                    : entry.outcome === 'done'
                      ? 'text-emerald-400 w-14 shrink-0'
                      : 'text-white/35 w-14 shrink-0'
                }
              >
                {() => entry.outcome}
              </span>
              <span class="text-white/45 truncate">{() => `"${entry.term}"`}</span>
            </p>
          )}
        </For>
      </div>

      <If when={() => results().isSuccess()}>
        <div class="flex flex-col gap-1.5">
          <For
            values={() => results().data() ?? []}
            fallback={<p class="text-xs text-white/30 font-mono">No results.</p>}
          >
            {(post) => (
              <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                <p class="text-sm text-white/75">{() => post.title}</p>
              </div>
            )}
          </For>
        </div>
      </If>
    </Card>
  );
};

export const meta = { id: 'cancellation', label: 'Query cancellation' };
