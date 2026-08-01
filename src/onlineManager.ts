import { Subscribable } from './subscribable.ts';

type Listener = (online: boolean) => void;
type SetupFn = (setOnline: Listener) => (() => void) | undefined;

export class OnlineManager extends Subscribable<Listener> {
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
      this.setEventListener(this.#setup);
    }
  }

  protected onUnsubscribe(): void {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = undefined;
    }
  }

  setEventListener(setup: SetupFn): void {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup(this.setOnline.bind(this));
  }

  setOnline(online: boolean): void {
    if (this.#online !== online) {
      this.#online = online;
      this.listeners.forEach((listener) => listener(online));
    }
  }

  isOnline(): boolean {
    return this.#online;
  }
}

export const onlineManager = new OnlineManager();
