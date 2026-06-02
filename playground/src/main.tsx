import { $, For, render } from 'voby';
import { QueryClientProvider } from 'voby-query';
import './styles.css';
import { queryClient } from './client';
import { ProfileDemo, meta as profileMeta } from '../examples/profile';
import { TodosDemo, meta as todosMeta } from '../examples/todos';
import { CacheDemo, meta as cacheMeta } from '../examples/cache';
import { BasicQueryDemo, meta as basicQueryMeta } from '../examples/basic-query';
import { OptimisticDemo, meta as optimisticMeta } from '../examples/optimistic';
import { DependentDemo, meta as dependentMeta } from '../examples/dependent';
import { ParallelDemo, meta as parallelMeta } from '../examples/parallel';
import { PrefetchDemo, meta as prefetchMeta } from '../examples/prefetch';
import { CancellationDemo, meta as cancellationMeta } from '../examples/cancellation';
import { SelectDemo, meta as selectMeta } from '../examples/select';
import { StaleTimeDemo, meta as staleTimeMeta } from '../examples/stale-time';
import { IsFetchingDemo, meta as isFetchingMeta } from '../examples/is-fetching';
import { SuspenseDemo, meta as suspenseMeta } from '../examples/suspense';
import { InfiniteQueryDemo, meta as infiniteQueryMeta } from '../examples/infinite-query';
import {
  SuspenseInfiniteQueryDemo,
  meta as suspInfQueryMeta,
} from '../examples/suspense-infinite-query';
import { DebugPanel, type DebugScope } from './debug-panel';

const SESSION_KEY = 'voby-query-playground-example';

type ExampleMeta = { id: string; label: string };
type Example = ExampleMeta & { component: () => JSX.Element; debug: DebugScope };

const examples: Example[] = [
  {
    ...basicQueryMeta,
    component: BasicQueryDemo,
    debug: {
      queryPrefixes: [['basic-posts']],
      note: 'Tracks the single reactive post query used by this example.',
    },
  },
  {
    ...profileMeta,
    component: ProfileDemo,
    debug: {
      queryPrefixes: [['profile']],
      note: 'Filters down to the profile query keyed by the selected user id.',
    },
  },
  {
    ...dependentMeta,
    component: DependentDemo,
    debug: {
      queryPrefixes: [['dep-user'], ['dep-posts']],
      note: 'Shows both the source query and the dependent posts query for the current user id.',
    },
  },
  {
    ...parallelMeta,
    component: ParallelDemo,
    debug: {
      queryPrefixes: [['par-users'], ['par-posts'], ['par-todos']],
      note: 'Parallel queries stay grouped together so fetch timing and staleness are easy to compare.',
    },
  },
  {
    ...selectMeta,
    component: SelectDemo,
    debug: {
      queryPrefixes: [['select-users']],
      note: 'Both raw and selected observers share the same cache entry here.',
    },
  },
  {
    ...staleTimeMeta,
    component: StaleTimeDemo,
    debug: {
      queryPrefixes: [['stale-demo'], ['stale-tick']],
      note: 'Pairs the sampled query with the ticking helper query that demonstrates staleness over time.',
    },
  },
  {
    ...todosMeta,
    component: TodosDemo,
    debug: {
      queryPrefixes: [['todos']],
      mutationPrefixes: [['todos']],
      note: 'Includes the todos query plus add and toggle mutations so invalidation effects stay visible.',
    },
  },
  {
    ...optimisticMeta,
    component: OptimisticDemo,
    debug: {
      mutationPrefixes: [['optimistic']],
      note: 'Focused on the optimistic toggle mutation and its rollback cycle.',
    },
  },
  {
    ...prefetchMeta,
    component: PrefetchDemo,
    debug: {
      queryPrefixes: [['pf-user']],
      note: 'Prefetched and selected profile queries share the same prefix for cache inspection.',
    },
  },
  {
    ...cancellationMeta,
    component: CancellationDemo,
    debug: {
      queryPrefixes: [['cancellation-demo']],
      note: 'Shows the single abortable query used by the cancellation controls.',
    },
  },
  {
    ...cacheMeta,
    component: CacheDemo,
    debug: {
      includeAllQueries: true,
      note: 'This example samples the whole client, so the panel switches to the full query cache in example mode.',
    },
  },
  {
    ...isFetchingMeta,
    component: IsFetchingDemo,
    debug: {
      queryPrefixes: [['fetch-slow']],
      note: 'Tracks all simulated fetch queries used by this example.',
    },
  },
  {
    ...suspenseMeta,
    component: SuspenseDemo,
    debug: {
      queryPrefixes: [['suspense-posts']],
      note: 'Uses useSuspenseQuery inside a Voby <Suspense> boundary with a spinner fallback.',
    },
  },
  {
    ...infiniteQueryMeta,
    component: InfiniteQueryDemo,
    debug: {
      queryPrefixes: [['inf-posts']],
      note: 'Paginated posts loaded with useInfiniteQuery; each page is a separate request.',
    },
  },
  {
    ...suspInfQueryMeta,
    component: SuspenseInfiniteQueryDemo,
    debug: {
      queryPrefixes: [['susp-inf-posts']],
      note: 'Paginated posts with useSuspenseInfiniteQuery inside a Suspense boundary.',
    },
  },
];

const getInitialExample = () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  return examples.find((e) => e.id === saved) ?? examples[0];
};

const Sidebar = ({
  active,
  onSelect,
}: {
  active: () => Example;
  onSelect: (e: Example) => void;
}) => (
  <aside class="w-52 shrink-0 border-r border-white/8 flex flex-col">
    <div class="px-4 py-4 border-b border-white/8">
      <p class="text-xs font-mono text-white/25 uppercase tracking-widest mb-0.5">voby-query</p>
      <p class="text-sm font-semibold text-white">Playground</p>
    </div>
    <nav class="flex-1 overflow-y-auto py-2 px-2">
      <For values={examples}>
        {(example) => {
          const isActive = () => active().id === example.id;
          return (
            <button
              onClick={() => onSelect(example)}
              class={() =>
                `w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer mb-0.5 ${
                  isActive()
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/5'
                }`
              }
            >
              {example.label}
            </button>
          );
        }}
      </For>
    </nav>
  </aside>
);

const App = () => {
  const active = $(getInitialExample());

  const select = (example: Example) => {
    sessionStorage.setItem(SESSION_KEY, example.id);
    active(example);
  };

  return (
    <QueryClientProvider value={queryClient}>
      <div class="flex h-screen bg-bg text-white antialiased overflow-hidden">
        <Sidebar active={active} onSelect={select} />
        <main class="flex-1 overflow-y-auto pt-94 md:pt-0 md:pr-100">
          <div class="max-w-xl mx-auto px-8 py-10">
            <header class="mb-8">
              <h1 class="text-lg font-semibold text-white">{() => active().label}</h1>
            </header>
            {() => {
              const Component = active().component;
              return <Component />;
            }}
          </div>
        </main>
        <DebugPanel active={active} />
      </div>
    </QueryClientProvider>
  );
};

render(<App />, document.querySelector('#app')!);
