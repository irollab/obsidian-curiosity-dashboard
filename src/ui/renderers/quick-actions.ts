import type { DashboardModel, TopicRecord } from '@/domain/models';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';

export function renderQuickActions(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-quick-actions',
  });
  section.createEl('h2', { text: 'Quick Actions' });
  const actions = section.createDiv({ cls: 'curiosity-actions' });
  createButton(actions, '创建选题卡', model.mobileReadOnly, handlers.createTopic);

  const topic = focusTopic(model);
  if (topic !== null) {
    if (topic.scriptPath !== null) {
      openButton(actions, '打开脚本', topic.scriptPath, handlers);
    } else {
      createButton(actions, '创建脚本', model.mobileReadOnly, () => handlers.createScript(topic));
    }

    if (topic.reviewPath !== null) {
      openButton(actions, '打开复盘', topic.reviewPath, handlers);
    } else {
      createButton(actions, '创建复盘', model.mobileReadOnly, () => handlers.createReview(topic));
    }
  }

  if (model.mobileReadOnly) {
    section.createEl('p', {
      cls: 'curiosity-readonly-reason',
      text: '移动端只读：创建操作不可用。',
      attr: { role: 'status' },
    });
  }
}

function focusTopic(model: DashboardModel): TopicRecord | null {
  return model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic
    : null;
}

function createButton(
  parent: HTMLElement,
  label: string,
  mobileReadOnly: boolean,
  action: () => Promise<void>,
): void {
  const button = parent.createEl('button', {
    cls: 'curiosity-write-action',
    text: label,
    type: 'button',
    attr: {
      'aria-label': mobileReadOnly ? `${label}（不可用：移动端只读）` : label,
    },
  });
  button.disabled = mobileReadOnly;
  if (mobileReadOnly) button.setAttr('title', '移动端只读，不能创建文件');
  else bindGuardedAction(button, action);
}

function openButton(
  parent: HTMLElement,
  label: string,
  path: string,
  handlers: DashboardHandlers,
): void {
  const button = parent.createEl('button', { text: label, type: 'button' });
  button.setAttr('aria-label', `${label}：${path}`);
  button.addEventListener('click', () => void handlers.openPath(path));
}
