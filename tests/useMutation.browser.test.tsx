import { expect, test, vi } from 'vite-plus/test';
import { flush, render } from './utils';
import { waitFor } from '@testing-library/dom';
import { useMutation, useMutationState } from '../src/useMutation';
import { createQueryClient } from '../src/useQuery';
import { QueryClientProvider } from '../src/context';
import { $, If } from 'voby';

test('useMutation basic functionality', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise((res) => setTimeout(res, 50));
        return `Processed: ${variables}`;
      },
    });
    mutationResult = mutation;
    return (
      <>
        <If when={() => mutation().isIdle()}>Idle</If>
        <If when={() => mutation().isPending()}>Pending</If>
        <If when={() => mutation().isSuccess()}>{() => mutation().data()}</If>
        <If when={() => mutation().isError()}>Error</If>
      </>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Idle');
  const promise = mutationResult().mutate('test');
  await waitFor(() => expect(document.body.textContent).toBe('Pending'));
  await promise;
  await flush();
  expect(document.body.textContent).toBe('Processed: test');
  expect(mutationResult().isSuccess()).toBe(true);
  expect(mutationResult().data()).toBe('Processed: test');
});

test('useMutation error handling', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async () => {
        await new Promise((res) => setTimeout(res, 50));
        throw new Error('fail');
      },
    });
    mutationResult = mutation;
    return (
      <>
        <If when={() => mutation().isIdle()}>Idle</If>
        <If when={() => mutation().isPending()}>Pending</If>
        <If when={() => mutation().isError()}>{() => mutation().error()?.message}</If>
      </>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Idle');
  const promise = mutationResult()
    .mutate('fail')
    .catch(() => {});
  await waitFor(() => expect(document.body.textContent).toBe('Pending'));
  await promise;
  await flush();
  expect(document.body.textContent).toBe('fail');
  expect(mutationResult().isError()).toBe(true);
  expect(mutationResult().error()?.message).toBe('fail');
});

test('useMutation reset', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise((res) => setTimeout(res, 50));
        return `Processed: ${variables}`;
      },
    });
    mutationResult = mutation;
    return (
      <>
        <If when={() => mutation().isIdle()}>Idle</If>
        <If when={() => mutation().isSuccess()}>{() => mutation().data()}</If>
      </>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toBe('Idle');
  await mutationResult().mutate('reset');
  await flush();
  expect(document.body.textContent).toBe('Processed: reset');
  mutationResult().reset();
  await flush();
  expect(document.body.textContent).toBe('Idle');
});

test('useMutation onSuccess callback', async () => {
  const queryClient = createQueryClient();
  const onSuccessMock = vi.fn();
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise((res) => setTimeout(res, 10));
        return `Success: ${variables}`;
      },
      onSuccess: onSuccessMock,
    });
    mutationResult = mutation;
    return <button onClick={() => mutation().mutate('test-vars')}>Mutate</button>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await mutationResult().mutate('test-vars');
  await flush(); // Wait for mutation and subsequent rerender/callback

  expect(onSuccessMock).toHaveBeenCalledWith(
    'Success: test-vars', // data
    'test-vars', // variables
    undefined, // context (undefined as onMutate is not used)
  );
  expect(mutationResult().data()).toBe('Success: test-vars');
});

test('useMutation onError callback', async () => {
  const queryClient = createQueryClient();
  const onErrorMock = vi.fn();
  const testError = new Error('Mutation failed');
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async () => {
        await new Promise((res) => setTimeout(res, 10));
        throw testError;
      },
      onError: onErrorMock,
    });
    mutationResult = mutation;
    return <button onClick={() => mutation().mutate('error-vars')}>Mutate</button>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  // Use .catch to prevent unhandled promise rejection in test
  await mutationResult()
    .mutate('error-vars')
    .catch(() => {});
  await flush();

  expect(onErrorMock).toHaveBeenCalledWith(
    testError, // error
    'error-vars', // variables
    undefined, // context
  );
  expect(mutationResult().error()).toBe(testError);
});

