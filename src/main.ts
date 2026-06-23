import { Notice, Plugin } from 'obsidian';

import {
  DashboardSettingTab,
  DEFAULT_SETTINGS,
  parseSettings,
  type DashboardSettings,
} from './settings';

export default class CuriosityDashboardPlugin extends Plugin {
  settings: DashboardSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.addSettingTab(new DashboardSettingTab(this.app, this));
    this.addCommand({
      id: 'open-curiosity-dashboard',
      name: 'Open Curiosity Dashboard',
      callback: () => {
        new Notice('Curiosity Dashboard is loaded');
      },
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
