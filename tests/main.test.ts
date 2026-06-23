import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App, PluginManifest } from 'obsidian';

import CuriosityDashboardPlugin, { DASHBOARD_VIEW_TYPE } from '../src/main';
import { CuriosityDashboardView } from '../src/curiosity-dashboard-view';
import { DashboardSettingTab, DEFAULT_SETTINGS } from '../src/settings';

interface EventRegistration {
  callback: () => void;
  name: string;
  source: 'metadata' | 'vault';
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
    Notice: MockNotice,
    Platform: { isMobile: false },
    Plugin: MockPlugin,
    PluginSettingTab: MockPluginSettingTab,
    Setting: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: (path: string) => path,
  };
});

function makeApp() {
  const newLeaf = {
    setViewState: vi.fn(async () => undefined),
    view: {},
  };
  const workspace = {
    detachLeavesOfType: vi.fn(),
    getActiveViewOfType: vi.fn<(...args: unknown[]) => unknown>(() => null),
    getLeaf: vi.fn(() => newLeaf),
    getLeavesOfType: vi.fn(() => [] as unknown[]),
    onLayoutReady: vi.fn((callback: () => void) => callback()),
    revealLeaf: vi.fn(async () => undefined),
  };
  const event = (source: EventRegistration['source']) =>
    vi.fn((name: string, callback: () => void) => {
      const registration = { callback, name, source };
      obsidianMock.events.push(registration);
      return registration;
    });
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
  return { app, newLeaf, workspace };
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

  it('debounces events and refreshes only the active dashboard view', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();

    obsidianMock.events[0]?.callback();
    obsidianMock.events[1]?.callback();
    await vi.advanceTimersByTimeAsync(199);
    expect(activeView.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(workspace.getActiveViewOfType).toHaveBeenCalledWith(CuriosityDashboardView);
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

  it('cancels refresh work and detaches dashboard leaves on unload', async () => {
    vi.useFakeTimers();
    const { app, workspace } = makeApp();
    const activeView = { refresh: vi.fn(async () => undefined) };
    workspace.getActiveViewOfType.mockReturnValue(activeView);
    const plugin = makePlugin(app);
    await plugin.onload();
    obsidianMock.events[0]?.callback();

    plugin.onunload();
    await vi.runAllTimersAsync();

    expect(activeView.refresh).not.toHaveBeenCalled();
    expect(workspace.detachLeavesOfType).toHaveBeenCalledWith(DASHBOARD_VIEW_TYPE);
  });
});
