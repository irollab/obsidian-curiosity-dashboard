import type { DashboardModel, IdeaEntry, TopicRecord } from '@/domain/models';
import { STAGES, type Stage } from '@/domain/stages';
import type { WorkflowAction, WorkflowGroup } from '@/domain/workflow';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { focusMeta, renderWindowTitlebar } from './window-frame';

export function renderWorkflowDeck(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
  initialGroup: WorkflowGroup | null = null,
): void {
  const section = parent.createEl('section', { cls: 'curiosity-section curiosity-workflow' });
  renderWindowTitlebar(section, t.t('tab.workflow'), focusMeta(model, t));

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

  const groups = ([...STAGES, 'general'] as WorkflowGroup[]).filter((group) =>
    model.workflowActions.some((action) => action.group === group),
  );
  const firstGroup = groups[0];
  if (firstGroup === undefined) return;
  const activeGroup =
    initialGroup !== null && groups.includes(initialGroup)
      ? initialGroup
      : focusStage !== null && groups.includes(focusStage)
        ? focusStage
        : firstGroup;

  renderSegmentedGroups(section, groups, activeGroup, model, handlers, t);
}

function renderSegmentedGroups(
  parent: HTMLElement,
  groups: WorkflowGroup[],
  activeGroup: WorkflowGroup,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const tablist = parent.createDiv({
    cls: 'curiosity-segmented',
    attr: { role: 'tablist', 'aria-label': t.t('tab.workflow') },
  });
  const panels = parent.createDiv({ cls: 'curiosity-workflow-panels' });

  const entries = groups.map((group) => {
    const isActive = group === activeGroup;
    const segment = tablist.createEl('button', {
      cls: isActive ? 'curiosity-segment is-active' : 'curiosity-segment',
      text: groupLabel(group, t),
      type: 'button',
      attr: { role: 'tab', 'aria-selected': String(isActive) },
    });
    const panel = panels.createDiv({
      cls: 'curiosity-workflow-panel',
      attr: { role: 'tabpanel' },
    });
    panel.hidden = !isActive;
    const list = panel.createDiv({ cls: 'curiosity-workflow-cards' });
    for (const action of model.workflowActions.filter((a) => a.group === group)) {
      renderCard(list, action, model, handlers, t);
    }
    return { segment, panel };
  });

  for (const entry of entries) {
    entry.segment.addEventListener('click', () => {
      for (const other of entries) {
        const on = other === entry;
        other.segment.classList.toggle('is-active', on);
        other.segment.setAttr('aria-selected', String(on));
        other.panel.hidden = !on;
      }
    });
  }
}

function renderCard(
  parent: HTMLElement, action: WorkflowAction, model: DashboardModel,
  handlers: DashboardHandlers, t: Translator,
): void {
  const card = parent.createDiv({ cls: 'curiosity-workflow-card' });
  card.createEl('h3', { text: action.label });
  if (action.description.length > 0) card.createEl('p', { text: action.description });

  const isIdeas = action.id === 'collect-ideas';
  const checks: Array<{ text: string; input: HTMLInputElement }> = [];
  if (isIdeas) renderIdeaList(card, model.ideas, checks, handlers, t);

  const blockedNoFocus = action.needsFocus && focusTopic(model) === null;
  const buttons = card.createDiv({ cls: 'curiosity-workflow-actions' });

  const copy = buttons.createEl('button', {
    cls: 'curiosity-write-action curiosity-workflow-copy', text: t.t('workflow.copyButton'), type: 'button',
    attr: { 'aria-label': blockedNoFocus ? t.t('workflow.needsFocus') : t.t('workflow.copyButton') },
  });
  copy.disabled = blockedNoFocus;
  if (blockedNoFocus) copy.setAttr('title', t.t('workflow.needsFocus'));
  else copy.addEventListener('click', () => void handlers.copyPrompt(action, isIdeas ? selectedIdeas(checks) : undefined));

  if (action.output === null) {
    card.createEl('p', { cls: 'curiosity-workflow-readonly', text: t.t('workflow.readonlyOutput') });
  } else {
    const open = buttons.createEl('button', {
      cls: 'curiosity-workflow-open', text: t.t('workflow.openOutput'), type: 'button',
    });
    const output = action.output;
    open.addEventListener('click', () => void handlers.openOutput(output));
  }
}

function selectedIdeas(checks: Array<{ text: string; input: HTMLInputElement }>): string[] {
  const checked = checks.filter((c) => c.input.checked).map((c) => c.text);
  return checked.length > 0 ? checked : checks.map((c) => c.text);
}

function renderIdeaList(
  card: HTMLElement,
  ideas: IdeaEntry[],
  checks: Array<{ text: string; input: HTMLInputElement }>,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  if (ideas.length === 0) {
    card.createEl('p', { cls: 'curiosity-idea-empty', text: t.t('idea.listEmpty') });
    return;
  }
  const list = card.createDiv({ cls: 'curiosity-idea-list' });
  for (const idea of ideas) {
    const row = list.createDiv({ cls: 'curiosity-idea-row' });
    const input = row.createEl('input', {
      cls: 'curiosity-idea-check',
      attr: { type: 'checkbox', 'aria-label': idea.text },
    });
    checks.push({ text: idea.text, input });
    const body = row.createDiv({ cls: 'curiosity-idea-body' });
    body.createSpan({ cls: 'curiosity-idea-text', text: idea.text });
    if (idea.recordedAt.length > 0) {
      body.createSpan({ cls: 'curiosity-idea-time', text: idea.recordedAt });
    }
    const edit = row.createEl('button', {
      cls: 'curiosity-idea-edit', text: t.t('idea.edit'), type: 'button',
      attr: { 'aria-label': t.t('idea.edit') },
    });
    edit.addEventListener('click', () => void handlers.editIdea(idea.line, idea.text));
    const remove = row.createEl('button', {
      cls: 'curiosity-idea-delete', text: t.t('idea.delete'), type: 'button',
      attr: { 'aria-label': t.t('idea.delete') },
    });
    remove.addEventListener('click', () => void handlers.deleteIdea(idea.line));
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
