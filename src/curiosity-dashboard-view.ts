import { ItemView, Notice, Platform, TFile, TFolder, type WorkspaceLeaf } from 'obsidian';

import type { ChecklistTask, DashboardModel, TopicRecord } from '@/domain/models';
import type { WorkflowAction } from '@/domain/workflow';
import type { TranslationKey } from '@/i18n/translations';
import type { Translator } from '@/i18n/translator';
import { buildPrompt } from '@/mutations/prompt-builder-service';
import {
  sanitizeTitle,
  TemplateNotFoundError,
} from '@/mutations/template-creation-service';
import type { Stage } from '@/domain/stages';
import { LatestRefresh, type RefreshOutcome } from '@/refresh-controller';
import type { DashboardSettings } from '@/settings';
import { DashboardRenderer, type AssociationField } from '@/ui/dashboard-renderer';
import { ConfirmStageModal } from '@/ui/confirm-stage-modal';
import { CreateFileModal, type CreateFileDefaults } from '@/ui/create-file-modal';
import { WorkPickerModal } from '@/ui/work-picker-modal';

import type CuriosityDashboardPlugin from './main';
import { DASHBOARD_VIEW_TYPE } from './constants';

type DashboardTab = DashboardSettings['defaultTab'];
const POST_CREATE_REFRESH_ATTEMPTS = 20;
const POST_CREATE_REFRESH_DELAY_MS = 25;

export class CuriosityDashboardView extends ItemView {
  private activeTab: DashboardTab;
  private persistedTab: DashboardTab;
  private persistedTabRevision = 0;
  private tabRevision = 0;
  private lastModel: DashboardModel | null = null;
  private creationPromise: Promise<void> | null = null;
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

  private get t(): Translator {
    return this.plugin.translator();
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

  async refresh(): Promise<RefreshOutcome> {
    if (Platform.isMobile && !this.plugin.settings.enableMobileView) {
      this.refreshController.invalidate();
      this.renderMobileDisabled();
      return { status: 'success' };
    }

    return this.refreshController.run(() =>
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
    status.createEl('h2', { text: this.t.t('view.loadingTitle') });
    status.createEl('p', { text: this.t.t('view.loadingBody') });
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
      switchFocus: (path) => this.switchFocus(path),
      openWorkPicker: () => this.openWorkPicker(),
      createTopic: () => this.runCreate('topic', null),
      createScript: (topic) => this.runCreate('script', topic),
      createReview: (topic) => this.runCreate('review', topic),
      copyPrompt: (action) => this.copyPrompt(action),
      openOutput: (path) => this.openOutput(path),
      seedPromptTemplates: () => this.seedPromptTemplates(),
    }, this.activeTab, this.t);
    this.plugin.updateObservedDataPaths(observedReviewPaths(model));
    if (focusActiveTab) activeButton.focus();
  }

  private async openPath(path: string): Promise<void> {
    try {
      await this.app.workspace.openLinkText(path, '', false);
    } catch (error) {
      this.showActionError('view.openFileFailed', error);
    }
  }

