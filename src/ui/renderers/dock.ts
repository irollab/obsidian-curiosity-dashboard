import { setIcon } from 'obsidian';

import type { DashboardModel, TopicRecord } from '@/domain/models';

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
): void {
  const dock = parent.createEl('nav', {
    cls: 'curiosity-dock',
    attr: { 'aria-label': 'Dashboard shortcuts' },
  });
  const topic = focusTopic(model);
  const items: DockItem[] = [];

  items.push(model.mobileReadOnly
    ? disabledItem('Ideas', 'lightbulb', '移动端只读，不能创建选题卡')
    : { action: handlers.createTopic, icon: 'lightbulb', label: 'Ideas' });
  items.push(fileItem('Mission', 'crosshair', topic?.path ?? null, '未设置当前作品', handlers));
  items.push({ action: () => void handlers.selectTab('tasks'), icon: 'list-checks', label: 'Tasks' });
  items.push(associatedItem('Script', 'file-text', topic, 'scriptPath', model, handlers));
  items.push({ action: () => void handlers.selectTab('data'), icon: 'chart-no-axes-combined', label: 'Data' });
  items.push(associatedItem('Review', 'clipboard-check', topic, 'reviewPath', model, handlers));
  items.push({ action: handlers.openSettings, icon: 'settings', label: 'Settings' });

  for (const item of items) renderDockItem(dock, item);
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
    : { action: () => void handlers.openPath(path), icon, label };
}

function associatedItem(
  label: 'Script' | 'Review',
  icon: string,
  topic: TopicRecord | null,
  field: 'scriptPath' | 'reviewPath',
  model: DashboardModel,
  handlers: DashboardHandlers,
): DockItem {
  const path = topic?.[field] ?? null;
  if (path !== null) return fileItem(label, icon, path, '', handlers);

  const create = label === 'Script' ? handlers.createScript : handlers.createReview;
  if (topic !== null) {
    if (model.mobileReadOnly) {
      return disabledItem(label, icon, `移动端只读，不能创建${label === 'Script' ? '脚本' : '复盘'}`);
    }
    return { action: () => create(topic), icon, label };
  }
  return disabledItem(label, icon, `当前作品未关联${label === 'Script' ? '脚本' : '复盘'}`);
}

function disabledItem(label: string, icon: string, reason: string): DockItem {
  return { icon, label, reason };
}

function renderDockItem(parent: HTMLElement, item: DockItem): void {
  const disabled = item.action === undefined;
  const button = parent.createEl('button', {
    cls: 'curiosity-dock-item',
    type: 'button',
    attr: {
      'aria-label': disabled ? `${item.label}（不可用：${item.reason ?? '未知原因'}）` : item.label,
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
