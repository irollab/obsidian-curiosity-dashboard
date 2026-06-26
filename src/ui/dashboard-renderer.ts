import { setIcon } from 'obsidian';

import type { AudienceSignal, Hotspot } from '@/domain/discovery';
import type { ChecklistTask, DashboardModel, TopicRecord } from '@/domain/models';
import type { Stage } from '@/domain/stages';
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import type { Translator } from '@/i18n/translator';

import { renderHero } from './renderers/hero';
import { renderMissionControl } from './renderers/mission-control';
import { renderThisWeek } from './renderers/this-week';
import { renderProductionQueue } from './renderers/production-queue';
import { renderChannelPulse } from './renderers/channel-pulse';
import { renderQuickActions } from './renderers/quick-actions';
import { renderWorkflowDeck } from './renderers/workflow-deck';
import { renderDiscoverDeck } from './renderers/discover-deck';
import { renderDock } from './renderers/dock';

export type DashboardTab = 'overview' | 'tasks' | 'workflow' | 'discover' | 'data';
export type AssociationField = 'script_path' | 'asset_path' | 'review_path';

export interface DashboardHandlers {
  openPath(path: string): Promise<void>;
  toggleTask(path: string, task: ChecklistTask): Promise<void>;
  confirmAdvance(path: string, stage: Stage): Promise<void>;
  openSettings(): void;
  selectTab(tab: DashboardTab): Promise<void>;
  setAssociation(topicPath: string, field: AssociationField, value: string): Promise<void>;
  switchFocus(path: string): Promise<void>;
  openWorkPicker(): Promise<void>;
  createTopic(): Promise<void>;
  captureIdea(): Promise<void>;
  createScript(topic: TopicRecord): Promise<void>;
  createReview(topic: TopicRecord): Promise<void>;
  copyPrompt(action: WorkflowAction, ideas?: string[]): Promise<void>;
  openOutput(path: string): Promise<void>;
  seedPromptTemplates(): Promise<void>;
  editIdea(line: number, text: string): Promise<void>;
  deleteIdea(line: number): Promise<void>;
  openWorkflowIdeas(): Promise<void>;
  refreshHotspots(): Promise<void>;
  archiveHotspots(): Promise<void>;
  copyDiscoveryPrompt(hotspots: Hotspot[], signals: AudienceSignal[]): Promise<void>;
  openHotspot(url: string): void;
}

