import { type App, PluginSettingTab, Setting } from 'obsidian';

import type CuriosityDashboardPlugin from './main';

export interface DashboardSettings {
  topicDir: string;
  scriptDir: string;
  assetDir: string;
  reviewDir: string;
  topicTemplate: string;
  scriptTemplate: string;
  reviewTemplate: string;
  backgroundPath: string;
  openOnStartup: boolean;
  defaultTab: 'overview' | 'tasks' | 'data';
  enableMobileView: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
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
};

const DEFAULT_TABS: ReadonlySet<string> = new Set(['overview', 'tasks', 'data']);

export function parseSettings(raw: unknown): DashboardSettings {
  const values = isRecord(raw) ? raw : {};
  return {
    topicDir: nonEmptyStringOr(values.topicDir, DEFAULT_SETTINGS.topicDir),
    scriptDir: nonEmptyStringOr(values.scriptDir, DEFAULT_SETTINGS.scriptDir),
    assetDir: nonEmptyStringOr(values.assetDir, DEFAULT_SETTINGS.assetDir),
    reviewDir: nonEmptyStringOr(values.reviewDir, DEFAULT_SETTINGS.reviewDir),
    topicTemplate: nonEmptyStringOr(values.topicTemplate, DEFAULT_SETTINGS.topicTemplate),
    scriptTemplate: nonEmptyStringOr(values.scriptTemplate, DEFAULT_SETTINGS.scriptTemplate),
    reviewTemplate: nonEmptyStringOr(values.reviewTemplate, DEFAULT_SETTINGS.reviewTemplate),
    backgroundPath:
      typeof values.backgroundPath === 'string' ? values.backgroundPath : DEFAULT_SETTINGS.backgroundPath,
    openOnStartup:
      typeof values.openOnStartup === 'boolean' ? values.openOnStartup : DEFAULT_SETTINGS.openOnStartup,
    defaultTab: isDefaultTab(values.defaultTab) ? values.defaultTab : DEFAULT_SETTINGS.defaultTab,
    enableMobileView:
      typeof values.enableMobileView === 'boolean'
        ? values.enableMobileView
        : DEFAULT_SETTINGS.enableMobileView,
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

type TextSettingKey =
  | 'topicDir'
  | 'scriptDir'
  | 'assetDir'
  | 'reviewDir'
  | 'topicTemplate'
  | 'scriptTemplate'
  | 'reviewTemplate'
  | 'backgroundPath';

export class DashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CuriosityDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: 'Curiosity Dashboard' });
    this.addText('Topic directory', 'topicDir');
    this.addText('Script directory', 'scriptDir');
    this.addText('Asset directory', 'assetDir');
    this.addText('Review directory', 'reviewDir');
    this.addText('Topic template', 'topicTemplate');
    this.addText('Script template', 'scriptTemplate');
    this.addText('Review template', 'reviewTemplate');
    this.addText('Background image', 'backgroundPath');

    new Setting(this.containerEl).setName('Open on startup').addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (value) => {
        await this.updateSetting('openOnStartup', value);
      }),
    );

    new Setting(this.containerEl).setName('Default tab').addDropdown((dropdown) =>
      dropdown
        .addOptions({ overview: 'Overview', tasks: 'Tasks', data: 'Data' })
        .setValue(this.plugin.settings.defaultTab)
        .onChange(async (value) => {
          if (isDefaultTab(value)) await this.updateSetting('defaultTab', value);
        }),
    );

    new Setting(this.containerEl)
      .setName('Enable simplified mobile view')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableMobileView).onChange(async (value) => {
          await this.updateSetting('enableMobileView', value);
        }),
      );
  }

  private addText(name: string, key: TextSettingKey): void {
    new Setting(this.containerEl).setName(name).addText((text) =>
      text.setValue(this.plugin.settings[key]).onChange(async (value) => {
        await this.updateSetting(key, value.trim());
      }),
    );
  }

  private async updateSetting<K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K],
  ): Promise<void> {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }
}
