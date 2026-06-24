import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type { LanguageSetting } from '@/i18n/locale';

import type { FocusHistoryEntry } from '@/domain/models';

import type CuriosityDashboardPlugin from './main';

export interface DashboardSettings {
  topicDir: string;
  topicInboxDir: string;
  scriptDir: string;
  scriptDraftDir: string;
  assetDir: string;
  reviewDir: string;
  topicTemplate: string;
  scriptTemplate: string;
  reviewTemplate: string;
  promptDir: string;
  backgroundPath: string;
  openOnStartup: boolean;
  defaultTab: 'overview' | 'tasks' | 'workflow' | 'data';
  enableMobileView: boolean;
  language: LanguageSetting;
  focusHistory: FocusHistoryEntry[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
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
  backgroundPath: '',
  openOnStartup: false,
  defaultTab: 'overview',
  enableMobileView: true,
  language: 'auto',
  focusHistory: [],
};

const DEFAULT_TABS: ReadonlySet<string> = new Set(['overview', 'tasks', 'workflow', 'data']);

export function parseSettings(raw: unknown): DashboardSettings {
  const values = isRecord(raw) ? raw : {};
  return {
    topicDir: nonEmptyStringOr(values.topicDir, DEFAULT_SETTINGS.topicDir),
    topicInboxDir: nonEmptyStringOr(values.topicInboxDir, DEFAULT_SETTINGS.topicInboxDir),
    scriptDir: nonEmptyStringOr(values.scriptDir, DEFAULT_SETTINGS.scriptDir),
    scriptDraftDir: nonEmptyStringOr(values.scriptDraftDir, DEFAULT_SETTINGS.scriptDraftDir),
    assetDir: nonEmptyStringOr(values.assetDir, DEFAULT_SETTINGS.assetDir),
    reviewDir: nonEmptyStringOr(values.reviewDir, DEFAULT_SETTINGS.reviewDir),
    topicTemplate: nonEmptyStringOr(values.topicTemplate, DEFAULT_SETTINGS.topicTemplate),
    scriptTemplate: nonEmptyStringOr(values.scriptTemplate, DEFAULT_SETTINGS.scriptTemplate),
    reviewTemplate: nonEmptyStringOr(values.reviewTemplate, DEFAULT_SETTINGS.reviewTemplate),
    promptDir: nonEmptyStringOr(values.promptDir, DEFAULT_SETTINGS.promptDir),
    backgroundPath:
      typeof values.backgroundPath === 'string' ? values.backgroundPath : DEFAULT_SETTINGS.backgroundPath,
    openOnStartup:
      typeof values.openOnStartup === 'boolean' ? values.openOnStartup : DEFAULT_SETTINGS.openOnStartup,
    defaultTab: isDefaultTab(values.defaultTab) ? values.defaultTab : DEFAULT_SETTINGS.defaultTab,
    enableMobileView:
      typeof values.enableMobileView === 'boolean'
        ? values.enableMobileView
        : DEFAULT_SETTINGS.enableMobileView,
    language: isLanguageSetting(values.language) ? values.language : DEFAULT_SETTINGS.language,
    focusHistory: parseFocusHistory(values.focusHistory),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyStringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function isDefaultTab(value: unknown): value is DashboardSettings['defaultTab'] {
  return typeof value === 'string' && DEFAULT_TABS.has(value);
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'auto' || value === 'zh' || value === 'en';
}

function parseFocusHistory(raw: unknown): FocusHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): FocusHistoryEntry | null => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.path !== 'string' || record.path.trim().length === 0) return null;
      const switchedAt =
        typeof record.switchedAt === 'number' && Number.isFinite(record.switchedAt)
          ? record.switchedAt
          : Date.now();
      return { path: record.path.trim(), switchedAt };
    })
    .filter((entry): entry is FocusHistoryEntry => entry !== null);
}

type TextSettingKey =
  | 'topicDir'
  | 'scriptDir'
  | 'assetDir'
  | 'reviewDir'
  | 'topicTemplate'
  | 'scriptTemplate'
  | 'reviewTemplate'
  | 'promptDir'
  | 'backgroundPath';

export class DashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CuriosityDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const t = this.plugin.translator().t;
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: t('settings.heading') });
    this.addText(t('settings.topicDir'), 'topicDir');
    this.addText(t('settings.scriptDir'), 'scriptDir');
    this.addText(t('settings.assetDir'), 'assetDir');
    this.addText(t('settings.reviewDir'), 'reviewDir');
    this.addText(t('settings.topicTemplate'), 'topicTemplate');
    this.addText(t('settings.scriptTemplate'), 'scriptTemplate');
    this.addText(t('settings.reviewTemplate'), 'reviewTemplate');
    this.addText(t('settings.promptDir'), 'promptDir');
    this.addText(t('settings.backgroundPath'), 'backgroundPath');

    new Setting(this.containerEl).setName(t('settings.openOnStartup')).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.openOnStartup).onChange((value) => {
        this.updateSetting('openOnStartup', value);
      }),
    );

    new Setting(this.containerEl).setName(t('settings.defaultTab')).addDropdown((dropdown) =>
      dropdown
        .addOptions({
          overview: t('tab.overview'),
          tasks: t('tab.tasks'),
          workflow: t('tab.workflow'),
          data: t('tab.data'),
        })
        .setValue(this.plugin.settings.defaultTab)
        .onChange((value) => {
          if (isDefaultTab(value)) this.updateSetting('defaultTab', value);
        }),
    );

    new Setting(this.containerEl)
      .setName(t('settings.enableMobileView'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableMobileView).onChange((value) => {
          this.updateSetting('enableMobileView', value);
        }),
      );

    new Setting(this.containerEl).setName(t('settings.language')).addDropdown((dropdown) =>
      dropdown
        .addOptions({
          auto: t('settings.language.auto'),
          zh: t('settings.language.zh'),
          en: t('settings.language.en'),
        })
        .setValue(this.plugin.settings.language)
        .onChange((value) => {
          if (isLanguageSetting(value)) {
            this.updateSetting('language', value);
            this.display();
          }
        }),
    );
  }

  private addText(name: string, key: TextSettingKey): void {
    new Setting(this.containerEl).setName(name).addText((text) =>
      text.setValue(this.plugin.settings[key]).onChange((value) => {
        this.updateSetting(key, value.trim());
      }),
    );
  }

  private updateSetting<K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K],
  ): void {
    this.plugin.settings[key] = value;
    void this.plugin.saveSettings().catch((error: unknown) => {
      const t = this.plugin.translator().t;
      const detail = error instanceof Error ? error.message : t('common.unknownError');
      new Notice(t('settings.saveFailed', { detail }));
    });
  }
}
