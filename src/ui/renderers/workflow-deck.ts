import type { DashboardModel, TopicRecord } from '@/domain/models';
import { STAGES, type Stage } from '@/domain/stages';
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';

export function renderWorkflowDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-workflow' });

  if (!model.promptTemplatesPresent) {
    renderEmpty(section, handlers, t);
    return;
  }

  if (model.promptTemplatesSkipped.length > 0) {
    section.createEl('p', {
      cls: 'curiosity-workflow-skipped',
      attr: { role: 'status' },
      text: t.t('workflow.skippedNotice', { files: model.promptTemplatesSkipped.join('、') }),
    });
  }

  const focusStage = currentFocusStage(model);
  if (focusStage !== null) {
    const topic = focusTopic(model);
    if (topic !== null) {
      section.createEl('p', {
        cls: 'curiosity-workflow-focus',
        text: t.t('workflow.focusContext', {
          issue: topic.issue, title: topic.title, stage: t.stageLabel(focusStage),
        }),
      });
    }
  }

  const groups: WorkflowGroup[] = [...STAGES, 'general'];
  for (const group of groups) {
    const actions = model.workflowActions.filter((a) => a.group === group);
    if (actions.length === 0) continue;
    const expanded = group === focusStage || (focusStage === null && group === 'general');
    renderGroup(section, group, actions, expanded, model, handlers, t);
  }
}

function renderGroup(
  parent: HTMLElement, group: WorkflowGroup, actions: WorkflowAction[], expanded: boolean,
  model: DashboardModel, handlers: DashboardHandlers, t: Translator,
): void {
  const details = parent.createEl('details', {
    cls: expanded ? 'curiosity-workflow-group is-focus' : 'curiosity-workflow-group',
  });
  if (expanded) details.setAttr('open', '');
  details.createEl('summary', { text: groupLabel(group, t) });
  const list = details.createDiv({ cls: 'curiosity-workflow-cards' });
  for (const action of actions) renderCard(list, action, model, handlers, t);
}

function renderCard(
  parent: HTMLElement, action: WorkflowAction, model: DashboardModel,
  handlers: DashboardHandlers, t: Translator,
): void {
  const card = parent.createDiv({ cls: 'curiosity-workflow-card' });
  card.createEl('h3', { text: action.label });
  if (action.description.length > 0) card.createEl('p', { text: action.description });

  const blockedNoFocus = action.needsFocus && focusTopic(model) === null;
  const buttons = card.createDiv({ cls: 'curiosity-workflow-actions' });

  const copy = buttons.createEl('button', {
    cls: 'curiosity-write-action', text: t.t('workflow.copyButton'), type: 'button',
    attr: { 'aria-label': blockedNoFocus ? t.t('workflow.needsFocus') : t.t('workflow.copyButton') },
  });
  copy.disabled = blockedNoFocus;
  if (blockedNoFocus) copy.setAttr('title', t.t('workflow.needsFocus'));
  else copy.addEventListener('click', () => void handlers.copyPrompt(action));

  if (action.output === null) {
    card.createEl('p', { cls: 'curiosity-workflow-readonly', text: t.t('workflow.readonlyOutput') });
  } else {
    const open = buttons.createEl('button', { text: t.t('workflow.openOutput'), type: 'button' });
    const output = action.output;
    open.addEventListener('click', () => void handlers.openOutput(output));
  }
}

function renderEmpty(parent: HTMLElement, handlers: DashboardHandlers, t: Translator): void {
  const empty = parent.createDiv({ cls: 'curiosity-workflow-empty' });
  empty.createEl('h3', { text: t.t('workflow.deckEmptyTitle') });
  empty.createEl('p', { text: t.t('workflow.deckEmptyBody') });
  const seed = empty.createEl('button', {
    cls: 'curiosity-write-action', text: t.t('workflow.seedButton'), type: 'button',
  });
  seed.addEventListener('click', () => void handlers.seedPromptTemplates());
}

function groupLabel(group: WorkflowGroup, t: Translator): string {
  return group === 'general' ? t.t('workflow.groupGeneral') : t.stageLabel(group);
}

function currentFocusStage(model: DashboardModel): Stage | null {
  return model.focus.kind === 'ready' ? model.focus.topic.stage : null;
}

function focusTopic(model: DashboardModel): TopicRecord | null {
  return model.focus.kind === 'ready' || model.focus.kind === 'invalid-stage'
    ? model.focus.topic : null;
}