test('useMutation onSettled callback (on success)', async () => {
  const queryClient = createQueryClient();
  const onSettledMock = vi.fn();
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        await new Promise((res) => setTimeout(res, 10));
        return `Settled success: ${variables}`;
      },
      onSettled: onSettledMock,
    });
    mutationResult = mutation;
    return <button onClick={() => mutation().mutate('settled-success-vars')}>Mutate</button>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await mutationResult().mutate('settled-success-vars');
  await flush();

  expect(onSettledMock).toHaveBeenCalledWith(
    'Settled success: settled-success-vars', // data
    null, // error
    'settled-success-vars', // variables
    undefined, // context
  );
  expect(mutationResult().data()).toBe('Settled success: settled-success-vars');
});

test('useMutation onSettled callback (on error)', async () => {
  const queryClient = createQueryClient();
  const onSettledMock = vi.fn();
  const testError = new Error('Settled error');
  let mutationResult: any;

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async () => {
        await new Promise((res) => setTimeout(res, 10));
        throw testError;
      },
      onSettled: onSettledMock,
    });
    mutationResult = mutation;
    return <button onClick={() => mutation().mutate('settled-error-vars')}>Mutate</button>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  await mutationResult()
    .mutate('settled-error-vars')
    .catch(() => {});
  await flush();

  expect(onSettledMock).toHaveBeenCalledWith(
    undefined, // data
    testError, // error
    'settled-error-vars', // variables
    undefined, // context
  );
  expect(mutationResult().error()).toBe(testError);
});

test('useMutation onMutate and context passing', async () => {
  const queryClient = createQueryClient();
  const onMutateMock = vi.fn(async (variables: string) => {
    await new Promise((res) => setTimeout(res, 5)); // Simulate async work in onMutate
    return `Context from ${variables}`;
  });
  const onSuccessMock = vi.fn();
  const onErrorMock = vi.fn();
  const onSettledMock = vi.fn();
  const mutationFnSuccess = async (variables: string) => {
    await new Promise((res) => setTimeout(res, 10));
    return `Success with context: ${variables}`;
  };
  const mutationFnError = async (variables: string) => {
    await new Promise((res) => setTimeout(res, 10));
    throw new Error(`Error with context: ${variables}`);
  };
  let mutationSuccessResult: any;
  let mutationErrorResult: any;

  function TestComponentSuccess() {
    const mutation = useMutation<string, Error, string, string>({
      // TData, TError, TVariables, TContext
      mutationFn: mutationFnSuccess,
      onMutate: onMutateMock,
      onSuccess: onSuccessMock,
      onSettled: onSettledMock,
    });
    mutationSuccessResult = mutation;
    return null;
  }

  function TestComponentError() {
    const mutation = useMutation<string, Error, string, string>({
      // TData, TError, TVariables, TContext
      mutationFn: mutationFnError,
      onMutate: onMutateMock, // Re-using the same mock to check calls for error case
      onError: onErrorMock,
      onSettled: (data, error, variables, context) =>
        onSettledMock(data, error, variables, context), // Wrap to distinguish calls
    });
    mutationErrorResult = mutation;
    return null;
  }

  // Test success path
  render(
    <QueryClientProvider value={queryClient}>
      <TestComponentSuccess />
    </QueryClientProvider>,
    document.body,
  );
  await mutationSuccessResult().mutate('vars-for-success');
  await flush();

  expect(onMutateMock).toHaveBeenCalledWith('vars-for-success');
  const expectedContextSuccess = 'Context from vars-for-success';
  expect(onSuccessMock).toHaveBeenCalledWith(
    'Success with context: vars-for-success', // data
    'vars-for-success', // variables
    expectedContextSuccess, // context
  );
  expect(onSettledMock).toHaveBeenCalledWith(
    'Success with context: vars-for-success', // data
    null, // error
    'vars-for-success', // variables
    expectedContextSuccess, // context
  );

  // Reset mocks for error path test (or use separate mocks)
  onMutateMock.mockClear();
  onSuccessMock.mockClear(); // Should not be called in error case
  onSettledMock.mockClear();

  // Test error path
  render(
    <QueryClientProvider value={queryClient}>
      <TestComponentError />
    </QueryClientProvider>,
    document.body,
  );
  await mutationErrorResult()
    .mutate('vars-for-error')
    .catch(() => {});
  await flush();

  expect(onMutateMock).toHaveBeenCalledWith('vars-for-error');
  const expectedContextError = 'Context from vars-for-error';
  expect(onErrorMock).toHaveBeenCalledWith(
    expect.any(Error), // error (Error object with message `Error with context: vars-for-error`)
    'vars-for-error', // variables
    expectedContextError, // context
  );
  expect(onSettledMock).toHaveBeenCalledWith(
    undefined, // data
    expect.any(Error), // error
    'vars-for-error', // variables
    expectedContextError, // context
  );
});

