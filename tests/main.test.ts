import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App, PluginManifest } from 'obsidian';

import { DASHBOARD_VIEW_TYPE } from '../src/constants';
import CuriosityDashboardPlugin from '../src/main';
import { CuriosityDashboardView } from '../src/curiosity-dashboard-view';
import { DashboardSettingTab, DEFAULT_SETTINGS } from '../src/settings';

interface EventRegistration {
  callback: (...values: unknown[]) => void;
  name: string;
  source: 'metadata' | 'vault' | 'workspace';
}

const obsidianMock = vi.hoisted(() => ({
  events: [] as EventRegistration[],
  notices: [] as string[],
}));

vi.mock('obsidian', () => {
  class MockPlugin {
    constructor(readonly app: unknown) {}

    loadData(): Promise<unknown> {
      return Promise.resolve(null);
    }

    saveData(_data: unknown): Promise<void> {
      return Promise.resolve();
    }

    addCommand(_command: unknown): void {}
    addRibbonIcon(_icon: string, _title: string, _callback: () => void): void {}
    addSettingTab(_tab: unknown): void {}
    registerEvent(_event: unknown): void {}
    registerView(_type: string, _creator: unknown): void {}
  }

  class MockItemView {
    readonly contentEl = {};
    constructor(readonly leaf: unknown) {}
  }

  class MockPluginSettingTab {
    constructor(_app: unknown, _plugin: unknown) {}
  }

  class MockNotice {
    constructor(message: string) {
      obsidianMock.notices.push(message);
    }
  }

  return {
    ItemView: MockItemView,
    Modal: class {},
    Notice: MockNotice,
    Platform: { isMobile: false },
    Plugin: MockPlugin,
    PluginSettingTab: MockPluginSettingTab,
    Setting: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: (path: string) => path,
    setIcon: vi.fn(),
  };
});

function makeApp() {
  const leaves: unknown[] = [];
  const newLeaf = {
    detach: vi.fn(() => {
      const index = leaves.indexOf(newLeaf);
      if (index >= 0) leaves.splice(index, 1);
    }),
    setViewState: vi.fn(async () => {
      leaves.push(newLeaf);
    }),
    view: {},
  };
  const event = (source: EventRegistration['source']) =>
    vi.fn((name: string, callback: (...values: unknown[]) => void) => {
      const registration = { callback, name, source };
      obsidianMock.events.push(registration);
      return registration;
    });
  const workspace = {
    detachLeavesOfType: vi.fn(),
    getActiveViewOfType: vi.fn<(...args: unknown[]) => unknown>(() => null),
    getLeaf: vi.fn(() => newLeaf),
    getLeavesOfType: vi.fn(() => leaves),
    on: event('workspace'),
    onLayoutReady: vi.fn((callback: () => void) => callback()),
    revealLeaf: vi.fn(async () => undefined),
  };
  const app = {
    fileManager: {},
    metadataCache: { on: event('metadata') },
    vault: {
      getAllLoadedFiles: vi.fn(() => []),
      getFiles: vi.fn(() => []),
      getMarkdownFiles: vi.fn(() => []),
      on: event('vault'),
    },
    workspace,
  };
  return { app, leaves, newLeaf, workspace };
}

function makePlugin(app = makeApp().app): CuriosityDashboardPlugin {
  return new CuriosityDashboardPlugin(app as unknown as App, {} as PluginManifest);
}

