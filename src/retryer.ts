import { onlineManager } from './onlineManager.ts';

export type NetworkMode = 'online' | 'always' | 'offlineFirst';

export type NetworkPause = {
  canStart: () => boolean;
  wait: (retry?: boolean) => Promise<void> | undefined;
  continue: () => void;
  cancel: () => void;
};

export const canFetch = (networkMode: NetworkMode | undefined): boolean => {
  return (networkMode ?? 'online') === 'online' ? onlineManager.isOnline() : true;
};

export const createNetworkPause = (
  getNetworkMode: () => NetworkMode | undefined,
  onPause: () => void,
  onContinue: () => void,
): NetworkPause => {
  const canContinue = () => getNetworkMode() === 'always' || onlineManager.isOnline();
  let pausedPromise: Promise<void> | undefined;
  let continueFn: (() => void) | undefined;
  let cancelFn: (() => void) | undefined;

  const wait = (retry = false): Promise<void> | undefined => {
    const canProceed = retry ? canContinue : () => canFetch(getNetworkMode());
    if (canProceed()) return undefined;
    if (pausedPromise) return pausedPromise;

    onPause();

    pausedPromise = new Promise<void>((resolve) => {
      let settled = false;
      let unsubscribe = () => {};

      const finish = (shouldContinue: boolean) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        continueFn = undefined;
        cancelFn = undefined;
        pausedPromise = undefined;
        if (shouldContinue) onContinue();
        resolve();
      };

      const listener = () => {
        if (canProceed()) finish(true);
      };

      unsubscribe = onlineManager.subscribe(listener);
      continueFn = () => {
        if (canProceed()) finish(true);
      };
      cancelFn = () => finish(false);

      if (canProceed()) finish(true);
    });

    return pausedPromise;
  };

  return {
    canStart: () => canFetch(getNetworkMode()),
    wait,
    continue: () => continueFn?.(),
    cancel: () => cancelFn?.(),
  };
};
