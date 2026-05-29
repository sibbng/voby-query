import { $, For, If } from 'voby';
import { useMutation } from 'voby-query';
import { Card, Btn, Tag } from '../src/ui';

type Item = { id: number; label: string; done: boolean };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const INITIAL_ITEMS: Item[] = [
  { id: 1, label: 'Deploy to staging', done: false },
  { id: 2, label: 'Write changelog', done: true },
  { id: 3, label: 'Tag the release', done: false },
  { id: 4, label: 'Notify stakeholders', done: false },
];

export const OptimisticDemo = () => {
  const items = $<Item[]>(INITIAL_ITEMS.map((i) => ({ ...i })));
  const failNext = $(false);
  const lastAction = $('Click an item to toggle it.');

  const toggle = useMutation<void, Error, number, Item[]>({
    mutationKey: ['optimistic', 'toggle'],
    mutationFn: async (_id) => {
      await wait(900);
      if (failNext()) {
        failNext(false);
        throw new Error('Server rejected the update');
      }
    },
    onMutate: (id) => {
      const snapshot = items();
      items(items().map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
      lastAction(`Optimistically toggled #${id} — waiting for server…`);
      return snapshot;
    },
    onError: (_err, _id, snapshot) => {
      items(snapshot!);
      lastAction('Rolled back — server rejected the update.');
    },
    onSuccess: (_data, id) => {
      lastAction(`Server confirmed toggle #${id}.`);
    },
  });

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Optimistic updates</h2>
        </div>
        <Tag>{() => toggle().status()}</Tag>
      </div>

      <div class="flex flex-wrap gap-2">
        <Btn onClick={() => failNext((v) => !v)}>
          {() => (failNext() ? '✗ Next will fail' : 'Fail next mutation')}
        </Btn>
      </div>

      <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2 text-xs font-mono text-white/40 min-h-8">
        {lastAction}
      </div>

      <div class="flex flex-col gap-1">
        <For values={items}>
          {(item) => (
            <button
              onClick={() => void toggle().mutate(item.id)}
              disabled={() => toggle().isPending()}
              class={() =>
                `flex items-center gap-3 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                  toggle().isPending()
                    ? 'opacity-60 cursor-not-allowed bg-white/3 border-white/6'
                    : 'cursor-pointer bg-white/3 hover:bg-white/6 border-white/6'
                }`
              }
            >
              <span class="font-mono text-xs text-white/30">{() => (item.done ? '✓' : '○')}</span>
              <span class={() => (item.done ? 'line-through text-white/30' : 'text-white/70')}>
                {() => item.label}
              </span>
            </button>
          )}
        </For>
      </div>

      <If when={() => toggle().isError()}>
        <p class="text-xs text-red-400 font-mono">{() => toggle().error()?.message}</p>
      </If>
    </Card>
  );
};

export const meta = { id: 'optimistic', label: 'Optimistic updates' };