describe('CuriosityDashboardPlugin lifecycle', () => {
  beforeEach(() => {
    obsidianMock.events.length = 0;
    obsidianMock.notices.length = 0;
    vi.useRealTimers();
  });

  it('parses settings and registers the view, entry points, and every reactive event', async () => {
    const { app } = makeApp();
    const plugin = makePlugin(app);
    vi.spyOn(plugin, 'loadData').mockResolvedValue({ topicDir: 'custom-topics', defaultTab: 'tasks' });
    const addCommand = vi.spyOn(plugin, 'addCommand');
    const addRibbonIcon = vi.spyOn(plugin, 'addRibbonIcon');
    const addSettingTab = vi.spyOn(plugin, 'addSettingTab');
    const registerView = vi.spyOn(plugin, 'registerView');

    await plugin.onload();

    expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, topicDir: 'custom-topics', defaultTab: 'tasks' });
    expect(registerView).toHaveBeenCalledWith(DASHBOARD_VIEW_TYPE, expect.any(Function));
    expect(addSettingTab).toHaveBeenCalledWith(expect.any(DashboardSettingTab));
    expect(addRibbonIcon).toHaveBeenCalledWith('telescope', 'Open Curiosity Dashboard', expect.any(Function));
    expect(addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-curiosity-dashboard', name: 'Open Curiosity Dashboard' }),
    );
    expect(obsidianMock.events.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: 'create', source: 'vault' },
      { name: 'modify', source: 'vault' },
      { name: 'delete', source: 'vault' },
      { name: 'rename', source: 'vault' },
      { name: 'changed', source: 'metadata' },
      { name: 'active-leaf-change', source: 'workspace' },
    ]);
  });

  it('reuses and reveals an existing dashboard leaf', async () => {
    const { app, workspace } = makeApp();
    const existing = { view: {} };
    workspace.getLeavesOfType.mockReturnValue([existing]);
    const plugin = makePlugin(app);
    await plugin.onload();

    await plugin.activateView();

    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
  });

  it('opens a new tab without detaching unrelated leaves', async () => {
    const { app, newLeaf, workspace } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();

    await plugin.activateView();

    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(newLeaf.setViewState).toHaveBeenCalledWith({ type: DASHBOARD_VIEW_TYPE, active: true });
    expect(workspace.detachLeavesOfType).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(newLeaf);
  });

  it('shares one activation while a new dashboard leaf is being created', async () => {
    const { app, leaves, newLeaf, workspace } = makeApp();
    let finish!: () => void;
    newLeaf.setViewState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            leaves.push(newLeaf);
            resolve();
          };
        }),
    );
    const plugin = makePlugin(app);
    await plugin.onload();

    const first = plugin.activateView();
    const second = plugin.activateView();

    expect(second).toBe(first);
    await Promise.resolve();
    expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    expect(newLeaf.setViewState).toHaveBeenCalledTimes(1);
    expect(workspace.revealLeaf).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a duplicate refresh for active-leaf events during new view activation', async () => {
    vi.useFakeTimers();
    const { app, leaves, newLeaf, workspace } = makeApp();
    const activeView = {
      getViewType: () => DASHBOARD_VIEW_TYPE,
      refresh: vi.fn(async () => undefined),
    };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    let finish!: () => void;
    newLeaf.setViewState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            leaves.push(newLeaf);
            resolve();
          };
        }),
    );
    const plugin = makePlugin(app);
    await plugin.onload();

    const activation = plugin.activateView();
    await Promise.resolve();
    obsidianMock.events
      .find(({ source }) => source === 'workspace')
      ?.callback({ view: activeView });
    finish();
    await activation;
    await vi.runAllTimersAsync();

    expect(activeView.refresh).not.toHaveBeenCalled();
  });

  it('publishes the activation single-flight before setViewState synchronously changes the active leaf', async () => {
    vi.useFakeTimers();
    const { app, leaves, newLeaf, workspace } = makeApp();
    const activeView = {
      getViewType: () => DASHBOARD_VIEW_TYPE,
      refresh: vi.fn(async () => undefined),
    };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    newLeaf.setViewState.mockImplementationOnce(async () => {
      obsidianMock.events
        .find(({ source }) => source === 'workspace')
        ?.callback({ view: activeView });
      leaves.push(newLeaf);
    });
    const plugin = makePlugin(app);
    await plugin.onload();

    await plugin.activateView();
    await vi.runAllTimersAsync();

    expect(activeView.refresh).not.toHaveBeenCalled();
  });

  it('clears a failed activation so a later activation can retry', async () => {
    const { app, newLeaf, workspace } = makeApp();
    newLeaf.setViewState
      .mockRejectedValueOnce(new Error('view failed'))
      .mockResolvedValueOnce(undefined);
    const plugin = makePlugin(app);
    await plugin.onload();

    await expect(plugin.activateView()).rejects.toThrow('view failed');
    await expect(plugin.activateView()).resolves.toBeUndefined();

    expect(workspace.getLeaf).toHaveBeenCalledTimes(2);
  });

  it('detaches a newly created leaf when setViewState fails and leaves one clean leaf after retry', async () => {
    const { app, leaves, newLeaf, workspace } = makeApp();
    newLeaf.setViewState
      .mockImplementationOnce(async () => {
        leaves.push(newLeaf);
        throw new Error('state failed');
      })
      .mockImplementationOnce(async () => {
        leaves.push(newLeaf);
      });
    const plugin = makePlugin(app);
    await plugin.onload();

    await expect(plugin.activateView()).rejects.toThrow('state failed');
    expect(newLeaf.detach).toHaveBeenCalledTimes(1);
    expect(leaves).toEqual([]);

    await expect(plugin.activateView()).resolves.toBeUndefined();
    expect(workspace.getLeaf).toHaveBeenCalledTimes(2);
    expect(leaves).toEqual([newLeaf]);
  });

  it('detaches a new leaf when reveal fails but does not detach an existing leaf', async () => {
    const created = makeApp();
    created.workspace.revealLeaf.mockRejectedValueOnce(new Error('reveal failed'));
    const createdPlugin = makePlugin(created.app);
    await createdPlugin.onload();

    await expect(createdPlugin.activateView()).rejects.toThrow('reveal failed');
    expect(created.newLeaf.detach).toHaveBeenCalledTimes(1);
    expect(created.leaves).toEqual([]);

    const reused = makeApp();
    const existing = { detach: vi.fn(), view: {} };
    reused.workspace.getLeavesOfType.mockReturnValue([existing]);
    reused.workspace.revealLeaf.mockRejectedValueOnce(new Error('reveal failed'));
    const reusedPlugin = makePlugin(reused.app);
    await reusedPlugin.onload();

    await expect(reusedPlugin.activateView()).rejects.toThrow('reveal failed');
    expect(existing.detach).not.toHaveBeenCalled();
  });

  it('coalesces delayed startup and manual activation into one leaf creation', async () => {
    const { app, leaves, newLeaf, workspace } = makeApp();
    let layoutReady!: () => void;
    workspace.onLayoutReady.mockImplementation((callback) => {
      layoutReady = callback;
    });
    let finish!: () => void;
    newLeaf.setViewState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            leaves.push(newLeaf);
            resolve();
          };
        }),
    );
    const plugin = makePlugin(app);
    vi.spyOn(plugin, 'loadData').mockResolvedValue({ openOnStartup: true });
    await plugin.onload();

    const manual = plugin.activateView();
    layoutReady();
    await Promise.resolve();
    finish();
    await manual;
    await vi.waitFor(() => expect(workspace.revealLeaf).toHaveBeenCalledTimes(1));

    expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
  });

  it('ignores a delayed layout-ready callback after plugin unload', async () => {
    const { app, workspace } = makeApp();
    let layoutReady!: () => void;
    workspace.onLayoutReady.mockImplementation((callback) => {
      layoutReady = callback;
    });
    const plugin = makePlugin(app);
    vi.spyOn(plugin, 'loadData').mockResolvedValue({ openOnStartup: true });
    await plugin.onload();

    plugin.onunload();
    layoutReady();
    await Promise.resolve();

    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(obsidianMock.notices).toEqual([]);
  });

  it('debounces events and refreshes only the active dashboard view', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = {
      getViewType: () => DASHBOARD_VIEW_TYPE,
      refresh: vi.fn(async () => undefined),
    };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();

    obsidianMock.events[0]?.callback({ path: '10-选题池/39.md' });
    obsidianMock.events[1]?.callback({ path: '60-发布复盘/39.md' });
    await vi.advanceTimersByTimeAsync(199);
    expect(activeView.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(workspace.getActiveViewOfType).toHaveBeenCalledWith(CuriosityDashboardView);
    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated modify storms and still merges relevant events once', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();
    const modify = obsidianMock.events.find(
      ({ source, name }) => source === 'vault' && name === 'modify',
    );
    const create = obsidianMock.events.find(
      ({ source, name }) => source === 'vault' && name === 'create',
    );

    for (let index = 0; index < 100; index += 1) {
      modify?.callback({ path: `附件/${index}.png` });
    }
    await vi.advanceTimersByTimeAsync(200);
    expect(activeView.refresh).not.toHaveBeenCalled();

    modify?.callback({ path: '10-选题池/39.md' });
    create?.callback({ path: '40-脚本大纲/39.md' });
    modify?.callback({ path: '60-发布复盘/39.md' });
    await vi.advanceTimersByTimeAsync(200);

    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('observes the current external review path, including a file created later', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();
    plugin.updateObservedDataPaths([' archive\\explicit.md ']);

    obsidianMock.events.find(
      ({ source, name }) => source === 'vault' && name === 'create',
    )?.callback({ path: 'archive/explicit.md' });
    obsidianMock.events.find(
      ({ source, name }) => source === 'metadata' && name === 'changed',
    )?.callback({ path: 'archive/explicit.md' });
    await vi.advanceTimersByTimeAsync(200);

    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes after an inactive dashboard becomes active again', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = {
      getViewType: () => DASHBOARD_VIEW_TYPE,
      refresh: vi.fn(async () => undefined),
    };
    const plugin = makePlugin(app);
    await plugin.onload();

    obsidianMock.events.find(({ source }) => source === 'vault')?.callback({ path: '10-选题池/39.md' });
    await vi.advanceTimersByTimeAsync(200);
    expect(activeView.refresh).not.toHaveBeenCalled();

    workspace.getActiveViewOfType.mockReturnValue(activeView);
    obsidianMock.events
      .find(({ source }) => source === 'workspace')
      ?.callback({ view: activeView });
    await vi.advanceTimersByTimeAsync(200);

    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('schedules a fresh load after revealing a reused dashboard leaf', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    const existing = { view: activeView };
    workspace.getLeavesOfType.mockReturnValue([existing]);
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();

    await plugin.activateView();
    await vi.advanceTimersByTimeAsync(200);

    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('schedules a refresh after settings are saved', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue();
    await plugin.onload();

    await plugin.saveSettings();
    await vi.advanceTimersByTimeAsync(200);

    expect(saveData).toHaveBeenCalledWith(plugin.settings);
    expect(activeView.refresh).toHaveBeenCalledTimes(1);
  });

  it('serializes immutable setting snapshots in invocation order', async () => {
    const { app } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();
    let finishFirst!: () => void;
    const saveData = vi.spyOn(plugin, 'saveData');
    saveData
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    plugin.settings.topicDir = 'first';
    const first = plugin.saveSettings();
    plugin.settings.topicDir = 'second';
    const second = plugin.saveSettings();
    await Promise.resolve();

    expect(saveData).toHaveBeenCalledTimes(1);
    expect(saveData.mock.calls[0]?.[0]).toEqual({ ...DEFAULT_SETTINGS, topicDir: 'first' });
    finishFirst();
    await Promise.all([first, second]);

    expect(saveData).toHaveBeenCalledTimes(2);
    expect(saveData.mock.calls[1]?.[0]).toEqual({ ...DEFAULT_SETTINGS, topicDir: 'second' });
  });

  it('continues the settings save queue after an earlier failure', async () => {
    const { app } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();
    const saveData = vi
      .spyOn(plugin, 'saveData')
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);

    plugin.settings.topicDir = 'first';
    const first = plugin.saveSettings();
    plugin.settings.topicDir = 'second';
    const second = plugin.saveSettings();

    await expect(first).rejects.toThrow('disk full');
    await expect(second).resolves.toBeUndefined();
    expect(saveData).toHaveBeenCalledTimes(2);
    expect(saveData.mock.calls[1]?.[0]).toEqual({ ...DEFAULT_SETTINGS, topicDir: 'second' });
  });

  it('cancels refresh work and detaches dashboard leaves on unload', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();
    obsidianMock.events[0]?.callback({ path: '10-选题池/39.md' });

    plugin.onunload();
    await vi.runAllTimersAsync();

    expect(activeView.refresh).not.toHaveBeenCalled();
    expect(workspace.detachLeavesOfType).toHaveBeenCalledWith(DASHBOARD_VIEW_TYPE);
  });

  it('detaches a newly initialized leaf when unload happens during activation', async () => {
    const { app, newLeaf } = makeApp();
    let finish!: () => void;
    newLeaf.setViewState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const plugin = makePlugin(app);
    await plugin.onload();
    const activation = plugin.activateView();

    await Promise.resolve();
    plugin.onunload();
    finish();
    await activation;

    expect(newLeaf.detach).toHaveBeenCalledTimes(1);
  });

  it('does not create a leaf when unload happens before the activation microtask starts', async () => {
    const { app, newLeaf, workspace } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();

    const activation = plugin.activateView();
    plugin.onunload();
    await activation;

    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(newLeaf.setViewState).not.toHaveBeenCalled();
    expect(newLeaf.detach).not.toHaveBeenCalled();
  });
});
