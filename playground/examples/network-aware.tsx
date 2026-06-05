import { $, For } from 'voby';
import { useQuery, onlineManager, focusManager } from 'voby-query';
import { Card, Tag, Btn } from '../src/ui';

type Post = { id: number; title: string };

const now = () => new Date().toLocaleTimeString();

const NetworkStatusBar = () => {
  const online = () => onlineManager.isOnline();
  const focused = () => focusManager.isFocused();

  return (
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div
        class={() =>
          `rounded-lg border px-4 py-3 flex items-center justify-between ${
            online()
              ? 'bg-emerald-400/8 border-emerald-400/20'
              : 'bg-red-400/8 border-red-400/20'
          }`
        }
      >
        <span class="font-mono text-xs text-white/45">onlineManager</span>
        <span
          class={() =>
            `font-mono text-xs font-semibold ${
              online() ? 'text-emerald-400' : 'text-red-400'
            }`
          }
        >
          {() => (online() ? 'ONLINE' : 'OFFLINE')}
        </span>
      </div>
      <div
        class={() =>
          `rounded-lg border px-4 py-3 flex items-center justify-between ${
            focused()
              ? 'bg-sky-400/8 border-sky-400/20'
              : 'bg-amber-400/8 border-amber-400/20'
          }`
        }
      >
        <span class="font-mono text-xs text-white/45">focusManager</span>
        <span
          class={() =>
            `font-mono text-xs font-semibold ${
              focused() ? 'text-sky-400' : 'text-amber-400'
            }`
          }
        >
          {() => (focused() ? 'FOCUSED' : 'BLURRED')}
        </span>
      </div>
    </div>
  );
};

const ManagerControls = () => {
  const setOnline = (v: boolean) => onlineManager.setOnline(v);
  const setFocused = (v: boolean) => focusManager.setFocused(v);

  return (
    <div class="flex flex-wrap gap-2">
      <span class="text-xs text-white/25 font-mono self-center mr-1">online:</span>
      <Btn onClick={() => setOnline(true)}>Set Online</Btn>
      <Btn onClick={() => setOnline(false)}>Set Offline</Btn>
      <span class="text-xs text-white/25 font-mono self-center mx-2">focus:</span>
      <Btn onClick={() => setFocused(true)}>Set Focused</Btn>
      <Btn onClick={() => setFocused(false)}>Set Blurred</Btn>
      <Btn onClick={() => document.dispatchEvent(new Event('visibilitychange'))}>
        Fire visibilitychange
      </Btn>
    </div>
  );
};

