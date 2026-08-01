import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createNotifyManager } from '../src/notifyManager.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('notifyManager', () => {
  it('defers scheduled callbacks to the scheduler', async () => {
    const manager = createNotifyManager();
    const callback = vi.fn();

    manager.schedule(callback);

    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('flushes nested batches as one scheduled batch', async () => {
    const manager = createNotifyManager();
    const callbacks = [vi.fn(), vi.fn()];

    manager.batch(() => {
      manager.schedule(callbacks[0]);
      manager.batch(() => {
        manager.schedule(callbacks[1]);
      });
    });

    expect(callbacks[0]).not.toHaveBeenCalled();
    expect(callbacks[1]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledTimes(1);
  });

  it('schedules calls through batchCalls', async () => {
    const manager = createNotifyManager();
    const callback = vi.fn();
    const batchedCallback = manager.batchCalls(callback);

    batchedCallback('value');

    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledWith('value');
  });
});
