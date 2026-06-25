import type { DashboardModel, TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';
import { renderWindowTitlebar } from './window-frame';

export function renderQuickActions(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const section = parent.createEl('section', {
    cls: 'curiosity-section curiosity-quick-actions',
  });
  renderWindowTitlebar(section, t.t('quickActions.title'));
  const actions = section.createDiv({ cls: 'curiosity-actions' });
  createButton(actions, t.t('action.createTopicCard'), model.mobileReadOnly, handlers.createTopic, t);

  const topic = focusTopic(model);
  if (topic !== null) {
    if (topic.scriptPath !== null) {
      openButton(actions, t.t('action.openScript'), topic.scriptPath, handlers, t);
    } else {
      createButton(actions, t.t('action.createScript'), model.mobileReadOnly, () => handlers.createScript(topic), t);
    }

    if (topic.reviewPath !== null) {
      openButton(actions, t.t('action.openReview'), topic.reviewPath, handlers, t);
    } else {
      createButton(actions, t.t('action.createReview'), model.mobileReadOnly, () => handlers.createReview(topic), t);
    }
  }

  if (model.mobileReadOnly) {
    section.createEl('p', {
      cls: 'curiosity-readonly-reason',
      text: t.t('quickActions.readonlyReason'),
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
  t: Translator,
): void {
  const button = parent.createEl('button', {
    cls: 'curiosity-write-action',
    text: label,
    type: 'button',
    attr: {
      'aria-label': mobileReadOnly ? t.t('common.unavailableMobileReadonly', { label }) : label,
    },
  });
  button.disabled = mobileReadOnly;
  if (mobileReadOnly) button.setAttr('title', t.t('common.mobileReadonlyCreateFile'));
  else bindGuardedAction(button, action);
}

function openButton(
  parent: HTMLElement,
  label: string,
  path: string,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const button = parent.createEl('button', { text: label, type: 'button' });
  button.setAttr('aria-label', t.t('common.labelPath', { label, path }));
  button.addEventListener('click', () => void handlers.openPath(path));
}
