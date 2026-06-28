import { ItemView, Notice, Platform, TFile, TFolder, type WorkspaceLeaf } from 'obsidian';

import type { ChecklistTask, DashboardModel, TopicRecord } from '@/domain/models';
import type { WorkflowAction } from '@/domain/workflow';
import type { Hotspot, AudienceSignal, HotspotSourceResult } from '@/domain/discovery';
import type { TranslationKey } from '@/i18n/translations';
import type { Translator } from '@/i18n/translator';
import { buildPrompt, nextTopicIssue } from '@/mutations/prompt-builder-service';
import { buildDiscoveryPrompt } from '@/mutations/discovery-prompt-builder';
import { buildHotspotArchive, hotspotArchivePath } from '@/mutations/hotspot-archive-builder';
import { resultsToCache } from '@/data/hotspot-fetch-service';
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
import { IdeaCaptureModal } from '@/ui/idea-capture-modal';
import { ideaInboxPath } from '@/data/idea-inbox';
import type { WorkflowGroup } from '@/domain/workflow';

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
  private pendingWorkflowGroup: WorkflowGroup | null = null;
  private hotspotsLoading = false;
  private hotspotsAutoChecked = false;
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
      captureIdea: () => this.captureIdea(),
      createScript: (topic) => this.runCreate('script', topic),
      createReview: (topic) => this.runCreate('review', topic),
      copyPrompt: (action, ideas) => this.copyPrompt(action, ideas),
      openOutput: (path) => this.openOutput(path),
      seedPromptTemplates: () => this.seedPromptTemplates(),
      editIdea: (line, currentText) => this.editIdea(line, currentText),
      deleteIdea: (line) => this.deleteIdea(line),
      openWorkflowIdeas: () => this.openWorkflowIdeas(),
      refreshHotspots: () => this.refreshHotspots(),
      archiveHotspots: () => this.archiveHotspots(),
      copyDiscoveryPrompt: (hotspots, signals) => this.copyDiscoveryPrompt(hotspots, signals),
      openHotspot: (url) => this.openHotspot(url),
      promoteTopic: (path) => this.promoteTopic(path),
    }, this.activeTab, this.t, this.pendingWorkflowGroup, this.hotspotsLoading);
    this.pendingWorkflowGroup = null;
    this.plugin.updateObservedDataPaths(observedReviewPaths(model));
    if (focusActiveTab) activeButton.focus();
    if (this.activeTab === 'discover') this.maybeAutoRefreshHotspots(model);
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
    // 每次切到「发现」tab 都允许重新做一次 TTL 过期自动刷新判断。
    if (tab === 'discover') this.hotspotsAutoChecked = false;
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

  private async promoteTopic(targetPath: string): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    if (this.lastModel === null) return;
    const fromPath = currentFocusTopic(this.lastModel)?.path ?? null;
    try {
      await this.plugin.mutationService().promoteTopic(fromPath, targetPath);
      this.plugin.recordFocusSwitch(targetPath);
      await this.refresh();
    } catch (error) {
      this.showActionError('view.promoteFailed', error);
    }
  }

  private async openWorkPicker(): Promise<void> {
    if (this.lastModel === null) return;
    const target = await WorkPickerModal.ask(
      this.app,
      // 只列「可成为焦点」的选题（有阶段）：无阶段的待评估卡切过去会落入「未知阶段」死路。
      this.lastModel.pickableTopics.filter((topic) => topic.stage !== null),
      currentFocusTopic(this.lastModel)?.path ?? null,
      this.t,
    );
    if (target === null) return;
    await this.switchFocus(target);
  }

  private async captureIdea(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    const result = await IdeaCaptureModal.ask(this.app, this.t, { showOrganize: true });
    if (result === null) return;
    if (result.kind === 'organize') {
      await this.openWorkflowIdeas();
      return;
    }
    if (this.rejectReadOnlyWrite()) return;
    const inboxPath = ideaInboxPath(this.plugin.settings.topicInboxDir);
    try {
      await this.plugin.ideaCaptureService().capture(inboxPath, result.text, this.t.t('idea.inboxHeading'));
      new Notice(this.t.t('idea.captured', { path: inboxPath }));
      await this.refresh();
      await this.openWorkflowIdeas();
    } catch (error) {
      this.showActionError('idea.captureFailed', error);
    }
  }

  private async editIdea(line: number, currentText: string): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    const result = await IdeaCaptureModal.ask(this.app, this.t, {
      initial: currentText,
      heading: this.t.t('idea.editHeading'),
    });
    if (result === null || result.kind !== 'save') return;
    if (this.rejectReadOnlyWrite()) return;
    const inboxPath = ideaInboxPath(this.plugin.settings.topicInboxDir);
    try {
      await this.plugin.ideaInboxService().edit(inboxPath, line, result.text);
      await this.refresh();
    } catch (error) {
      this.showActionError('idea.editFailed', error);
    }
  }

  private async deleteIdea(line: number): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    const inboxPath = ideaInboxPath(this.plugin.settings.topicInboxDir);
    try {
      await this.plugin.ideaInboxService().delete(inboxPath, line);
      await this.refresh();
    } catch (error) {
      this.showActionError('idea.deleteFailed', error);
    }
  }

  private async openWorkflowIdeas(): Promise<void> {
    this.pendingWorkflowGroup = '选题';
    if (this.activeTab === 'workflow') {
      if (this.lastModel !== null) this.renderModel(this.lastModel, true);
      return;
    }
    await this.selectTab('workflow');
  }

  private async copyPrompt(action: WorkflowAction, ideas?: string[]): Promise<void> {
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    const result = buildPrompt(
      action, this.lastModel, this.plugin.settings, ideas === undefined ? {} : { ideas },
    );
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

  private async refreshHotspots(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    if (this.hotspotsLoading) return;
    this.hotspotsLoading = true;
    // 立刻重渲染，让「刷新热点」按钮进入「抓取中…」禁用态。
    if (this.lastModel !== null) this.renderModel(this.lastModel);
    try {
      const results = await this.plugin.hotspotFetchService().fetchAll(this.plugin.settings.hotspotCache);
      this.plugin.settings.hotspotCache = resultsToCache(results);
      await this.plugin.saveSettings();
    } catch (error) {
      const detail = error instanceof Error ? error.message : this.t.t('common.unknownError');
      new Notice(this.t.t('discover.fetchFailed', { detail }));
    } finally {
      this.hotspotsLoading = false;
      await this.refresh();
    }
  }

  // 进入「发现」tab 后，若热点缓存比 TTL 旧（或从未抓取）则自动刷新一次。
  // 每次进入只判断一次（hotspotsAutoChecked），避免渲染副作用导致循环抓取。
  private maybeAutoRefreshHotspots(model: DashboardModel): void {
    if (this.hotspotsAutoChecked) return;
    this.hotspotsAutoChecked = true;
    if (this.hotspotsLoading) return;
    if (Platform.isMobile || model.mobileReadOnly) return;
    if (!hotspotCacheStale(model.hotspots, this.plugin.settings.hotspotCacheTtlHours)) return;
    // 延后到当前渲染结束后再触发，避免在 renderModel 内部重入渲染。
    setTimeout(() => void this.refreshHotspots(), 0);
  }

  // 在系统浏览器打开热点原文链接。
  private openHotspot(url: string): void {
    if (url.trim().length === 0) return;
    window.open(url, '_blank');
  }

  private async archiveHotspots(): Promise<void> {
    if (this.rejectReadOnlyWrite()) return;
    const results = this.lastModel?.hotspots ?? [];
    if (results.every((r) => r.items.length === 0)) {
      new Notice(this.t.t('discover.archiveEmpty'));
      return;
    }
    const date = formatToday();
    const path = hotspotArchivePath(
      this.plugin.settings.hotspotArchiveDir, date,
      (candidate) => this.plugin.gateway.exists(candidate),
    );
    try {
      const dir = this.plugin.settings.hotspotArchiveDir;
      if (this.app.vault.getAbstractFileByPath(dir) === null) {
        await this.app.vault.createFolder(dir);
      }
      await this.plugin.gateway.create(path, buildHotspotArchive({ date, results }));
      new Notice(this.t.t('discover.archived', { path }));
      await this.openPath(path);
    } catch (error) {
      this.showActionError('view.createFailed', error);
    }
  }

  private async copyDiscoveryPrompt(hotspots: Hotspot[], signals: AudienceSignal[]): Promise<void> {
    if (this.lastModel === null) {
      new Notice(this.t.t('view.notLoadedCreate'));
      return;
    }
    const action = this.lastModel.workflowActions.find((a) => a.id === 'spark-topics');
    if (action === undefined) {
      new Notice(this.t.t('discover.noTemplate'));
      return;
    }
    const result = buildDiscoveryPrompt({
      action, hotspots, signals,
      existingTitles: existingTopicTitles(this.lastModel),
      nextIssue: nextTopicIssue(this.lastModel.pickableTopics),
      settings: this.plugin.settings,
    });
    try {
      await navigator.clipboard.writeText(result.text);
      new Notice(this.t.t('discover.copied', {
        label: result.label, output: result.output ?? this.t.t('workflow.readonlyOutput'),
      }));
    } catch {
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

function formatToday(): string {
  const d = new Date();
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function existingTopicTitles(model: DashboardModel): string[] {
  const titles = new Set<string>();
  for (const topic of [...model.thisWeek, ...model.queue, ...model.pickableTopics]) {
    if (topic.title.trim().length > 0) titles.add(topic.title.trim());
  }
  return [...titles];
}

// 热点缓存是否已过期：从未抓取（最新时间戳为 0）或距今超过 TTL 小时。
function hotspotCacheStale(results: HotspotSourceResult[], ttlHours: number): boolean {
  const newest = results.reduce((max, result) => Math.max(max, result.fetchedAt), 0);
  if (newest === 0) return true;
  return Date.now() - newest > ttlHours * 3_600_000;
}
