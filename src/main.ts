import { Notice, Plugin } from 'obsidian';

export default class CuriosityDashboardPlugin extends Plugin {
  override onload(): void {
    this.addCommand({
      id: 'open-curiosity-dashboard',
      name: 'Open Curiosity Dashboard',
      callback: () => {
        new Notice('Curiosity Dashboard is loaded');
      },
    });
  }
}
