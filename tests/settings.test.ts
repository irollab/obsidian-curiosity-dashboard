import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from 'obsidian';

import type CuriosityDashboardPlugin from '../src/main';
import { DashboardSettingTab, DEFAULT_SETTINGS, parseSettings } from '../src/settings';

type ChangeHandler = (value: string | boolean) => Promise<void>;

interface SettingRecord {
  kind: 'dropdown' | 'text' | 'toggle';
  name: string;
  onChange: ChangeHandler;
  options?: Record<string, string>;
  value: string | boolean;
}

const obsidianMock = vi.hoisted(() => ({
  headings: [] as string[],
  settings: [] as SettingRecord[],
}));

vi.mock('obsidian', () => {
  class MockPluginSettingTab {
    readonly containerEl = {
      createEl: (_tag: string, options: { text: string }) => obsidianMock.headings.push(options.text),
      empty: () => {
        obsidianMock.headings.length = 0;
        obsidianMock.settings.length = 0;
      },
    };

    constructor(_app: unknown, _plugin: unknown) {}
  }

  class MockSetting {
    private name = '';

    constructor(_containerEl: unknown) {}

    setName(name: string): this {
      this.name = name;
      return this;
    }

    addText(configure: (component: unknown) => void): this {
      this.addComponent('text', configure);
      return this;
    }

    addToggle(configure: (component: unknown) => void): this {
      this.addComponent('toggle', configure);
      return this;
    }

    addDropdown(configure: (component: unknown) => void): this {
      this.addComponent('dropdown', configure);
      return this;
    }

    private addComponent(kind: SettingRecord['kind'], configure: (component: unknown) => void): void {
      const record: Partial<SettingRecord> = { kind, name: this.name };
      const component = {
        addOptions: (options: Record<string, string>) => {
          record.options = options;
          return component;
        },
        onChange: (handler: ChangeHandler) => {
          record.onChange = handler;
          obsidianMock.settings.push(record as SettingRecord);
          return component;
        },
        setValue: (value: string | boolean) => {
          record.value = value;
          return component;
        },
      };
      configure(component);
    }
  }

  return { PluginSettingTab: MockPluginSettingTab, Setting: MockSetting };
});

function makeTab() {
  const plugin = {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(async () => undefined),
  } as unknown as CuriosityDashboardPlugin;
  const tab = new DashboardSettingTab({} as App, plugin);
  tab.display();
  return { plugin, tab };
}

describe('dashboard settings', () => {
  beforeEach(() => {
    obsidianMock.headings.length = 0;
    obsidianMock.settings.length = 0;
  });

  it('provides the complete default dashboard settings', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      topicDir: '10-选题池',
      scriptDir: '40-脚本大纲',
      assetDir: '20-素材库',
      reviewDir: '60-发布复盘',
      topicTemplate: '99-模板/选题卡模板.md',
      scriptTemplate: '99-模板/脚本大纲模板.md',
      reviewTemplate: '99-模板/发布复盘模板.md',
      backgroundPath: '',
      openOnStartup: false,
      defaultTab: 'overview',
      enableMobileView: true,
    });
  });

  it('accepts valid runtime settings', () => {
    const settings = {
      topicDir: 'topics',
      scriptDir: 'scripts',
      assetDir: 'assets',
      reviewDir: 'reviews',
      topicTemplate: 'templates/topic.md',
      scriptTemplate: 'templates/script.md',
      reviewTemplate: 'templates/review.md',
      backgroundPath: '',
      openOnStartup: true,
      defaultTab: 'data',
      enableMobileView: false,
    } as const;

    expect(parseSettings(settings)).toEqual(settings);
  });

  it('falls back per field for missing and invalid runtime values', () => {
    expect(parseSettings({ topicDir: 'custom-topics' })).toEqual({
      ...DEFAULT_SETTINGS,
      topicDir: 'custom-topics',
    });
    expect(
      parseSettings({
        topicDir: 1,
        scriptDir: null,
        assetDir: [],
        reviewDir: {},
        topicTemplate: false,
        scriptTemplate: 2,
        reviewTemplate: null,
        backgroundPath: 3,
        openOnStartup: 'true',
        defaultTab: 'invalid',
        enableMobileView: 0,
      }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings({
        topicDir: '',
        scriptDir: ' ',
        assetDir: '',
        reviewDir: '',
        topicTemplate: '',
        scriptTemplate: '',
        reviewTemplate: '',
        backgroundPath: '',
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('uses defaults for non-object persisted data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('invalid')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('displays every setting with current values', () => {
    makeTab();

    expect(obsidianMock.headings).toEqual(['Curiosity Dashboard']);
    expect(obsidianMock.settings.map(({ kind, name, value }) => ({ kind, name, value }))).toEqual([
      { kind: 'text', name: 'Topic directory', value: '10-选题池' },
      { kind: 'text', name: 'Script directory', value: '40-脚本大纲' },
      { kind: 'text', name: 'Asset directory', value: '20-素材库' },
      { kind: 'text', name: 'Review directory', value: '60-发布复盘' },
      { kind: 'text', name: 'Topic template', value: '99-模板/选题卡模板.md' },
      { kind: 'text', name: 'Script template', value: '99-模板/脚本大纲模板.md' },
      { kind: 'text', name: 'Review template', value: '99-模板/发布复盘模板.md' },
      { kind: 'text', name: 'Background image', value: '' },
      { kind: 'toggle', name: 'Open on startup', value: false },
      { kind: 'dropdown', name: 'Default tab', value: 'overview' },
      { kind: 'toggle', name: 'Enable simplified mobile view', value: true },
    ]);
    expect(obsidianMock.settings[9]?.options).toEqual({ overview: 'Overview', tasks: 'Tasks', data: 'Data' });
  });

  it('persists every setting change', async () => {
    const { plugin } = makeTab();

    for (const setting of obsidianMock.settings.slice(0, 8)) {
      await setting.onChange('  changed  ');
    }
    await obsidianMock.settings[8]?.onChange(true);
    await obsidianMock.settings[9]?.onChange('data');
    await obsidianMock.settings[10]?.onChange(false);

    expect(plugin.settings).toEqual({
      topicDir: 'changed',
      scriptDir: 'changed',
      assetDir: 'changed',
      reviewDir: 'changed',
      topicTemplate: 'changed',
      scriptTemplate: 'changed',
      reviewTemplate: 'changed',
      backgroundPath: 'changed',
      openOnStartup: true,
      defaultTab: 'data',
      enableMobileView: false,
    });
    expect(plugin.saveSettings).toHaveBeenCalledTimes(11);
  });
});
