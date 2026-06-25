import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ObsidianVaultGateway } from '@/adapters/obsidian-vault-gateway';
import { resolveLocale } from '@/i18n/locale';
import type { TranslationKey } from '@/i18n/translations';
import { createTranslator, type Translator } from '@/i18n/translator';
import { DashboardDataService } from '@/data/dashboard-data-service';
import { PromptSeedService } from '@/mutations/prompt-seed-service';
import { IdeaCaptureService } from '@/mutations/idea-capture-service';
import { IdeaInboxService } from '@/mutations/idea-inbox-service';
import { TemplateCreationService } from '@/mutations/template-creation-service';
import { VaultMutationService } from '@/mutations/vault-mutation-service';
import type { VaultGateway } from '@/ports/vault-gateway';
import { DebouncedRefresh } from '@/refresh-controller';
import {
  isRelevantVaultChange,
  normalizeObservedPaths,
  type VaultChange,
} from '@/relevant-vault-change';

import { DASHBOARD_VIEW_TYPE } from './constants';
import { CuriosityDashboardView } from './curiosity-dashboard-view';
import {
  DashboardSettingTab,
  DEFAULT_SETTINGS,
  parseSettings,
  type DashboardSettings,
} from './settings';

export default class CuriosityDashboardPlugin extends Plugin {
  settings: DashboardSettings = { ...DEFAULT_SETTINGS };
  gateway!: VaultGateway;
  private activationPromise: Promise<void> | null = null;
  private refreshScheduler: DebouncedRefresh | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private unloaded = false;
  private observedDataPaths: ReadonlySet<string> = new Set();

  override async onload(): Promise<void> {
    this.unloaded = false;
    this.settings = parseSettings(await this.loadData());
    this.gateway = new ObsidianVaultGateway(this.app, this.manifest?.dir ?? null);
    this.refreshScheduler = new DebouncedRefresh(
      () => this.refreshActiveView(),
      200,
      (error) => this.reportError('error.autoRefreshFailed', error),
    );

    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new CuriosityDashboardView(leaf, this),
    );
    this.addSettingTab(new DashboardSettingTab(this.app, this));
    this.addRibbonIcon('telescope', 'Open Curiosity Dashboard', () => {
      void this.activateView().catch((error: unknown) =>
        this.reportError('error.openFailed', error),
      );
    });
    this.addCommand({
      id: 'open-curiosity-dashboard',
      name: 'Open Curiosity Dashboard',
      callback: () => {
        void this.activateView().catch((error: unknown) =>
          this.reportError('error.openFailed', error),
        );
      },
    });

    this.registerEvent(this.app.vault.on('create', (file) =>
      this.handleVaultChange({ kind: 'create', path: file.path })));
    this.registerEvent(this.app.vault.on('modify', (file) =>
      this.handleVaultChange({ kind: 'modify', path: file.path })));
    this.registerEvent(this.app.vault.on('delete', (file) =>
      this.handleVaultChange({ kind: 'delete', path: file.path })));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) =>
      this.handleVaultChange({ kind: 'rename', path: file.path, oldPath })));
    this.registerEvent(this.app.metadataCache.on('changed', (file) =>
      this.handleVaultChange({ kind: 'metadata', path: file.path })));
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (
          this.activationPromise === null &&
          leaf?.view.getViewType() === DASHBOARD_VIEW_TYPE
        ) {
          this.scheduleRefresh();
        }
      }),
    );

    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        if (this.unloaded) return;
        void this.activateView().catch((error: unknown) =>
          this.reportError('error.openOnStartupFailed', error),
        );
      });
    }
  }

  override onunload(): void {
    this.unloaded = true;
    this.refreshScheduler?.dispose();
    this.refreshScheduler = null;
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async saveSettings(): Promise<void> {
    const snapshot: DashboardSettings = { ...this.settings };
    const operation = this.saveQueue.then(() => this.saveData(snapshot));
    this.saveQueue = operation.catch(() => undefined);
    await operation;
    this.scheduleRefresh();
  }

  dataService(): DashboardDataService {
    return new DashboardDataService(this.gateway, this.settings);
  }

  recordFocusSwitch(path: string): void {
    // 记录最近切为焦点的选题（去重、最多 8 条），持久化到 data.json 并触发刷新。
    const entry = { path, switchedAt: Date.now() };
    const remaining = this.settings.focusHistory.filter((existing) => existing.path !== path);
    this.settings.focusHistory = [entry, ...remaining].slice(0, 8);
    void this.saveSettings().catch((error: unknown) =>
      this.reportError('error.autoRefreshFailed', error),
    );
  }

  mutationService(): VaultMutationService {
    return new VaultMutationService(this.gateway);
  }

  templateService(): TemplateCreationService {
    return new TemplateCreationService(this.gateway);
  }

  promptSeedService(): PromptSeedService {
    return new PromptSeedService(this.gateway);
  }

  ideaCaptureService(): IdeaCaptureService {
    return new IdeaCaptureService(this.gateway);
  }

  ideaInboxService(): IdeaInboxService {
    return new IdeaInboxService(this.gateway);
  }

  translator(): Translator {
    const obsidianLang =
      typeof window !== 'undefined' ? window.localStorage.getItem('language') : null;
    return createTranslator(resolveLocale(this.settings.language, obsidianLang));
  }

  updateObservedDataPaths(paths: Iterable<string>): void {
    this.observedDataPaths = normalizeObservedPaths(paths);
  }

  activateView(): Promise<void> {
    if (this.unloaded) return Promise.reject(new Error('Curiosity Dashboard plugin is unloaded'));
    if (this.activationPromise !== null) return this.activationPromise;

    const operation = Promise.resolve().then(() => this.activateViewOnce());
    this.activationPromise = operation;
    void operation.then(
      () => this.clearActivation(operation),
      () => this.clearActivation(operation),
    );
    return operation;
  }

  private async activateViewOnce(): Promise<void> {
    if (this.unloaded) return;
    let leaf: WorkspaceLeaf | null = null;
    let created = false;
    try {
      leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0] ?? null;
      if (leaf === null) {
        leaf = this.app.workspace.getLeaf('tab');
        created = true;
        await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
      }
      if (this.unloaded) {
        if (created) leaf.detach();
        return;
      }
      await this.app.workspace.revealLeaf(leaf);
      if (!this.unloaded && !created) this.scheduleRefresh();
    } catch (error) {
      if (created && leaf !== null) {
        try {
          leaf.detach();
        } catch (detachError) {
          console.error('Unable to detach failed Curiosity Dashboard leaf', detachError);
        }
      }
      throw error;
    }
  }

  private clearActivation(operation: Promise<void>): void {
    if (this.activationPromise === operation) this.activationPromise = null;
  }

  private scheduleRefresh(): void {
    this.refreshScheduler?.schedule();
  }

  private handleVaultChange(change: VaultChange): void {
    if (isRelevantVaultChange(change, this.settings, this.observedDataPaths)) {
      this.scheduleRefresh();
    }
  }

  private async refreshActiveView(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(CuriosityDashboardView);
    if (view !== null) await view.refresh();
  }

  private reportError(context: TranslationKey, error: unknown): void {
    const t = this.translator().t;
    console.error(context, error);
    const detail = error instanceof Error ? error.message : t('common.unknownError');
    new Notice(t('common.contextDetail', { context: t(context), detail }));
  }
}
