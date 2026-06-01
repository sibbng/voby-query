import { $ } from 'voby';
import { useQuery } from 'voby-query';
import { Tag, Card, Btn } from '../src/ui';

type Profile = { id: number; name: string; handle: string; bio: string };

const PROFILES: Profile[] = [
  {
    id: 1,
    name: 'Ada Lovelace',
    handle: '@ada',
    bio: 'Drives architecture and roadmap decisions.',
  },
  {
    id: 2,
    name: 'Grace Hopper',
    handle: '@grace',
    bio: 'Keeps delivery predictable and observable.',
  },
  {
    id: 3,
    name: 'Margaret Hamilton',
    handle: '@margaret',
    bio: 'Turns edge cases into boring incidents.',
  },
];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const profileApi = {
  async get(id: number, signal?: AbortSignal) {
    await wait(350, signal);
    const p = PROFILES.find((x) => x.id === id);
    if (!p) throw new Error(`Profile ${id} not found`);
    return { ...p, fetchedAt: new Date().toLocaleTimeString() };
  },
};

export const ProfileDemo = () => {
  const id = $(1);
  const enabled = $(true);

  const profile = useQuery({
    queryKey: ['profile', id],
    enabled,
    placeholderData: {
      id: 0,
      name: '—',
      handle: '—',
      bio: 'Enable the query to load.',
      fetchedAt: '—',
    },
    queryFn: ({ signal }) => profileApi.get(id(), signal),
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Reactive query key</h2>
          <p class="text-sm text-white/40 mt-0.5">
            Observable key — query re-runs when it changes.
          </p>
        </div>
        <Tag>{() => profile().fetchStatus()}</Tag>
      </div>

      <div class="flex flex-wrap gap-2">
        <Btn onClick={() => id((n) => (n % PROFILES.length) + 1)}>Next profile</Btn>
        <Btn onClick={() => enabled((v) => !v)}>{() => (enabled() ? 'Disable' : 'Enable')}</Btn>
        <Btn onClick={() => profile().refetch()}>Refetch</Btn>
      </div>

      <div class="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p class="text-white/30 text-xs mb-0.5">id</p>
          <p class="font-mono">{id}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">status</p>
          <p class="font-mono">{() => profile().status()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">fetched at</p>
          <p class="font-mono">{() => profile().data()?.fetchedAt}</p>
        </div>
      </div>

      <div class="rounded-lg bg-white/4 border border-white/6 p-4">
        <p class="font-semibold text-white">{() => profile().data()?.name}</p>
        <p class="text-xs font-mono text-white/30 mt-0.5">{() => profile().data()?.handle}</p>
        <p class="text-sm text-white/50 mt-2">{() => profile().data()?.bio}</p>
      </div>
    </Card>
  );
};

export const meta = {
  id: 'profile',
  label: 'Reactive query key',
};
