import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ObsidianVaultGateway } from '@/adapters/obsidian-vault-gateway';
import { DashboardDataService } from '@/data/dashboard-data-service';
import { TemplateCreationService } from '@/mutations/template-creation-service';
import { VaultMutationService } from '@/mutations/vault-mutation-service';
import type { VaultGateway } from '@/ports/vault-gateway';
import { DebouncedRefresh } from '@/refresh-controller';

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

  override async onload(): Promise<void> {
    this.unloaded = false;
    this.settings = parseSettings(await this.loadData());
    this.gateway = new ObsidianVaultGateway(this.app);
    this.refreshScheduler = new DebouncedRefresh(
      () => this.refreshActiveView(),
      200,
      (error) => this.reportError('Dashboard 自动刷新失败', error),
    );

    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new CuriosityDashboardView(leaf, this),
    );
    this.addSettingTab(new DashboardSettingTab(this.app, this));
    this.addRibbonIcon('telescope', 'Open Curiosity Dashboard', () => {
      void this.activateView().catch((error: unknown) =>
        this.reportError('无法打开 Curiosity Dashboard', error),
      );
    });
    this.addCommand({
      id: 'open-curiosity-dashboard',
      name: 'Open Curiosity Dashboard',
      callback: () => {
        void this.activateView().catch((error: unknown) =>
          this.reportError('无法打开 Curiosity Dashboard', error),
        );
      },
    });

    this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('modify', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('delete', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('rename', () => this.scheduleRefresh()));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleRefresh()));
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
          this.reportError('无法在启动时打开 Curiosity Dashboard', error),
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

  mutationService(): VaultMutationService {
    return new VaultMutationService(this.gateway);
  }

  templateService(): TemplateCreationService {
    return new TemplateCreationService(this.gateway);
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

  private async refreshActiveView(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(CuriosityDashboardView);
    if (view !== null) await view.refresh();
  }

  private reportError(context: string, error: unknown): void {
    console.error(context, error);
    new Notice(`${context}：${error instanceof Error ? error.message : '未知错误'}`);
  }
}
