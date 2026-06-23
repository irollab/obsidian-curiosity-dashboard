import { ItemView, Platform, type WorkspaceLeaf } from 'obsidian';

import type { DashboardModel } from '@/domain/models';
import { LatestRefresh } from '@/refresh-controller';
import type { DashboardSettings } from '@/settings';

import type CuriosityDashboardPlugin from './main';
import { DASHBOARD_VIEW_TYPE } from './constants';

type DashboardTab = DashboardSettings['defaultTab'];

export class CuriosityDashboardView extends ItemView {
  private activeTab: DashboardTab;
  private readonly refreshController: LatestRefresh<DashboardModel>;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: CuriosityDashboardPlugin,
  ) {
    super(leaf);
    this.activeTab = plugin.settings.defaultTab;
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

  private renderModel(model: DashboardModel): void {
    this.prepareContent('curiosity-dashboard--ready');
    const shell = this.contentEl.createDiv({ cls: 'curiosity-dashboard-shell' });
    shell.dataset.activeTab = this.activeTab;
    shell.createEl('h1', { text: 'Chase your curiosity' });
    shell.createEl('p', { text: focusSummary(model) });
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

function focusSummary(model: DashboardModel): string {
  if (model.focus.kind === 'ready') return model.focus.topic.title;
  if (model.focus.kind === 'multiple') return '检测到多个当前作品，请先解决焦点冲突。';
  if (model.focus.kind === 'invalid-stage') return '当前作品的阶段无法识别。';
  return '尚未设置当前作品。';
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : '读取本地数据时发生未知错误，请重试。';
}
