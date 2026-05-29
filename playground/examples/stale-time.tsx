import { $, If, useMemo } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

const STALE_OPTIONS = [
  { label: '5 s', ms: 5_000 },
  { label: '15 s', ms: 15_000 },
  { label: '60 s', ms: 60_000 },
  { label: 'static', ms: -1 },
] as const;

export const StaleTimeDemo = () => {
  const staleIdx = $(0);

  const staleOption = useMemo(() => STALE_OPTIONS[staleIdx()]);

  const demo = useQuery({
    queryKey: ['stale-demo', staleIdx],
    queryFn: async () => ({ fetchedAt: Date.now() }),
    staleTime: () => {
      const ms = staleOption().ms;
      return ms === -1 ? 'static' : ms;
    },
    refetchOnWindowFocus: false,
  });

  // Drives a live countdown without extra network requests
  const tick = useQuery({
    queryKey: ['stale-tick'],
    queryFn: async () => Date.now(),
    refetchInterval: 250,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const timeInfo = useMemo(() => {
    const now = tick().data() ?? Date.now();
    if (!demo().isFetched()) return null;
    const fetchedAt = demo().data()?.fetchedAt ?? demo().dataUpdatedAt();
    const staleMs = staleOption().ms;
    if (staleMs === -1) return { elapsed: now - fetchedAt, remaining: null, pct: 0 };
    const elapsed = now - fetchedAt;
    const remaining = Math.max(0, staleMs - elapsed);
    const pct = Math.min(100, (elapsed / staleMs) * 100);
    return { elapsed, remaining, pct };
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Stale time visualizer</h2>
        </div>
        <Tag>{() => (demo().isStale() ? 'stale' : 'fresh')}</Tag>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-xs text-white/30 font-mono">staleTime:</span>
        {STALE_OPTIONS.map((opt, i) => (
          <Btn onClick={() => staleIdx(i)}>
            {() => (staleIdx() === i ? `▶ ${opt.label}` : opt.label)}
          </Btn>
        ))}
        <Btn onClick={() => demo().refetch()}>Refetch</Btn>
      </div>

      <If when={() => demo().isFetched()}>
        <If when={() => staleOption().ms !== -1}>
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-mono text-white/30">
              <span>fresh</span>
              <span>{() => `${((timeInfo()?.remaining ?? 0) / 1000).toFixed(1)}s remaining`}</span>
              <span>stale</span>
            </div>
            <div class="h-2 rounded-full bg-white/8 overflow-hidden">
              <div
                class={() =>
                  `h-full rounded-full transition-all duration-200 ${demo().isStale() ? 'bg-orange-400/70' : 'bg-emerald-400/70'}`
                }
                style={() => `width: ${timeInfo()?.pct ?? 0}%`}
              />
            </div>
          </div>
        </If>

        <div class="rounded-lg bg-white/4 border border-white/6 p-4 font-mono text-sm flex flex-col gap-2">
          <div class="flex justify-between">
            <span class="text-white/30">fetched at</span>
            <span class="text-white/60">
              {() => {
                const at = demo().data()?.fetchedAt;
                return at ? new Date(at).toLocaleTimeString() : '—';
              }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-white/30">elapsed</span>
            <span class="text-white/60">
              {() => `${((timeInfo()?.elapsed ?? 0) / 1000).toFixed(1)}s`}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-white/30">isStale</span>
            <span class={() => (demo().isStale() ? 'text-orange-400' : 'text-emerald-400')}>
              {() => String(demo().isStale())}
            </span>
          </div>
        </div>
      </If>

      <If when={() => demo().isLoading()}>
        <div class="h-20 rounded-lg bg-white/5 animate-pulse" />
      </If>
    </Card>
  );
};

export const meta = { id: 'stale-time', label: 'Stale time visualizer' };
