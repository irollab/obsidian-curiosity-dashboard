import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from 'obsidian';

import { createTranslator } from '@/i18n/translator';

import type CuriosityDashboardPlugin from '../src/main';
import { DashboardSettingTab, DEFAULT_SETTINGS, parseSettings } from '../src/settings';

type ChangeHandler = (value: string | boolean) => unknown;

interface SettingRecord {
  kind: 'dropdown' | 'text' | 'textarea' | 'toggle';
  name: string;
  onChange: ChangeHandler;
  options?: Record<string, string>;
  value: string | boolean;
}

const obsidianMock = vi.hoisted(() => ({
  headings: [] as string[],
  notices: [] as string[],
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

    addTextArea(configure: (component: unknown) => void): this {
      this.addComponent('textarea', configure);
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

  class MockNotice {
    constructor(message: string) {
      obsidianMock.notices.push(message);
    }
  }

  return { Notice: MockNotice, PluginSettingTab: MockPluginSettingTab, Setting: MockSetting };
});

function makeTab(saveSettings = vi.fn(async () => undefined)) {
  const plugin = {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings,
    translator: () => createTranslator('en'),
  } as unknown as CuriosityDashboardPlugin;
  const tab = new DashboardSettingTab({} as App, plugin);
  tab.display();
  return { plugin, tab };
}

describe('dashboard settings', () => {
  beforeEach(() => {
    obsidianMock.headings.length = 0;
    obsidianMock.notices.length = 0;
    obsidianMock.settings.length = 0;
  });

  it('provides the complete default dashboard settings', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      topicDir: '10-选题池',
      topicInboxDir: '10-选题池/待评估',
      scriptDir: '40-脚本大纲',
      scriptDraftDir: '40-脚本大纲/草稿',
      assetDir: '20-素材库',
      reviewDir: '60-发布复盘',
      topicTemplate: '99-模板/选题卡模板.md',
      scriptTemplate: '99-模板/脚本大纲模板.md',
      reviewTemplate: '99-模板/发布复盘模板.md',
      promptDir: '99-模板/codex-提示词',
      backgroundPath: 'assets/default-background.png',
      logoPath: 'assets/IROLLAB_light.svg',
      openOnStartup: false,
      defaultTab: 'overview',
      enableMobileView: true,
      language: 'auto',
      focusHistory: [],
      rssSources: [],
      commentDocPath: '20-素材库/受众问题.md',
      hotspotArchiveDir: '30-竞品热点/热点观察',
      hotspotCacheTtlHours: 6,
      enabledHotspotSources: ['hacker-news', 'github-trending', 'rss', 'official-rss'],
      hotspotCache: {},
    });
  });

  it('accepts valid runtime settings', () => {
    const settings = {
      topicDir: 'topics',
      topicInboxDir: 'topics/待评估',
      scriptDir: 'scripts',
      scriptDraftDir: 'scripts/草稿',
      assetDir: 'assets',
      reviewDir: 'reviews',
      topicTemplate: 'templates/topic.md',
      scriptTemplate: 'templates/script.md',
      reviewTemplate: 'templates/review.md',
      promptDir: '自定义/提示词',
      backgroundPath: '',
      logoPath: '',
      openOnStartup: true,
      defaultTab: 'data',
      enableMobileView: false,
      language: 'en',
      focusHistory: [],
      rssSources: [],
      commentDocPath: '20-素材库/受众问题.md',
      hotspotArchiveDir: '30-竞品热点/热点观察',
      hotspotCacheTtlHours: 6,
      enabledHotspotSources: ['hacker-news', 'github-trending', 'rss', 'official-rss'],
      hotspotCache: {},
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
        language: 'fr',
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
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back language to auto for invalid values', () => {
    expect(parseSettings({ language: 'fr' }).language).toBe('auto');
    expect(parseSettings({ language: 5 }).language).toBe('auto');
    expect(parseSettings({ language: 'zh' }).language).toBe('zh');
    expect(parseSettings({ language: 'en' }).language).toBe('en');
  });

  it('uses defaults for non-object persisted data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('invalid')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('promptDir 默认值与解析', () => {
    expect(DEFAULT_SETTINGS.promptDir).toBe('99-模板/codex-提示词');
    expect(parseSettings({ promptDir: '自定义/目录' }).promptDir).toBe('自定义/目录');
    expect(parseSettings({ promptDir: '   ' }).promptDir).toBe('99-模板/codex-提示词');
  });

  it('defaultTab 接受 workflow', () => {
    expect(parseSettings({ defaultTab: 'workflow' }).defaultTab).toBe('workflow');
  });

  it('parses focus history entries and drops invalid ones', () => {
    expect(parseSettings({ focusHistory: 'no' }).focusHistory).toEqual([]);
    const parsed = parseSettings({
      focusHistory: [
        { path: 'a.md', switchedAt: 1000 },
        { path: '   ', switchedAt: 2 },
        { path: 'b.md' },
        'nope',
        null,
        { path: 'c.md', switchedAt: 'x' },
      ],
    }).focusHistory;
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ path: 'a.md', switchedAt: 1000 });
    expect(parsed[1]?.path).toBe('b.md');
    expect(typeof parsed[1]?.switchedAt).toBe('number');
    expect(parsed[2]?.path).toBe('c.md');
    expect(typeof parsed[2]?.switchedAt).toBe('number');
  });

  it('displays every setting with current values', () => {
    makeTab();

    expect(obsidianMock.headings).toEqual(['Curiosity Dashboard', 'Enabled hotspot sources']);
    expect(obsidianMock.settings.map(({ kind, name, value }) => ({ kind, name, value }))).toEqual([
      { kind: 'text', name: 'Topic directory', value: '10-选题池' },
      { kind: 'text', name: 'Script directory', value: '40-脚本大纲' },
      { kind: 'text', name: 'Asset directory', value: '20-素材库' },
      { kind: 'text', name: 'Review directory', value: '60-发布复盘' },
      { kind: 'text', name: 'Topic template', value: '99-模板/选题卡模板.md' },
      { kind: 'text', name: 'Script template', value: '99-模板/脚本大纲模板.md' },
      { kind: 'text', name: 'Review template', value: '99-模板/发布复盘模板.md' },
      { kind: 'text', name: 'Prompt template folder', value: '99-模板/codex-提示词' },
      { kind: 'text', name: 'Comment doc path', value: '20-素材库/受众问题.md' },
      { kind: 'text', name: 'Hotspot archive dir', value: '30-竞品热点/热点观察' },
      { kind: 'text', name: 'Background image', value: 'assets/default-background.png' },
      { kind: 'text', name: 'Logo image', value: 'assets/IROLLAB_light.svg' },
      { kind: 'textarea', name: 'RSS feeds (one per line)', value: '' },
      { kind: 'text', name: 'Hotspot cache TTL (hours)', value: '6' },
      { kind: 'toggle', name: 'Hacker News', value: true },
      { kind: 'toggle', name: 'GitHub Trending', value: true },
      { kind: 'toggle', name: 'Subscribed RSS', value: true },
      { kind: 'toggle', name: 'Official releases', value: true },
      { kind: 'toggle', name: 'Domestic trending (3rd-party, off by default)', value: false },
      { kind: 'toggle', name: 'Open on startup', value: false },
      { kind: 'dropdown', name: 'Default tab', value: 'overview' },
      { kind: 'toggle', name: 'Enable simplified mobile view', value: true },
      { kind: 'dropdown', name: 'Language', value: 'auto' },
    ]);
    expect(obsidianMock.settings[20]?.options).toEqual({
      overview: 'Overview', tasks: 'Tasks', workflow: 'Workflow', discover: 'Discover', data: 'Data',
    });
    expect(obsidianMock.settings[22]?.options).toEqual({ auto: 'Follow Obsidian', zh: '中文', en: 'English' });
  });

  it('persists every setting change', async () => {
    const { plugin } = makeTab();

    for (const setting of obsidianMock.settings.slice(0, 8)) {
      expect(setting.onChange('  changed  ')).toBeUndefined();
    }
    expect(obsidianMock.settings[8]?.onChange('changed')).toBeUndefined();
    expect(obsidianMock.settings[9]?.onChange('changed')).toBeUndefined();
    expect(obsidianMock.settings[10]?.onChange('changed')).toBeUndefined();
    expect(obsidianMock.settings[11]?.onChange('changed')).toBeUndefined();
    expect(obsidianMock.settings[12]?.onChange('https://a\nhttps://b')).toBeUndefined();
    expect(obsidianMock.settings[13]?.onChange('12')).toBeUndefined();
    expect(obsidianMock.settings[14]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[15]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[16]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[17]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[18]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[19]?.onChange(true)).toBeUndefined();
    expect(obsidianMock.settings[20]?.onChange('data')).toBeUndefined();
    expect(obsidianMock.settings[21]?.onChange(false)).toBeUndefined();
    expect(obsidianMock.settings[22]?.onChange('zh')).toBeUndefined();

    await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledTimes(23));

    expect(plugin.settings).toEqual({
      topicDir: 'changed',
      topicInboxDir: '10-选题池/待评估',
      scriptDir: 'changed',
      scriptDraftDir: '40-脚本大纲/草稿',
      assetDir: 'changed',
      reviewDir: 'changed',
      topicTemplate: 'changed',
      scriptTemplate: 'changed',
      reviewTemplate: 'changed',
      promptDir: 'changed',
      commentDocPath: 'changed',
      hotspotArchiveDir: 'changed',
      backgroundPath: 'changed',
      logoPath: 'changed',
      openOnStartup: true,
      defaultTab: 'data',
      enableMobileView: false,
      language: 'zh',
      focusHistory: [],
      rssSources: ['https://a', 'https://b'],
      hotspotCacheTtlHours: 12,
      enabledHotspotSources: ['hacker-news', 'github-trending', 'rss', 'official-rss', 'domestic-trending'],
      hotspotCache: {},
    });
    expect(plugin.saveSettings).toHaveBeenCalledTimes(23);
  });

  it('contains save failures at every onChange boundary and shows a notice', async () => {
    const saveSettings = vi.fn(async () => Promise.reject(new Error('disk full')));
    makeTab(saveSettings);

    for (const setting of [...obsidianMock.settings]) {
      const value = setting.kind === 'toggle'
        ? true
        : setting.kind === 'dropdown'
          ? (setting.name === 'Language' ? 'zh' : 'data')
          : setting.kind === 'textarea'
            ? 'https://a\nhttps://b'
            : 'changed';
      const result = setting.onChange(value);
      expect(result).toBeUndefined();
    }

    // 23 个控件中，TTL 文本框收到非数字 'changed' 不会触发保存，故只有 22 条失败通知。
    await vi.waitFor(() => expect(obsidianMock.notices).toHaveLength(22));
    expect(obsidianMock.notices.every((message) => message.includes('disk full'))).toBe(true);
  });
});

