import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App, PluginManifest } from 'obsidian';

import CuriosityDashboardPlugin from '../src/main';
import { DashboardSettingTab, DEFAULT_SETTINGS } from '../src/settings';

const obsidianMock = vi.hoisted(() => ({ notices: [] as string[] }));

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

    addSettingTab(_tab: unknown): void {}
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
    Notice: MockNotice,
    Plugin: MockPlugin,
    PluginSettingTab: MockPluginSettingTab,
    Setting: class {},
  };
});

function makePlugin(): CuriosityDashboardPlugin {
  return new CuriosityDashboardPlugin({} as App, {} as PluginManifest);
}

describe('CuriosityDashboardPlugin settings lifecycle', () => {
  beforeEach(() => {
    obsidianMock.notices.length = 0;
  });

  it('merges saved settings, registers the setting tab, and preserves the command notice', async () => {
    const plugin = makePlugin();
    vi.spyOn(plugin, 'loadData').mockResolvedValue({ topicDir: 'custom-topics', defaultTab: 'tasks' });
    const addSettingTab = vi.spyOn(plugin, 'addSettingTab');
    const addCommand = vi.spyOn(plugin, 'addCommand');

    await plugin.onload();

    expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, topicDir: 'custom-topics', defaultTab: 'tasks' });
    expect(addSettingTab).toHaveBeenCalledWith(expect.any(DashboardSettingTab));
    expect(addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-curiosity-dashboard', name: 'Open Curiosity Dashboard' }),
    );
    const command = addCommand.mock.calls[0]?.[0];
    command?.callback?.();
    expect(obsidianMock.notices).toEqual(['Curiosity Dashboard is loaded']);
  });

  it('saves the current settings', async () => {
    const plugin = makePlugin();
    plugin.settings = { ...DEFAULT_SETTINGS, openOnStartup: true };
    const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue();

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(plugin.settings);
  });

  it('falls back field by field when persisted settings are malformed', async () => {
    const plugin = makePlugin();
    vi.spyOn(plugin, 'loadData').mockResolvedValue({
      topicDir: 42,
      openOnStartup: 'yes',
      defaultTab: 'invalid',
      enableMobileView: false,
    });

    await plugin.onload();

    expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, enableMobileView: false });
  });
});
