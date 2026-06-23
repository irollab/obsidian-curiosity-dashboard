import { describe, expect, it, vi } from 'vitest';

import { DebouncedRefresh, LatestRefresh } from '@/refresh-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('DebouncedRefresh', () => {
  it('merges rapid schedules into one delayed refresh', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const scheduler = new DebouncedRefresh(refresh, 200);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(150);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(199);

    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancels scheduled work when disposed', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const scheduler = new DebouncedRefresh(refresh, 200);

    scheduler.schedule();
    scheduler.dispose();
    await vi.runAllTimersAsync();

    expect(refresh).not.toHaveBeenCalled();
    scheduler.schedule();
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('contains refresh failures instead of creating an unhandled rejection', async () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const scheduler = new DebouncedRefresh(
      async () => {
        throw new Error('refresh failed');
      },
      200,
      report,
    );

    scheduler.schedule();
    await vi.runAllTimersAsync();

    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'refresh failed' }));
    vi.useRealTimers();
  });
});

describe('LatestRefresh', () => {
  it('allows only the latest request to render', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const rendered: string[] = [];
    const loading = vi.fn();
    const errors: unknown[] = [];
    const controller = new LatestRefresh<string>({
      loading,
      success: (value) => rendered.push(value),
      error: (error) => errors.push(error),
    });

    const firstRun = controller.run(() => first.promise);
    const secondRun = controller.run(() => second.promise);
    second.resolve('new');
    await secondRun;
    first.resolve('stale');
    await firstRun;

    expect(loading).toHaveBeenCalledTimes(2);
    expect(rendered).toEqual(['new']);
    expect(errors).toEqual([]);
  });

  it('does not render success or error after disposal', async () => {
    const pending = deferred<string>();
    const success = vi.fn();
    const error = vi.fn();
    const controller = new LatestRefresh<string>({ loading: vi.fn(), success, error });

    const run = controller.run(() => pending.promise);
    controller.dispose();
    pending.reject(new Error('closed'));
    await run;

    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('renders a current request failure and resolves the refresh promise', async () => {
    const failure = new Error('load failed');
    const error = vi.fn();
    const controller = new LatestRefresh<string>({ loading: vi.fn(), success: vi.fn(), error });

    await expect(controller.run(async () => Promise.reject(failure))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(failure);
  });
});