test('useMutation concurrent mutate calls behavior', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;
  const mutationFnExecutionLog: string[] = [];

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationFn: async (variables: string) => {
        mutationFnExecutionLog.push(`Start: ${variables}`);
        await new Promise((res) => setTimeout(res, 50)); // Simulate work
        mutationFnExecutionLog.push(`End: ${variables}`);
        return `Processed: ${variables}`;
      },
    });
    mutationResult = mutation;
    return (
      <>
        <button onClick={() => mutation().mutate('call1')}>Mutate1</button>
        <button onClick={() => mutation().mutate('call2')}>Mutate2</button>
        <div data-testid="status">{() => mutation().status()}</div>
        <div data-testid="data">{() => mutation().data()}</div>
      </>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  // Initial state
  expect(mutationResult().status()).toBe('idle');

  // Call mutate twice in quick succession
  const promise1 = mutationResult().mutate('call1');
  expect(mutationResult().status()).toBe('pending'); // Immediately pending for call1

  const promise2 = mutationResult().mutate('call2');
  expect(mutationResult().status()).toBe('pending');

  await promise1; // Wait for the first mutation to complete
  await promise2;
  await flush();

  // Assertions based on the library's behavior (assuming only the first call is processed)
  // The first call should complete successfully.
  expect(mutationResult().status()).toBe('success');
  expect(mutationResult().data()).toBe('Processed: call2');
  expect(mutationFnExecutionLog).toEqual([
    'Start: call1',
    'Start: call2',
    'End: call1',
    'End: call2',
  ]);

  // Now, let's see what promise2 resolves to.
  // If the second call was ignored, promise2 might resolve with the result of promise1,
  // or undefined, or throw, depending on implementation.
  // Given the current setup, it's likely promise2 will resolve with the outcome of call1
  // because mutate() returns the same promise instance if already pending.

  let promise2Result: string | undefined;
  let promise2Error: Error | undefined;
  try {
    promise2Result = await promise2;
  } catch (e: any) {
    promise2Error = e;
  }

  expect(promise2Result).toBe('Processed: call2'); // Assuming it resolves with call1's data
  expect(promise2Error).toBeUndefined();

  // Verify no second execution
  expect(mutationFnExecutionLog.length).toBe(4); // Still only call1 executed

  // Let's try another mutate after the first one is fully settled.
  mutationFnExecutionLog.length = 0; // Clear log
  const promise3 = mutationResult().mutate('call3');
  expect(mutationResult().status()).toBe('pending');
  await promise3;
  await flush();

  expect(mutationResult().status()).toBe('success');
  expect(mutationResult().data()).toBe('Processed: call3');
  expect(mutationFnExecutionLog).toEqual(['Start: call3', 'End: call3']);
});