export class DashboardRenderer {
  render(
    container: HTMLElement,
    model: DashboardModel,
    handlers: DashboardHandlers,
    activeTab: DashboardTab,
    t: Translator,
    initialWorkflowGroup: WorkflowGroup | null = null,
    hotspotsLoading = false,
  ): HTMLButtonElement {
    container.empty();
    container.addClass('curiosity-dashboard');

    const tabsConfig: ReadonlyArray<{ id: DashboardTab; label: string }> = [
      { id: 'overview', label: t.t('tab.overview') },
      { id: 'tasks', label: t.t('tab.tasks') },
      { id: 'workflow', label: t.t('tab.workflow') },
      { id: 'discover', label: t.t('tab.discover') },
      { id: 'data', label: t.t('tab.data') },
    ];

    const shell = container.createDiv({ cls: 'curiosity-dashboard-shell' });
    shell.dataset.activeTab = activeTab;
    renderHero(shell, model, handlers, t);

    const content = shell.createDiv({ cls: 'curiosity-content' });
    const tabs = content.createDiv({
      cls: 'curiosity-view-tabs',
      attr: { 'aria-label': t.t('tabs.aria'), role: 'tablist' },
    });
    const buttons = tabsConfig.map(({ id, label }) => {
      const selected = id === activeTab;
      const button = tabs.createEl('button', {
        cls: selected ? 'is-active' : 'is-inactive',
        text: label,
        type: 'button',
        attr: {
          'aria-controls': `curiosity-panel-${id}`,
          'aria-selected': String(selected),
          id: `curiosity-tab-${id}`,
          role: 'tab',
          tabindex: selected ? '0' : '-1',
        },
      });
      button.addEventListener('click', () => void handlers.selectTab(id));
      return { button, id };
    });

    for (const [index, { button }] of buttons.entries()) {
      button.addEventListener('keydown', (event) => {
        const targetIndex = tabTargetIndex(event.key, index, buttons.length);
        if (targetIndex === null) return;
        event.preventDefault();
        const target = buttons[targetIndex];
        if (target !== undefined) {
          target.button.focus();
          void handlers.selectTab(target.id);
        }
      });
    }

    for (const { id } of tabsConfig) {
      const active = id === activeTab;
      const panel = content.createDiv({
        cls: `curiosity-tab-panel curiosity-tab-panel--${id}`,
        attr: {
          'aria-labelledby': `curiosity-tab-${id}`,
          id: `curiosity-panel-${id}`,
          role: 'tabpanel',
          tabindex: active ? '0' : '-1',
        },
      });
      panel.hidden = !active;
      if (!active) continue;
      if (id === 'overview') {
        renderMissionControl(panel, model, handlers, t);
        renderThisWeek(panel, model, handlers.openPath, t);
        renderProductionQueue(panel, model.queue, handlers.openPath, t);
        renderChannelPulse(panel, model, handlers.openPath, t);
        renderQuickActions(panel, model, handlers, t);
      } else if (id === 'workflow') {
        renderWorkflowDeck(panel, model, handlers, t, initialWorkflowGroup);
      } else if (id === 'discover') {
        renderDiscoverDeck(panel, model, handlers, t, hotspotsLoading);
      } else if (id === 'tasks') {
        renderMissionControl(panel, model, handlers, t);
        renderThisWeek(panel, model, handlers.openPath, t);
      } else {
        renderChannelPulse(panel, model, handlers.openPath, t);
      }
    }

    renderDock(shell, model, handlers, t);
    renderFooter(shell, t);

    const activeButton = buttons.find(({ id }) => id === activeTab)?.button;
    if (activeButton === undefined) throw new Error(`Unknown dashboard tab: ${activeTab}`);
    return activeButton;
  }
}

// 底部版权信息栏。
function renderFooter(shell: HTMLElement, t: Translator): void {
  const footer = shell.createEl('footer', { cls: 'curiosity-footer' });
  footer.createSpan({ text: t.t('footer.poweredBy') });
  footer.createSpan({ cls: 'curiosity-footer-sep', text: '·' });
  footer.createSpan({ text: t.t('footer.copyright') });
  footer.createSpan({ cls: 'curiosity-footer-sep', text: '·' });
  const email = footer.createEl('a', {
    cls: 'curiosity-footer-link curiosity-footer-email',
    attr: { href: 'mailto:th@tancem.cn', target: '_blank', rel: 'noopener' },
  });
  const emailIcon = email.createSpan({ cls: 'curiosity-footer-link-icon', attr: { 'aria-hidden': 'true' } });
  setIcon(emailIcon, 'mail');
  email.createSpan({ text: t.t('footer.email') });
  email.style.setProperty('text-decoration', 'none');

  footer.createSpan({ cls: 'curiosity-footer-sep', text: '·' });
  const repo = footer.createEl('a', {
    cls: 'curiosity-footer-link curiosity-footer-github',
    attr: {
      href: 'https://github.com/irollab/obsidian-curiosity-dashboard',
      target: '_blank',
      rel: 'noopener',
      'aria-label': t.t('footer.githubAria'),
    },
  });
  const icon = repo.createSpan({ cls: 'curiosity-footer-link-icon', attr: { 'aria-hidden': 'true' } });
  setIcon(icon, 'github');
  repo.createSpan({ text: 'irollab' });
}

function tabTargetIndex(key: string, current: number, length: number): number | null {
  if (key === 'ArrowRight') return (current + 1) % length;
  if (key === 'ArrowLeft') return (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}
