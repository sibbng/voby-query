import { $, ErrorBoundary, Suspense } from 'voby';
import { useQueryClient, useSuspenseQuery } from 'voby-query';
import { Card, Btn } from '../src/ui';

type Post = { id: number; title: string; userId: number };

const PostList = () => {
  const posts = useSuspenseQuery({
    queryKey: ['suspense-posts'],
    queryFn: async ({ signal }) => {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Post[]>;
    },
    staleTime: 30_000,
  });

  return (
    <div class="flex flex-col gap-1.5">
      <div class="grid grid-cols-3 gap-3 text-sm mb-3">
        <div>
          <p class="text-white/30 text-xs mb-0.5">status</p>
          <p class="font-mono">{() => posts().status()}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">data length</p>
          <p class="font-mono">{() => posts().data().length}</p>
        </div>
        <div>
          <p class="text-white/30 text-xs mb-0.5">fetchStatus</p>
          <p class="font-mono">{() => posts().fetchStatus()}</p>
        </div>
      </div>
      {() =>
        posts().data().map((post) => (
          <div class="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
            <p class="text-sm text-white/80">{post.title}</p>
            <p class="text-xs font-mono text-white/25 mt-0.5">id: {post.id}</p>
          </div>
        ))
      }
    </div>
  );
};

const FailingQuery = () => {
  const query = useSuspenseQuery({
    queryKey: ['suspense-fail'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 1000));
      throw new Error('Simulated server error');
    },
    retry: 0,
  });

  return <p class="text-sm text-white/80">{() => query().data()}</p>;
};

export const SuspenseDemo = () => {
  const queryClient = useQueryClient();
  const showPosts = $(false);
  const showFail = $(false);

  return (
    <Card>
      <div class="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 class="text-base font-semibold text-white">Suspense query</h2>
          <p class="text-xs text-white/40 mt-1">
            Uses Voby's &lt;Suspense&gt; to show a fallback while data loads.
          </p>
        </div>
      </div>

      <div class="flex gap-2 flex-wrap">
        <Btn onClick={() => showPosts((v) => !v)}>
          {() => (showPosts() ? 'Hide posts' : 'Show posts')}
        </Btn>
        {() =>
          showPosts() && (
            <Btn onClick={() => {
              queryClient.cancelQueries({ queryKey: ['suspense-posts'] }, { silent: true, revert: false });
              showPosts(false);
            }}>
              Cancel
            </Btn>
          )
        }
        <Btn onClick={() => showFail((v) => !v)}>
          {() => (showFail() ? 'Hide error demo' : 'Error demo')}
        </Btn>
      </div>

      {() =>
        showPosts() && (
          <Suspense fallback={<div class="text-center py-10 text-white/40">Loading posts...</div>}>
            <PostList />
          </Suspense>
        )
      }

      {() =>
        showFail() && (
          <Suspense fallback={<div class="text-center py-10 text-white/40">Loading error demo...</div>}>
            <ErrorBoundary
              fallback={(props: { error: Error; reset: () => void }) => (
                <div class="text-center py-8 flex flex-col items-center gap-3">
                  <p class="text-sm text-red-400/80">{props.error.message}</p>
                  <Btn onClick={() => { showFail(false); props.reset(); }}>Dismiss</Btn>
                </div>
              )}
            >
              <FailingQuery />
            </ErrorBoundary>
          </Suspense>
        )
      }
    </Card>
  );
};

export const meta = { id: 'suspense', label: 'Suspense query' };
