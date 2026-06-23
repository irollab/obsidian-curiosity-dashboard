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
        this.plugin.settings.openOnStartup = value;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(this.containerEl).setName('Default tab').addDropdown((dropdown) =>
      dropdown
        .addOptions({ overview: 'Overview', tasks: 'Tasks', data: 'Data' })
        .setValue(this.plugin.settings.defaultTab)
        .onChange(async (value) => {
          this.plugin.settings.defaultTab = value as DashboardSettings['defaultTab'];
          await this.plugin.saveSettings();
        }),
    );

    new Setting(this.containerEl)
      .setName('Enable simplified mobile view')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableMobileView).onChange(async (value) => {
          this.plugin.settings.enableMobileView = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private addText(name: string, key: TextSettingKey): void {
    new Setting(this.containerEl).setName(name).addText((text) =>
      text.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      }),
    );
  }
}
