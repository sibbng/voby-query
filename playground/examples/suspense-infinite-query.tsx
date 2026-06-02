import { $, If, Suspense } from 'voby';
import { useSuspenseInfiniteQuery } from 'voby-query';
import { Card, Btn } from '../src/ui';

type Post = { id: number; title: string };

const PAGE_SIZE = 5;

const PostList = () => {
  const query = useSuspenseInfiniteQuery<Post[], Error, ['susp-inf-posts'], number>({
    queryKey: ['susp-inf-posts'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `https://jsonplaceholder.typicode.com/posts?_page=${pageParam}&_limit=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Post[]>;
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.length === PAGE_SIZE ? lastPageParam + 1 : undefined;
    },
    getPreviousPageParam: (_firstPage, _allPages, firstPageParam) => {
      return firstPageParam > 1 ? firstPageParam - 1 : undefined;
    },
    staleTime: 30_000,
  });

  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p class="text-white/30 text-xs mb-0.5">pages loaded</p>
          <p class="font-mono">{() => query().data()?.pages.length ?? 0}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">total items</p>
          <p class="font-mono">
            {() =>
              query()
                .data()
                ?.pages.reduce((sum, p) => sum + p.length, 0) ?? 0
            }
          </p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">has next</p>
          <p class="font-mono">{() => String(query().hasNextPage())}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Btn onClick={() => query().fetchNextPage()}>
          {() => (query().isFetchingNextPage() ? 'Loading...' : 'Load next page')}
        </Btn>
        <Btn onClick={() => query().fetchPreviousPage()}>
          {() => (query().isFetchingPreviousPage() ? 'Loading...' : 'Load previous page')}
        </Btn>
      </div>

      <If when={() => query().isFetchingNextPage()}>
        <div class="h-2 rounded-full bg-white/5 overflow-hidden">
          <div class="h-full w-1/2 animate-pulse rounded-full bg-[#d7fffa]/70" />
        </div>
      </If>

      <div class="flex items-center gap-2 text-xs font-mono text-white/25 mb-1">
        <span>page {() => (query().data()?.pageParams as number[])?.join(' · ')}</span>
      </div>

      {() => {
        const data = query().data();
        if (!data) return null;
        return data.pages.flatMap((page, pIdx) => [
          <p class="text-[0.65rem] uppercase tracking-widest text-white/15 font-mono mb-1">
            Page {(data.pageParams as number[])?.[pIdx] ?? pIdx + 1}
          </p>,
          ...page.map((post) => (
            <div class="flex flex-col gap-1">
              <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                <p class="text-sm text-white/80">{post.title}</p>
                <p class="text-xs font-mono text-white/25 mt-0.5">id: {post.id}</p>
              </div>
            </div>
          )),
        ]);
      }}
    </div>
  );
};

export const SuspenseInfiniteQueryDemo = () => {
  const show = $(false);

  return (
    <Card>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-white">Suspense infinite query</h2>
          <p class="text-xs text-white/40 mt-1">
            Uses Voby's &lt;Suspense&gt; with paginated data via useSuspenseInfiniteQuery.
          </p>
        </div>
      </div>

      <Btn onClick={() => show((v) => !v)}>{() => (show() ? 'Hide' : 'Show paginated posts')}</Btn>

      {() =>
        show() && (
          <Suspense
            fallback={
              <div class="flex flex-col gap-2 py-6">
                <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div class="h-full w-1/3 animate-pulse rounded-full bg-[#d7fffa]/70" />
                </div>
                {([0, 1, 2] as const).map(() => (
                  <div class="h-14 rounded-lg bg-white/5 animate-pulse" />
                ))}
              </div>
            }
          >
            <PostList />
          </Suspense>
        )
      }
    </Card>
  );
};

export const meta = { id: 'suspense-infinite-query', label: 'Suspense infinite' };
