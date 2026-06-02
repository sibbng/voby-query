import { expect, test } from 'vite-plus/test';
import { flush, render } from './utils';
import { waitFor } from '@testing-library/dom';
import { createQueryClient, useIsMutating } from '../src';
import { useMutation } from '../src/useMutation';
import { QueryClientProvider } from '../src/context';

test('returns 0 when no mutations are pending', async () => {
  const queryClient = createQueryClient();

  function TestComponent() {
    const isMutating = useIsMutating();
    return <div>{() => isMutating()}</div>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toBe('0');
});

test('tracks pending mutations reactively', async () => {
  const queryClient = createQueryClient();
  let resolveMutate: (value: string) => void = () => {};
  let mutationApi: any;

  function TestComponent() {
    const isMutating = useIsMutating();
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['reactive-test'],
      mutationFn: async () => {
        return new Promise<string>((resolve) => {
          resolveMutate = resolve;
        });
      },
    });
    mutationApi = mutation;
    return (
      <div>
        <span>{() => isMutating()}</span>
        <span>{() => mutation().status()}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toContain('0');

  const promise = mutationApi().mutate('test');

  await waitFor(() => expect(document.body.textContent).toContain('1'));

  resolveMutate('done');
  await promise;
  await flush();
  expect(document.body.textContent).toContain('0');
});

test('filters by mutationKey', async () => {
  const queryClient = createQueryClient();
  let resolveA: (value: string) => void = () => {};
  let mutationApi: any;

  function TestComponent() {
    const aMutating = useIsMutating({ filters: { mutationKey: ['a'] } });
    const bMutating = useIsMutating({ filters: { mutationKey: ['b'] } });

    const mutationA = useMutation<string, Error, string>({
      mutationKey: ['a'],
      mutationFn: async () => {
        return new Promise<string>((resolve) => {
          resolveA = resolve;
        });
      },
    });
    const mutationB = useMutation<string, Error, string>({
      mutationKey: ['b'],
      mutationFn: async () => {
        return new Promise<string>(() => {});
      },
    });
    mutationApi = mutationA;

    return (
      <div>
        <span>A: {() => aMutating()}</span>
        <span>B: {() => bMutating()}</span>
        <span>{() => mutationA().status()}</span>
        <span>{() => mutationB().status()}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toContain('A: 0');
  expect(document.body.textContent).toContain('B: 0');

  const pA = mutationApi().mutate('a');
  await waitFor(() => expect(document.body.textContent).toContain('A: 1'));
  expect(document.body.textContent).toContain('B: 0');

  resolveA('done');
  await pA;
  await flush();
  expect(document.body.textContent).toContain('A: 0');
  expect(document.body.textContent).toContain('B: 0');
});

test('accepts override queryClient', async () => {
  const queryClient = createQueryClient();
  const overrideClient = createQueryClient();

  function TestComponent() {
    const isMutating = useIsMutating({ queryClient: overrideClient });
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['test'],
      mutationFn: async () => 'done',
    });
    return (
      <div>
        <span>{() => isMutating()}</span>
        <span>{() => mutation().status()}</span>
      </div>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await flush();
  expect(document.body.textContent).toContain('0');
});
