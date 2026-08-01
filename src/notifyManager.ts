import { systemSetTimeoutZero } from './timeoutManager.ts';

type NotifyCallback = () => void;
type NotifyFunction = (callback: NotifyCallback) => void;
type BatchNotifyFunction = (callback: NotifyCallback) => void;
type BatchCallsCallback<T extends Array<unknown>> = (...args: T) => void;
type ScheduleFunction = (callback: NotifyCallback) => void;

export const defaultScheduler: ScheduleFunction = systemSetTimeoutZero;

export function createNotifyManager() {
  let queue: Array<NotifyCallback> = [];
  let transactions = 0;
  let notifyFn: NotifyFunction = (callback) => {
    callback();
  };
  let batchNotifyFn: BatchNotifyFunction = (callback) => {
    callback();
  };
  let scheduleFn = defaultScheduler;

  const schedule = (callback: NotifyCallback): void => {
    if (transactions) {
      queue.push(callback);
    } else {
      scheduleFn(() => {
        notifyFn(callback);
      });
    }
  };

  const flush = (): void => {
    const originalQueue = queue;
    queue = [];
    if (originalQueue.length) {
      scheduleFn(() => {
        batchNotifyFn(() => {
          originalQueue.forEach((callback) => {
            notifyFn(callback);
          });
        });
      });
    }
  };

  return {
    batch: <T>(callback: () => T): T => {
      let result: T;
      transactions++;
      try {
        result = callback();
      } finally {
        transactions--;
        if (!transactions) {
          flush();
        }
      }
      return result!;
    },
    batchCalls: <T extends Array<unknown>>(
      callback: BatchCallsCallback<T>,
    ): BatchCallsCallback<T> => {
      return (...args) => {
        schedule(() => {
          callback(...args);
        });
      };
    },
    schedule,
    setNotifyFunction: (fn: NotifyFunction) => {
      notifyFn = fn;
    },
    setBatchNotifyFunction: (fn: BatchNotifyFunction) => {
      batchNotifyFn = fn;
    },
    setScheduler: (fn: ScheduleFunction) => {
      scheduleFn = fn;
    },
  } as const;
}

export const notifyManager = createNotifyManager();
