import { ItemView, Notice, Platform, type WorkspaceLeaf } from 'obsidian';

import type { ChecklistTask, DashboardModel, TopicRecord } from '@/domain/models';
import { sanitizeTitle } from '@/mutations/template-creation-service';
import type { Stage } from '@/domain/stages';
import { LatestRefresh } from '@/refresh-controller';
import type { DashboardSettings } from '@/settings';
import { DashboardRenderer, type AssociationField } from '@/ui/dashboard-renderer';
import { ConfirmStageModal } from '@/ui/confirm-stage-modal';
import { CreateFileModal, type CreateFileDefaults } from '@/ui/create-file-modal';

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
      createTopic: () => this.openCreate('topic', null),
      createScript: (topic) => this.openCreate('script', topic),
      createReview: (topic) => this.openCreate('review', topic),
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
    if (!await ConfirmStageModal.ask(this.app, stage)) return;
    try {
      await this.plugin.mutationService().advanceStage(path, stage);
      await this.refresh();
    } catch (error) {
      this.showActionError('无法推进阶段', error);
    }
  }

  private async openCreate(
    kind: 'topic' | 'script' | 'review',
    topic: TopicRecord | null,
  ): Promise<void> {
    if (this.lastModel === null) {
      new Notice('Dashboard 数据尚未加载，不能创建文件。');
      return;
    }
    if (this.lastModel.mobileReadOnly) {
      new Notice('移动端只读，不能创建文件。');
      return;
    }
    if (kind !== 'topic') {
      const currentTopic = currentFocusTopic(this.lastModel);
      if (topic === null || currentTopic === null || topic.path !== currentTopic.path) {
        new Notice('当前作品已变化，不能创建关联文件。');
        return;
      }
      topic = currentTopic;
    }

    const defaults = this.createDefaults(kind, topic);
    const request = await CreateFileModal.ask(this.app, defaults);
    if (request === null) return;
    if (this.lastModel === null || this.lastModel.mobileReadOnly) {
      new Notice('Dashboard 状态已变化，已取消创建。');
      return;
    }
    if (kind !== 'topic') {
      const currentTopic = currentFocusTopic(this.lastModel);
      if (topic === null || currentTopic === null || topic.path !== currentTopic.path) {
        new Notice('当前作品已变化，已取消创建。');
        return;
      }
      topic = currentTopic;
    }

    try {
      await this.plugin.templateService().create(request);
    } catch (error) {
      this.showActionError('创建失败', error);
      return;
    }

    let associationError: unknown = null;
    if (kind !== 'topic' && topic !== null) {
      try {
        await this.plugin.mutationService().setAssociationPath(
          topic.path,
          kind === 'script' ? 'script_path' : 'review_path',
          request.targetPath,
        );
      } catch (error) {
        associationError = error;
      }
    }

    let openError: unknown = null;
    try {
      await this.app.workspace.openLinkText(request.targetPath, '', false);
    } catch (error) {
      openError = error;
    }

    let refreshError: unknown = null;
    try {
      await this.refresh();
    } catch (error) {
      refreshError = error;
    }

    if (associationError !== null || openError !== null || refreshError !== null) {
      this.showPartialCreationResult(kind, associationError, openError, refreshError);
    }
  }

  private createDefaults(
    kind: 'topic' | 'script' | 'review',
    topic: TopicRecord | null,
  ): CreateFileDefaults {
    const settings = this.plugin.settings;
    const issue = kind === 'topic' ? nextVisibleIssue(this.lastModel) : topic?.issue ?? 1;
    const title = kind === 'topic' ? '新选题' : topic?.title ?? '';
    const templatePath = kind === 'topic'
      ? settings.topicTemplate
      : kind === 'script'
        ? settings.scriptTemplate
        : settings.reviewTemplate;
    const heading = kind === 'topic'
      ? '创建选题卡'
      : kind === 'script'
        ? '创建脚本'
        : '创建发布复盘';
    const targetPathFor = (valueIssue: number, valueTitle: string): string => {
      const safeTitle = sanitizeTitle(valueTitle);
      const filename = kind === 'topic'
        ? `${valueIssue}-${safeTitle}.md`
        : kind === 'script'
          ? `${valueIssue}-${safeTitle}成稿.md`
          : `第${valueIssue}期-${safeTitle}-综合复盘.md`;
      const directory = kind === 'topic'
        ? settings.topicDir
        : kind === 'script'
          ? settings.scriptDir
          : settings.reviewDir;
      return joinVaultPath(directory, filename);
    };

    return {
      heading,
      issue,
      targetPath: targetPathFor(issue, title),
      targetPathFor,
      templatePath,
      title,
    };
  }

  private showPartialCreationResult(
    kind: 'topic' | 'script' | 'review',
    associationError: unknown,
    openError: unknown,
    refreshError: unknown,
  ): void {
    const details: string[] = [];
    if (associationError !== null) {
      details.push(`关联失败：${errorMessage(associationError)}`);
    }
    if (openError !== null) details.push(`无法打开：${errorMessage(openError)}`);
    if (refreshError !== null) {
      details.push(`无法刷新 Dashboard：${errorMessage(refreshError)}`);
    }
    const associated = kind !== 'topic' && associationError === null;
    new Notice(`文件已创建${associated ? '并关联' : ''}，但${details.join('；且')}`);
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

function nextVisibleIssue(model: DashboardModel | null): number {
  if (model === null) return 1;
  const topics: TopicRecord[] = [...model.thisWeek, ...model.queue];
  if (model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage') {
    topics.push(model.focus.topic);
  } else if (model.focus.kind === 'multiple') {
    topics.push(...model.focus.topics);
  }
  const maximum = topics.reduce((value, topic) => Math.max(value, topic.issue), 0);
  return maximum < Number.MAX_SAFE_INTEGER ? Math.max(1, maximum + 1) : Number.MAX_SAFE_INTEGER;
}

function currentFocusTopic(model: DashboardModel): TopicRecord | null {
  return model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic
    : null;
}

function joinVaultPath(directory: string, filename: string): string {
  const normalizedDirectory = directory.replaceAll('\\', '/').replace(/\/+$/, '');
  return normalizedDirectory.length === 0 ? filename : `${normalizedDirectory}/${filename}`;
}
