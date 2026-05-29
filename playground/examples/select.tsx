import { $, For, If } from 'voby';
import { useQuery } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  website: string;
  address: { city: string };
  company: { name: string };
};

type Derived = { id: number; name: string; city: string };

export const SelectDemo = () => {
  const showRaw = $(false);

  // Raw query — all fields
  const raw = useQuery({
    queryKey: ['select-users'],
    queryFn: async ({ signal }) => {
      const res = await fetch('https://jsonplaceholder.typicode.com/users', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<User[]>;
    },
    staleTime: 60_000,
  });

  // Same cache key, but select extracts only what the component needs
  const derived = useQuery({
    queryKey: ['select-users'],
    queryFn: async ({ signal }) => {
      const res = await fetch('https://jsonplaceholder.typicode.com/users', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<User[]>;
    },
    select: (users): Derived[] =>
      users
        .map((u) => ({ id: u.id, name: u.name, city: u.address.city }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    staleTime: 60_000,
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Query selectors</h2>
        </div>
        <Tag>{() => raw().fetchStatus()}</Tag>
      </div>

      <div class="flex gap-2">
        <Btn onClick={() => showRaw((v) => !v)}>
          {() => (showRaw() ? 'Show selected' : 'Show raw')}
        </Btn>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <p class="text-white/25 uppercase tracking-widest mb-2">queryFn shape</p>
          <div class="rounded-lg bg-white/3 border border-white/6 p-3 text-white/35 leading-relaxed whitespace-pre">{`id, name, username\nemail, phone, website\naddress { … }\ncompany { … }`}</div>
          <p class="text-white/20 mt-1.5">8 fields per user</p>
        </div>

        <div>
          <p class="text-white/25 uppercase tracking-widest mb-2">
            {() => (showRaw() ? 'raw data' : 'after select')}
          </p>

          <If when={() => raw().isLoading()}>
            <div class="h-24 rounded-lg bg-white/5 animate-pulse" />
          </If>

          <If when={() => raw().isSuccess()}>
            <div class="rounded-lg bg-white/3 border border-white/6 p-3 flex flex-col gap-1 max-h-52 overflow-y-auto">
              <If when={showRaw}>
                <For values={() => raw().data() ?? []}>
                  {(user) => (
                    <p class="text-white/45 truncate">
                      <span class="text-white/65">{() => user.name}</span>
                      <span class="text-white/20"> · {() => user.email}</span>
                    </p>
                  )}
                </For>
              </If>
              <If when={() => !showRaw()}>
                <For values={() => derived().data() ?? []}>
                  {(user) => (
                    <p>
                      <span class="text-emerald-400/80">{() => user.name}</span>
                      <span class="text-white/25"> · {() => user.city}</span>
                    </p>
                  )}
                </For>
              </If>
            </div>
          </If>
        </div>
      </div>

      <p class="text-xs text-white/25 font-mono">
        One network request · two views · select runs on the cached data
      </p>
    </Card>
  );
};

export const meta = { id: 'select', label: 'Query selectors' };
