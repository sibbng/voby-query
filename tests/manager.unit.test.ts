import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { FocusManager } from '../src/focusManager.ts';
import { OnlineManager } from '../src/onlineManager.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('focus manager', () => {
  it('passes the focused state to listeners', () => {
    const manager = new FocusManager();
    const focusedStates: boolean[] = [];
    const unsubscribe = manager.subscribe((focused) => {
      focusedStates.push(focused);
    });

    manager.setFocused(false);
    manager.setFocused(true);

    expect(focusedStates).toEqual([false, true]);

    unsubscribe();
  });

  it('supports a custom event listener and retains state after unsubscribe', () => {
    const manager = new FocusManager();
    let triggerFocus: ((focused?: boolean) => void) | undefined;
    let cleanupCount = 0;
    const setup = (setFocused: (focused?: boolean) => void) => {
      triggerFocus = setFocused;
      return () => {
        cleanupCount++;
      };
    };
    const focusedStates: boolean[] = [];

    manager.setEventListener(setup);
    const unsubscribe = manager.subscribe((focused) => focusedStates.push(focused));
    triggerFocus!(false);

    expect(focusedStates).toEqual([false]);

    unsubscribe();

    expect(cleanupCount).toBe(1);
    expect(manager.isFocused()).toBe(false);
  });
});

describe('online manager', () => {
  it('passes the online state and retains it after unsubscribe', () => {
    const manager = new OnlineManager();
    const onlineStates: boolean[] = [];
    const unsubscribe = manager.subscribe((online) => {
      onlineStates.push(online);
    });

    manager.setOnline(false);
    unsubscribe();

    expect(onlineStates).toEqual([false]);
    expect(manager.isOnline()).toBe(false);
  });

  it('supports a custom event listener', () => {
    const manager = new OnlineManager();
    let triggerOnline: ((online: boolean) => void) | undefined;
    const setup = (setOnline: (online: boolean) => void) => {
      triggerOnline = setOnline;
      return undefined;
    };
    const onlineStates: boolean[] = [];

    manager.setEventListener(setup);
    const unsubscribe = manager.subscribe((online) => {
      onlineStates.push(online);
    });
    triggerOnline!(false);

    expect(onlineStates).toEqual([false]);

    unsubscribe();
  });
});