export const NetworkAwareDemo = () => {
  const log = $<{ time: string; msg: string }[]>([]);
  const push = (msg: string) => {
    log((items) => [{ time: now(), msg }, ...items].slice(0, 20));
  };

  const slowQuery = useQuery({
    queryKey: ['network-slow'],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    networkMode: 'online',
    queryFn: async ({ signal }) => {
      push('slowQuery: started');
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const timer = setTimeout(resolve, 2000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          push('slowQuery: aborted');
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
      const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=3', { signal });
      push('slowQuery: completed');
      return (await res.json()) as Post[];
    },
  });

  const focusQuery = useQuery({
    queryKey: ['network-focus'],
    staleTime: 0,
    retry: false,
    networkMode: 'online',
    refetchOnWindowFocus: 'always',
    queryFn: async ({ signal }) => {
      push('focusQuery: refetched');
      const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=3', { signal });
      return (await res.json()) as Post[];
    },
  });

  return (
    <div class="flex flex-col gap-4">
      <Card>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-white">Manager State</h2>
        </div>
        <NetworkStatusBar />
        <div>
          <p class="text-xs text-white/25 font-mono mb-2 uppercase tracking-widest">Controls</p>
          <ManagerControls />
        </div>
        <div>
          <p class="text-xs text-white/25 font-mono mb-2 uppercase tracking-widest">Notes</p>
          <ul class="space-y-1 text-xs text-white/40 font-mono">
            <li>• <code class="text-white/60">setOnline(false)</code> pauses queries with <code class="text-white/60">networkMode:'online'</code></li>
            <li>• <code class="text-white/60">setOnline(true)</code> resumes them and triggers refetchOnReconnect</li>
            <li>• <code class="text-white/60">setFocused(true)</code> triggers queries with <code class="text-white/60">refetchOnWindowFocus</code></li>
            <li>• Opening devtools and switching tabs fires real visibilitychange events</li>
          </ul>
        </div>
      </Card>

      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-white">networkMode: 'online'</h2>
            <p class="text-xs text-white/30 mt-0.5">Slow query, paused when offline</p>
          </div>
          <Tag>{() => slowQuery().fetchStatus()}</Tag>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="text-white/30">status:</span>{' '}
            <span class="font-mono text-white/70">{() => slowQuery().status()}</span>
          </div>
          <div>
            <span class="text-white/30">fetchStatus:</span>{' '}
            <span class="font-mono text-white/70">{() => slowQuery().fetchStatus()}</span>
          </div>
        </div>

        <If when={() => slowQuery().isFetching()}>
          <div class="h-2 overflow-hidden rounded-full bg-white/5">
            <div class="h-full w-1/2 animate-pulse rounded-full bg-[#d7fffa]/70" />
          </div>
        </If>

        <div class="flex gap-2">
          <Btn onClick={() => void slowQuery().refetch()}>Refetch</Btn>
        </div>

        <If when={() => slowQuery().data()}>
          <div class="flex flex-col gap-1.5">
            <p class="text-xs text-white/25 font-mono uppercase tracking-widest">Posts</p>
            <For values={() => (slowQuery().data() as Post[] | undefined) ?? []}>
              {(post) => (
                <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                  <p class="text-sm text-white/75">{() => post.title}</p>
                  <p class="text-xs font-mono text-white/25 mt-0.5">id: {() => post.id}</p>
                </div>
              )}
            </For>
          </div>
        </If>
      </Card>

      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-white">refetchOnWindowFocus: 'always'</h2>
            <p class="text-xs text-white/30 mt-0.5">Refetches every time focus is regained</p>
          </div>
          <Tag>{() => focusQuery().fetchStatus()}</Tag>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="text-white/30">status:</span>{' '}
            <span class="font-mono text-white/70">{() => focusQuery().status()}</span>
          </div>
          <div>
            <span class="text-white/30">fetchStatus:</span>{' '}
            <span class="font-mono text-white/70">{() => focusQuery().fetchStatus()}</span>
          </div>
        </div>

        <If when={() => focusQuery().data()}>
          <div class="flex flex-col gap-1.5">
            <p class="text-xs text-white/25 font-mono uppercase tracking-widest">Posts</p>
            <For values={() => (focusQuery().data() as Post[] | undefined) ?? []}>
              {(post) => (
                <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                  <p class="text-sm text-white/75">{() => post.title}</p>
                  <p class="text-xs font-mono text-white/25 mt-0.5">id: {() => post.id}</p>
                </div>
              )}
            </For>
          </div>
        </If>
      </Card>

      <Card>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-white">Event Log</h2>
          <Btn onClick={() => log([])}>Clear</Btn>
        </div>
        <div class="rounded-lg bg-black/30 border border-white/6 p-3 font-mono text-xs flex flex-col gap-1 max-h-36 overflow-y-auto">
          <For values={log} fallback={<p class="text-white/20">No events yet.</p>}>
            {(entry) => (
              <p class="grid grid-cols-[4.5rem_1fr] gap-2">
                <span class="text-white/28">{() => entry.time}</span>
                <span class="text-white/45">{() => entry.msg}</span>
              </p>
            )}
          </For>
        </div>
      </Card>
    </div>
  );
};

export const meta = { id: 'network-aware', label: 'Network & Focus awareness' };
