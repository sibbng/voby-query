import { Subscribable } from './subscribable.ts';

type SetupFn = (setOnline: (online: boolean) => void) => (() => void) | undefined;

export class OnlineManager extends Subscribable<() => void> {
  #online = true;
  #cleanup?: () => void;
  #setup: SetupFn;

  constructor() {
    super();
    this.#setup = (setOnline) => {
      if (!(typeof window !== 'undefined' && typeof window.addEventListener !== 'undefined')) {
        return;
      }

      const onlineHandler = () => setOnline(true);
      const offlineHandler = () => setOnline(false);

      window.addEventListener('online', onlineHandler);
      window.addEventListener('offline', offlineHandler);

      return () => {
        window.removeEventListener('online', onlineHandler);
        window.removeEventListener('offline', offlineHandler);
      };
    };
  }

  protected onSubscribe(): void {
    if (!this.#cleanup) {
      this.setOnline(this.#online);
      this.#cleanup = this.#setup(this.setOnline.bind(this));
    }
  }

  protected onUnsubscribe(): void {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = undefined;
      this.#online = true;
    }
  }

  setOnline(online: boolean): void {
    if (this.#online !== online) {
      this.#online = online;
      this.listeners.forEach((listener) => listener());
    }
  }

  isOnline(): boolean {
    return this.#online;
  }
}

export const onlineManager = new OnlineManager();