test('useMutationState filters by partial observable mutation keys', async () => {
  const queryClient = createQueryClient();
  const keyPart = $('create');
  const showList = $(false);
  let mutationResult: any;

  function Mutator() {
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['todos', keyPart],
      mutationFn: async (value) => value,
    });
    mutationResult = mutation;
    return null;
  }

  function MutationList() {
    const partialMatches = useMutationState({
      filters: { mutationKey: ['todos'], status: 'success' },
      select: (mutation) => mutation.state.data(),
    });
    const exactMatches = useMutationState({
      filters: { mutationKey: ['todos'], exact: true },
    });

    return (
      <>
        <div data-testid="partial">{() => partialMatches().join(',')}</div>
        <div data-testid="exact">{() => exactMatches().length}</div>
      </>
    );
  }

  function App() {
    return (
      <QueryClientProvider value={queryClient}>
        <Mutator />
        <If when={showList}>
          <MutationList />
        </If>
      </QueryClientProvider>
    );
  }

  render(<App />, document.body);

  await mutationResult().mutate('created todo');
  showList(true);
  await waitFor(() => expect(document.body.textContent).toContain('created todo'));

  expect(document.body.textContent).toContain('created todo');
  expect(document.body.textContent).toContain('0');
  expect(queryClient.isMutating({ mutationKey: ['todos'], status: 'success' })).toBe(1);
  expect(queryClient.isMutating({ mutationKey: ['todos'], exact: true })).toBe(0);
});

test('useMutationState reactively shows pending count during in-flight mutation', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;

  function Mutator() {
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['reactive', 'pending'],
      mutationFn: async (v: string) => {
        await new Promise((res) => setTimeout(res, 100));
        return v;
      },
    });
    mutationResult = mutation;
    return null;
  }

  function PendingCounter() {
    const pending = useMutationState({ filters: { status: 'pending' } });
    return <div data-testid="count">{() => pending().length}</div>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Mutator />
      <PendingCounter />
    </QueryClientProvider>,
    document.body,
  );

  // Initially no mutations pending
  expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('0');

  // Start a slow mutation — pending count should jump to 1
  const promise = mutationResult().mutate('hello');
  await waitFor(() =>
    expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('1'),
  );

  // After mutation settles, pending count drops back to 0
  await promise;
  await flush();
  expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('0');
});

test('useMutation stays functional after queryClient.clear()', async () => {
  const queryClient = createQueryClient();

  function TestComponent() {
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['after', 'clear'],
      mutationFn: async (v: string) => {
        await new Promise((res) => setTimeout(res, 30));
        return `ok: ${v}`;
      },
    });
    return (
      <>
        <button data-testid="btn" onClick={() => mutation().mutate('after-clear')}>
          Mutate
        </button>
        <If when={() => mutation().isSuccess()}>{() => mutation().data()}</If>
        <If when={() => mutation().isIdle()}>idle</If>
      </>
    );
  }

  render(
    <QueryClientProvider value={queryClient}>
      <TestComponent />
    </QueryClientProvider>,
    document.body,
  );

  expect(document.body.textContent).toContain('idle');

  // Clear all caches — mutation should re-register automatically
  queryClient.clear();
  await flush();

  // Trigger mutation from inside the reactive context via a button click
  document.querySelector<HTMLButtonElement>('[data-testid="btn"]')!.click();
  await waitFor(() => expect(document.body.textContent).toContain('ok: after-clear'));
});

