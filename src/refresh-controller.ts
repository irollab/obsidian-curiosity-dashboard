export class DebouncedRefresh {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly refresh: () => Promise<void> | void,
    private readonly delayMs: number,
    private readonly reportError: (error: unknown) => void = console.error,
  ) {}

  schedule(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void Promise.resolve()
        .then(() => this.refresh())
        .catch((error: unknown) => this.reportError(error));
    }, this.delayMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

interface LatestRefreshCallbacks<T> {
  loading: () => void;
  success: (value: T) => void;
  error: (error: unknown) => void;
}

export type RefreshOutcome =
  | { status: 'success' }
  | { status: 'error'; error: unknown }
  | { status: 'stale' };

export class LatestRefresh<T> {
  private revision = 0;
  private disposed = false;

  constructor(private readonly callbacks: LatestRefreshCallbacks<T>) {}

  async run(load: () => Promise<T>): Promise<RefreshOutcome> {
    if (this.disposed) return { status: 'stale' };
    const revision = ++this.revision;
    this.callbacks.loading();
    try {
      const value = await load();
      if (!this.isCurrent(revision)) return { status: 'stale' };
      this.callbacks.success(value);
      return { status: 'success' };
    } catch (error) {
      if (!this.isCurrent(revision)) return { status: 'stale' };
      this.callbacks.error(error);
      return { status: 'error', error };
    }
  }

  invalidate(): void {
    this.revision += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  private isCurrent(revision: number): boolean {
    return !this.disposed && revision === this.revision;
  }
}