  private async toggleTask(path: string, task: ChecklistTask): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    try {
      await this.plugin.mutationService().toggleTask(path, task);
      await this.refresh();
    } catch (error) {
      this.showActionError('view.toggleTaskFailed', error);
    }
  }

  private async confirmAdvance(path: string, stage: Stage): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    if (!await ConfirmStageModal.ask(this.app, stage, this.t)) return;
    if (this.rejectReadOnlyWrite()) return;
    try {
      await this.plugin.mutationService().advanceStage(path, stage);
      await this.refresh();
    } catch (error) {
      this.showActionError('view.advanceFailed', error);
    }
  }

  private runCreate(
    kind: 'topic' | 'script' | 'review',
    topic: TopicRecord | null,
  ): Promise<void> {
    if (this.creationPromise !== null) return this.creationPromise;
    const operation = this.openCreate(kind, topic);
    this.creationPromise = operation;
    const clear = (): void => {
      if (this.creationPromise === operation) this.creationPromise = null;
    };
    void operation.then(clear, clear);
    return operation;
  }

  private async openCreate(
    kind: 'topic' | 'script' | 'review',
    topic: TopicRecord | null,
  ): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    if (kind !== 'topic') {
      const currentTopic = currentFocusTopic(this.lastModel);
      if (topic === null || currentTopic === null || topic.path !== currentTopic.path) {
        new Notice(this.t.t('view.focusChangedCreate'));
        return;
      }
      topic = currentTopic;
    }

    const defaults = this.createDefaults(kind, topic);
    const request = await CreateFileModal.ask(this.app, defaults, this.t);
    if (request === null) return;
    if (this.rejectReadOnlyWrite()) return;
    if (this.lastModel === null) {
      new Notice(this.t.t('view.stateChangedCancel'));
      return;
    }
    if (kind !== 'topic') {
      const currentTopic = currentFocusTopic(this.lastModel);
      if (topic === null || currentTopic === null || topic.path !== currentTopic.path) {
        new Notice(this.t.t('view.focusChangedCancel'));
        return;
      }
      topic = currentTopic;
    }

    let createdPath: string;
    try {
      createdPath = await this.plugin.templateService().create(request);
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        const opened = this.openSettings(true);
        new Notice(opened
          ? this.t.t('view.templateMissingOpened', { path: error.path })
          : this.t.t('view.templateMissingManual', { path: error.path }));
        return;
      }
      this.showActionError('view.createFailed', error);
      return;
    }

    let associationError: unknown = null;
    if (kind !== 'topic' && topic !== null) {
      let authoritativeTopic: TopicRecord | null = null;
      try {
        const authoritative = await this.plugin.dataService().load(Platform.isMobile);
        authoritativeTopic = currentFocusTopic(authoritative);
      } catch (error) {
        associationError = new Error(
          this.t.t('view.verifyFocusFailed', { detail: actionErrorMessage(error, this.t) }),
        );
      }
      if (associationError === null) {
        if (authoritativeTopic === null || authoritativeTopic.path !== topic.path) {
          associationError = new Error(this.t.t('view.focusChangedNotLinked'));
        } else {
          try {
            await this.plugin.mutationService().setAssociationPath(
              topic.path,
              kind === 'script' ? 'script_path' : 'review_path',
              createdPath,
              { requireHomepageFocus: true },
            );
          } catch (error) {
            associationError = error;
          }
        }
      }
    }

    let openError: unknown = null;
    try {
      await this.app.workspace.openLinkText(createdPath, '', false);
    } catch (error) {
      openError = error;
    }

    let refreshOutcome = await this.refresh();
    if (
      kind !== 'topic'
      && topic !== null
      && associationError === null
      && refreshOutcome.status !== 'error'
    ) {
      for (let attempt = 1;
        attempt < POST_CREATE_REFRESH_ATTEMPTS
        && !createdFocusVisible(this.lastModel, topic.path);
        attempt += 1) {
        await delay(POST_CREATE_REFRESH_DELAY_MS);
        refreshOutcome = await this.refresh();
        if (refreshOutcome.status === 'error') break;
      }
    }
    const refreshError = refreshOutcome.status === 'error' ? refreshOutcome.error : null;

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
      ? this.t.t('modal.createTopicHeading')
      : kind === 'script'
        ? this.t.t('modal.createScriptHeading')
        : this.t.t('modal.createReviewHeading');
    const targetPathFor = (valueIssue: number, valueTitle: string): string => {
      const safeTitle = sanitizeTitle(valueTitle);
      const filename = kind === 'topic'
        ? `${valueIssue}-${safeTitle}.md`
        : kind === 'script'
          ? `${valueIssue}-${safeTitle}脚本大纲.md`
          : `第${valueIssue}期-${safeTitle}-综合复盘.md`;
      const directory = kind === 'topic'
        ? settings.topicInboxDir
        : kind === 'script'
          ? settings.scriptDraftDir
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
    const t = this.t;
    const details: string[] = [];
    if (associationError !== null) {
      details.push(t.t('view.linkFailed', { detail: actionErrorMessage(associationError, t) }));
    }
    if (openError !== null) {
      details.push(t.t('view.openFailedDetail', { detail: actionErrorMessage(openError, t) }));
    }
    if (refreshError !== null) {
      details.push(t.t('view.refreshFailedDetail', { detail: actionErrorMessage(refreshError, t) }));
    }
    const associated = kind !== 'topic' && associationError === null;
    new Notice(t.t('view.partialResult', {
      suffix: associated ? t.t('view.linkedSuffix') : '',
      details: details.join(t.t('view.detailJoin')),
    }));
  }

  private openSettings(silent = false): boolean {
    try {
      const setting = (this.app as typeof this.app & {
        setting?: { open?: unknown; openTabById?: unknown };
      }).setting;
      if (
        setting === undefined ||
        typeof setting.open !== 'function' ||
        typeof setting.openTabById !== 'function'
      ) {
        throw new Error(this.t.t('view.noSettingsEntry'));
      }
      setting.open.call(setting);
      setting.openTabById.call(setting, this.plugin.manifest.id);
      return true;
    } catch (error) {
      if (!silent) this.showActionError('view.openSettingsFailed', error);
      return false;
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
      this.showActionError('view.saveTabFailed', error);
    }
  }

  private async setAssociation(
    topicPath: string,
    field: AssociationField,
    value: string,
  ): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    try {
      await this.plugin.mutationService().setAssociationPath(
        topicPath,
        field,
        value,
        { requireHomepageFocus: true },
      );
      await this.refresh();
    } catch (error) {
      this.showActionError('view.saveAssociationFailed', error);
    }
  }

  private async switchFocus(targetPath: string): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    if (this.lastModel === null) return;
    const fromPath = currentFocusTopic(this.lastModel)?.path ?? null;
    if (fromPath === targetPath) return;
    try {
      await this.plugin.mutationService().switchHomepageFocus(fromPath, targetPath);
      this.plugin.recordFocusSwitch(targetPath);
      await this.refresh();
    } catch (error) {
      this.showActionError('view.switchFocusFailed', error);
    }
  }

  private async openWorkPicker(): Promise<void> {
    if (this.lastModel === null) return;
    const target = await WorkPickerModal.ask(
      this.app,
      this.lastModel.pickableTopics,
      currentFocusTopic(this.lastModel)?.path ?? null,
      this.t,
    );
    if (target === null) return;
    await this.switchFocus(target);
  }

  private async copyPrompt(action: WorkflowAction): Promise<void> {
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    const result = buildPrompt(action, this.lastModel, this.plugin.settings);
    try {
      await navigator.clipboard.writeText(result.text);
      new Notice(this.t.t('workflow.copied', {
        label: result.label, output: result.output ?? this.t.t('workflow.readonlyOutput'),
      }));
    } catch {
      // 回退：写入临时文件并打开
      const tempPath = `${this.plugin.settings.promptDir}/_临时-${Date.now()}.md`;
      try {
        await this.plugin.gateway.create(tempPath, result.text);
        await this.app.workspace.openLinkText(tempPath, '', false);
        new Notice(this.t.t('workflow.copyFailed', { path: tempPath }));
      } catch (error) {
        this.showActionError('view.createFailed', error);
      }
    }
  }

  private async openOutput(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.openPath(path);
      return;
    }
    if (file instanceof TFolder) {
      const revealed = this.revealFolder(file);
      if (!revealed) new Notice(this.t.t('workflow.outputMissing'));
      return;
    }
    new Notice(this.t.t('workflow.outputMissing'));
  }

  private revealFolder(folder: TFolder): boolean {
    try {
      const explorer = (this.app as typeof this.app & {
        internalPlugins?: { getPluginById?: (id: string) => { instance?: { revealInFolder?: (f: unknown) => void } } | null };
      }).internalPlugins?.getPluginById?.('file-explorer');
      const instance = explorer?.instance;
      const reveal = instance?.revealInFolder;
      if (typeof reveal !== 'function') return false;
      reveal.call(instance, folder);
      return true;
    } catch {
      return false;
    }
  }

  private async seedPromptTemplates(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    try {
      const dir = this.plugin.settings.promptDir;
      if (this.app.vault.getAbstractFileByPath(dir) === null) {
        await this.app.vault.createFolder(dir);
      }
      await this.plugin.promptSeedService().seed(dir);
      new Notice(this.t.t('workflow.seeded', { dir }));
      await this.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : this.t.t('common.unknownError');
      new Notice(this.t.t('workflow.seedFailed', { detail }));
    }
  }

  private showActionError(context: TranslationKey, error: unknown): void {
    new Notice(this.t.t('common.contextDetail', {
      context: this.t.t(context),
      detail: actionErrorMessage(error, this.t),
    }));
  }

  private rejectReadOnlyWrite(): boolean {
    if (!Platform.isMobile && this.lastModel?.mobileReadOnly !== true) return false;
    new Notice(this.t.t('view.mobileReadonlyModify'));
    return true;
  }

  private renderError(error: unknown): void {
    this.prepareContent('curiosity-dashboard--error');
    const state = this.contentEl.createDiv({ cls: 'curiosity-dashboard-state' });
    state.createEl('h2', { text: this.t.t('view.errorTitle') });
    state.createEl('p', { text: errorMessage(error, this.t) });
    const retry = state.createEl('button', { text: this.t.t('view.retry'), type: 'button' });
    retry.addEventListener('click', () => void this.refresh());
  }

  private renderMobileDisabled(): void {
    this.prepareContent('curiosity-dashboard--mobile-disabled');
    const state = this.contentEl.createDiv({ cls: 'curiosity-dashboard-state' });
    state.createEl('h2', { text: this.t.t('view.mobileDisabledTitle') });
    state.createEl('p', { text: this.t.t('view.mobileDisabledBody') });
  }
}

function errorMessage(error: unknown, t: Translator): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t.t('view.unknownLoadError');
}

function actionErrorMessage(error: unknown, t: Translator): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t.t('common.unknownError');
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

function createdFocusVisible(
  model: DashboardModel | null,
  topicPath: string,
): boolean {
  if (model === null) return false;
  return currentFocusTopic(model)?.path === topicPath;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function observedReviewPaths(model: DashboardModel): string[] {
  const topic = currentFocusTopic(model);
  return [...new Set([topic?.reviewPath, model.reviewPath].filter(
    (path): path is string => path !== null && path !== undefined,
  ))];
}

function joinVaultPath(directory: string, filename: string): string {
  const normalizedDirectory = directory.replaceAll('\\', '/').replace(/\/+$/, '');
  return normalizedDirectory.length === 0 ? filename : `${normalizedDirectory}/${filename}`;
}