describe('发现 tab 设置', () => {
  it('默认值：rssSources=[]、commentDocPath、ttl=6、enabledHotspotSources 不含国内热榜、hotspotCache={}', () => {
    expect(DEFAULT_SETTINGS.rssSources).toEqual([]);
    expect(DEFAULT_SETTINGS.commentDocPath).toBe('20-素材库/受众问题.md');
    expect(DEFAULT_SETTINGS.hotspotCacheTtlHours).toBe(6);
    expect(DEFAULT_SETTINGS.hotspotArchiveDir).toBe('30-竞品热点/热点观察');
    expect(DEFAULT_SETTINGS.enabledHotspotSources).toEqual(['hacker-news', 'github-trending', 'rss', 'official-rss']);
    expect(DEFAULT_SETTINGS.hotspotCache).toEqual({});
  });

  it('discover 是合法 defaultTab', () => {
    expect(parseSettings({ defaultTab: 'discover' }).defaultTab).toBe('discover');
  });

  it('坏 rssSources/ttl 被纠正', () => {
    const s = parseSettings({ rssSources: ['https://a', 123, ''], hotspotCacheTtlHours: -3 });
    expect(s.rssSources).toEqual(['https://a']);
    expect(s.hotspotCacheTtlHours).toBe(6);
  });

  it('hotspotCache 非法结构归零为空对象', () => {
    expect(parseSettings({ hotspotCache: 'bad' }).hotspotCache).toEqual({});
  });
});
