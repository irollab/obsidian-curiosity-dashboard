import { ItemView, Notice, Platform, type WorkspaceLeaf } from 'obsidian';

import type { ChecklistTask, DashboardModel } from '@/domain/models';
import type { Stage } from '@/domain/stages';
import { LatestRefresh } from '@/refresh-controller';
import type { DashboardSettings } from '@/settings';
import { DashboardRenderer, type AssociationField } from '@/ui/dashboard-renderer';

import type CuriosityDashboardPlugin from './main';
import { DASHBOARD_VIEW_TYPE } from './constants';

type DashboardTab = DashboardSettings['defaultTab'];

export class CuriosityDashboardView extends ItemView {
  private activeTab: DashboardTab;
  private persistedTab: DashboardTab;
  private persistedTabRevision = 0;
  private tabRevision = 0;
  private lastModel: DashboardModel | null = null;
  private readonly refreshController: LatestRefresh<DashboardModel>;
  private readonly renderer = new DashboardRenderer();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: CuriosityDashboardPlugin,
  ) {
    super(leaf);
    this.activeTab = plugin.settings.defaultTab;
    this.persistedTab = plugin.settings.defaultTab;
    this.refreshController = new LatestRefresh<DashboardModel>({
      loading: () => this.renderLoading(),
      success: (model) => this.renderModel(model),
      error: (error) => this.renderError(error),
    });
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Curiosity Dashboard';
  }

  getIcon(): string {
    return 'telescope';
  }

  override async onOpen(): Promise<void> {
    await this.refresh();
  }

  override async onClose(): Promise<void> {
    this.refreshController.dispose();
    this.lastModel = null;
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    if (Platform.isMobile && !this.plugin.settings.enableMobileView) {
      this.refreshController.invalidate();
      this.renderMobileDisabled();
      return;
    }

    await this.refreshController.run(() =>
      this.plugin.dataService().load(Platform.isMobile),
    );
  }

  private prepareContent(stateClass: string): void {
    this.contentEl.empty();
    this.contentEl.addClass('curiosity-dashboard');
    this.contentEl.removeClass(
      'curiosity-dashboard--loading',
      'curiosity-dashboard--ready',
      'curiosity-dashboard--error',
      'curiosity-dashboard--mobile-disabled',
    );
    this.contentEl.addClass(stateClass);
  }

  private renderLoading(): void {
    this.prepareContent('curiosity-dashboard--loading');
    const status = this.contentEl.createDiv({ cls: 'curiosity-dashboard-state' });
    status.createEl('h2', { text: '正在加载 Curiosity Dashboard' });
    status.createEl('p', { text: '正在读取本地 Markdown 数据…' });
  }

  private renderModel(model: DashboardModel, focusActiveTab = false): void {
    this.prepareContent('curiosity-dashboard--ready');
    this.lastModel = model;
    const activeButton = this.renderer.render(this.contentEl, model, {
      openPath: (path) => this.openPath(path),
      toggleTask: (path, task) => this.toggleTask(path, task),
      confirmAdvance: (path, stage) => this.confirmAdvance(path, stage),
      openSettings: () => this.openSettings(),
      selectTab: (tab) => this.selectTab(tab),
      setAssociation: (topicPath, field, value) =>
        this.setAssociation(topicPath, field, value),
    }, this.activeTab);
    if (focusActiveTab) activeButton.focus();
  }

  private async openPath(path: string): Promise<void> {
    try {
      await this.app.workspace.openLinkText(path, '', false);
    } catch (error) {
      this.showActionError('无法打开文件', error);
    }
  }

  private async toggleTask(path: string, task: ChecklistTask): Promise<void> {
    try {
      await this.plugin.mutationService().toggleTask(path, task);
      await this.refresh();
    } catch (error) {
      this.showActionError('无法更新任务', error);
    }
  }

  private async confirmAdvance(path: string, stage: Stage): Promise<void> {
    if (!window.confirm(`从「${stage}」推进到下一阶段？`)) return;
    try {
      await this.plugin.mutationService().advanceStage(path, stage);
      await this.refresh();
    } catch (error) {
      this.showActionError('无法推进阶段', error);
    }
  }

  private openSettings(): void {
    try {
      const setting = (this.app as typeof this.app & {
        setting?: { open?: unknown; openTabById?: unknown };
      }).setting;
      if (
        setting === undefined ||
        typeof setting.open !== 'function' ||
        typeof setting.openTabById !== 'function'
      ) {
        throw new Error('当前 Obsidian 版本未提供设置入口');
      }
      setting.open.call(setting);
      setting.openTabById.call(setting, this.plugin.manifest.id);
    } catch (error) {
      this.showActionError('无法打开插件设置', error);
    }
  }

  private async selectTab(tab: DashboardTab): Promise<void> {
    if (tab === this.activeTab) return;
    const revision = ++this.tabRevision;
    this.activeTab = tab;
    this.plugin.settings.defaultTab = tab;
    if (this.lastModel !== null) this.renderModel(this.lastModel, true);
    try {
      await this.plugin.saveSettings();
      if (revision > this.persistedTabRevision) {
        this.persistedTabRevision = revision;
        this.persistedTab = tab;
      }
    } catch (error) {
      if (revision === this.tabRevision) {
        this.activeTab = this.persistedTab;
        this.plugin.settings.defaultTab = this.persistedTab;
        if (this.lastModel !== null) this.renderModel(this.lastModel, true);
      }
      this.showActionError('无法保存当前标签', error);
    }
  }

  private async setAssociation(
    topicPath: string,
    field: AssociationField,
    value: string,
  ): Promise<void> {
    try {
      await this.plugin.mutationService().setAssociationPath(topicPath, field, value);
      await this.refresh();
    } catch (error) {
      this.showActionError('无法保存关联路径', error);
    }
  }

  private showActionError(context: string, error: unknown): void {
    const detail = error instanceof Error && error.message.trim().length > 0
      ? error.message
      : '未知错误';
    new Notice(`${context}：${detail}`);
  }

  private renderError(error: unknown): void {
    this.prepareContent('curiosity-dashboard--error');
    const state = this.contentEl.createDiv({ cls: 'curiosity-dashboard-state' });
    state.createEl('h2', { text: 'Dashboard 加载失败' });
    state.createEl('p', { text: errorMessage(error) });
    const retry = state.createEl('button', { text: '重试', type: 'button' });
    retry.addEventListener('click', () => void this.refresh());
  }

  private renderMobileDisabled(): void {
    this.prepareContent('curiosity-dashboard--mobile-disabled');
    const state = this.contentEl.createDiv({ cls: 'curiosity-dashboard-state' });
    state.createEl('h2', { text: '移动端视图已关闭' });
    state.createEl('p', { text: '请在插件设置中启用移动端简化视图。' });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : '读取本地数据时发生未知错误，请重试。';
}
