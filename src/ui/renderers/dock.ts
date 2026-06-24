import { setIcon } from 'obsidian';

import type { DashboardModel, TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';

interface DockItem {
  action?: () => void | Promise<void>;
  icon: string;
  label: string;
  reason?: string;
}

export function renderDock(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const dock = parent.createEl('nav', {
    cls: 'curiosity-dock',
    attr: { 'aria-label': t.t('dock.aria') },
  });
  const topic = focusTopic(model);
  const items: DockItem[] = [];

  items.push(model.mobileReadOnly
    ? disabledItem(t.t('dock.ideas'), 'lightbulb', t.t('dock.reason.mobileCreateTopic'))
    : { action: handlers.createTopic, icon: 'lightbulb', label: t.t('dock.ideas') });
  items.push({ action: () => handlers.openWorkPicker(), icon: 'crosshair', label: t.t('dock.mission') });
  items.push({ action: () => handlers.selectTab('tasks'), icon: 'list-checks', label: t.t('dock.tasks') });
  items.push(associatedItem(
    { key: 'script', label: t.t('dock.script') }, 'file-text', topic, 'scriptPath', model, handlers, t,
  ));
  items.push({ action: () => handlers.selectTab('data'), icon: 'chart-no-axes-combined', label: t.t('dock.data') });
  items.push(associatedItem(
    { key: 'review', label: t.t('dock.review') }, 'clipboard-check', topic, 'reviewPath', model, handlers, t,
  ));
  items.push({ action: handlers.openSettings, icon: 'settings', label: t.t('dock.settings') });

  for (const item of items) renderDockItem(dock, item, t);
}

function focusTopic(model: DashboardModel): TopicRecord | null {
  return model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic
    : null;
}

function fileItem(
  label: string,
  icon: string,
  path: string | null,
  reason: string,
  handlers: DashboardHandlers,
): DockItem {
  return path === null
    ? disabledItem(label, icon, reason)
    : { action: () => handlers.openPath(path), icon, label };
}

function associatedItem(
  meta: { key: 'script' | 'review'; label: string },
  icon: string,
  topic: TopicRecord | null,
  field: 'scriptPath' | 'reviewPath',
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): DockItem {
  const path = topic?.[field] ?? null;
  if (path !== null) return fileItem(meta.label, icon, path, '', handlers);

  const what = meta.key === 'script' ? t.t('link.script') : t.t('link.review');
  const create = meta.key === 'script' ? handlers.createScript : handlers.createReview;
  if (topic !== null) {
    if (model.mobileReadOnly) {
      return disabledItem(meta.label, icon, t.t('dock.reason.mobileCreate', { what }));
    }
    return { action: () => create(topic), icon, label: meta.label };
  }
  return disabledItem(meta.label, icon, t.t('dock.reason.notLinked', { what }));
}

function disabledItem(label: string, icon: string, reason: string): DockItem {
  return { icon, label, reason };
}

function renderDockItem(parent: HTMLElement, item: DockItem, t: Translator): void {
  const disabled = item.action === undefined;
  const button = parent.createEl('button', {
    cls: 'curiosity-dock-item',
    type: 'button',
    attr: {
      'aria-label': disabled
        ? t.t('common.unavailableReason', {
            label: item.label,
            reason: item.reason ?? t.t('common.unknownReason'),
          })
        : item.label,
    },
  });
  button.disabled = disabled;
  if (disabled && item.reason !== undefined) button.setAttr('title', item.reason);
  const icon = button.createSpan({ cls: 'curiosity-dock-icon', attr: { 'aria-hidden': 'true' } });
  setIcon(icon, item.icon);
  button.createSpan({ cls: 'curiosity-dock-label', text: item.label });
  if (disabled && item.reason !== undefined) {
    button.createSpan({ cls: 'curiosity-dock-reason', text: item.reason });
  } else if (item.action !== undefined) {
    bindGuardedAction(button, item.action);
  }
}