test('Optimistic Updates with error rollback', async () => {
  const queryClient = createQueryClient();

  // Seed the query cache with initial todos
  queryClient.setQueryData<string[]>(['todos'], ['Todo 1', 'Todo 2']);

  let mutationResult: any;

  function App() {
    const todosQuery = useQuery({
      queryKey: ['todos'],
      queryFn: async () => {
        return queryClient.getQueryData<string[]>(['todos']) ?? [];
      },
    });

    const addTodoMutation = useMutation<string[], Error, string, { previousTodos: string[] }>({
      mutationFn: async (newTodo: string) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (newTodo === 'fail-todo') {
          throw new Error('API failure');
        }
        return [...(queryClient.getQueryData<string[]>(['todos']) ?? []), newTodo];
      },
      onMutate: async (newTodo) => {
        // Snapshot the previous value
        const previousTodos = queryClient.getQueryData<string[]>(['todos']) ?? [];

        // Optimistically update to the new value instantly
        queryClient.setQueryData<string[]>(['todos'], [...previousTodos, newTodo]);

        // Return context containing previous value
        return { previousTodos };
      },
      onError: (err, newTodo, context) => {
        // Roll back if error occurs
        if (context) {
          queryClient.setQueryData<string[]>(['todos'], context.previousTodos);
        }
      },
    });

    mutationResult = addTodoMutation;

    return (
      <div>
        <p>Todos: {() => todosQuery().data()?.join(', ') ?? 'none'}</p>
        <p>MutationStatus: {() => addTodoMutation().status()}</p>
      </div>
    );
  }

  // Import useQuery for the App component
  const { useQuery } = await import('../src/useQuery');

  render(
    <QueryClientProvider value={queryClient}>
      <App />
    </QueryClientProvider>,
    document.body,
  );

  // Success path
  await flush();
  expect(document.body.textContent).toContain('Todos: Todo 1, Todo 2');

  // Trigger positive optimistic update
  let p1 = mutationResult().mutate('Todo 3');
  await flush();

  // Should immediately show Todo 3 optimistically before mutationFn resolves!
  expect(document.body.textContent).toContain('Todos: Todo 1, Todo 2, Todo 3');
  expect(document.body.textContent).toContain('MutationStatus: pending');

  // Let mutation finish
  await p1;
  await flush();
  expect(document.body.textContent).toContain('Todos: Todo 1, Todo 2, Todo 3');
  expect(document.body.textContent).toContain('MutationStatus: success');

  // Error rollback path
  let p2 = mutationResult()
    .mutate('fail-todo')
    .catch(() => {});
  await flush();

  // Should immediately show fail-todo optimistically
  expect(document.body.textContent).toContain('Todos: Todo 1, Todo 2, Todo 3, fail-todo');

  // Wait for mutation to reject, triggering rollback
  await p2;
  await flush();

  // Should have successfully rolled back to state without fail-todo!
  expect(document.body.textContent).toContain('Todos: Todo 1, Todo 2, Todo 3');
  expect(document.body.textContent).not.toContain('fail-todo');
  expect(document.body.textContent).toContain('MutationStatus: error');
});

test('useMutationState shows pending count for mutation started after queryClient.clear()', async () => {
  const queryClient = createQueryClient();
  let mutationResult: any;

  function Mutator() {
    const mutation = useMutation<string, Error, string>({
      mutationKey: ['post', 'clear'],
      mutationFn: async (v: string) => {
        await new Promise((res) => setTimeout(res, 100));
        return v;
      },
    });
    mutationResult = mutation;
    return null;
  }

  function PendingCounter() {
    const pending = useMutationState({ filters: { status: 'pending' } });
    return <div data-testid="count">{() => pending().length}</div>;
  }

  render(
    <QueryClientProvider value={queryClient}>
      <Mutator />
      <PendingCounter />
    </QueryClientProvider>,
    document.body,
  );

  // Clear cache — mutation is removed from cache
  queryClient.clear();
  await flush();
  expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('0');

  // Start a new mutation after clear — useMutation re-registers, useMutationState reacts
  const promise = mutationResult().mutate('post-clear');
  await waitFor(() =>
    expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('1'),
  );

  await promise;
  await flush();
  expect(document.querySelector('[data-testid="count"]')?.textContent).toBe('0');
});
