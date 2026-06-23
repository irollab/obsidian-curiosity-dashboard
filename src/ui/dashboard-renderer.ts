import type { ChecklistTask, DashboardModel, TopicRecord } from '@/domain/models';
import type { Stage } from '@/domain/stages';

import { renderHero } from './renderers/hero';
import { renderMissionControl } from './renderers/mission-control';
import { renderThisWeek } from './renderers/this-week';
import { renderProductionQueue } from './renderers/production-queue';
import { renderChannelPulse } from './renderers/channel-pulse';
import { renderQuickActions } from './renderers/quick-actions';
import { renderDock } from './renderers/dock';

export type DashboardTab = 'overview' | 'tasks' | 'data';
export type AssociationField = 'script_path' | 'asset_path' | 'review_path';

export interface DashboardHandlers {
  openPath(path: string): Promise<void>;
  toggleTask(path: string, task: ChecklistTask): Promise<void>;
  confirmAdvance(path: string, stage: Stage): Promise<void>;
  openSettings(): void;
  selectTab(tab: DashboardTab): Promise<void>;
  setAssociation(topicPath: string, field: AssociationField, value: string): Promise<void>;
  createTopic?(): void;
  createScript?(topic: TopicRecord): void;
  createReview?(topic: TopicRecord): void;
}

const TABS: ReadonlyArray<{ id: DashboardTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'data', label: 'Data' },
];

export class DashboardRenderer {
  render(
    container: HTMLElement,
    model: DashboardModel,
    handlers: DashboardHandlers,
    activeTab: DashboardTab,
  ): HTMLButtonElement {
    container.empty();
    container.addClass('curiosity-dashboard');

    const shell = container.createDiv({ cls: 'curiosity-dashboard-shell' });
    shell.dataset.activeTab = activeTab;
    renderHero(shell, model, handlers);

    const content = shell.createDiv({ cls: 'curiosity-content' });
    const tabs = content.createDiv({
      cls: 'curiosity-view-tabs',
      attr: { 'aria-label': 'Dashboard views', role: 'tablist' },
    });
    const buttons = TABS.map(({ id, label }) => {
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

    for (const { id } of TABS) {
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
        renderMissionControl(panel, model, handlers);
        renderThisWeek(panel, model.thisWeek, handlers.openPath);
        renderProductionQueue(panel, model.queue, handlers.openPath);
        renderChannelPulse(panel, model, handlers.openPath);
        renderQuickActions(panel, model, handlers);
      } else if (id === 'tasks') {
        renderMissionControl(panel, model, handlers);
        renderThisWeek(panel, model.thisWeek, handlers.openPath);
      } else {
        renderChannelPulse(panel, model, handlers.openPath);
      }
    }

    renderDock(shell, model, handlers);

    const activeButton = buttons.find(({ id }) => id === activeTab)?.button;
    if (activeButton === undefined) throw new Error(`Unknown dashboard tab: ${activeTab}`);
    return activeButton;
  }
}

function tabTargetIndex(key: string, current: number, length: number): number | null {
  if (key === 'ArrowRight') return (current + 1) % length;
  if (key === 'ArrowLeft') return (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}
