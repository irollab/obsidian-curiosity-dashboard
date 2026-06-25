import type { DashboardModel, TopicRecord } from '@/domain/models';
import { STAGES, stageIndex, type Stage } from '@/domain/stages';
import type { Translator } from '@/i18n/translator';

import type { AssociationField, DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';
import { focusMeta, renderWindowTitlebar } from './window-frame';

export function renderMissionControl(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  if (model.focus.kind !== 'ready' && model.focus.kind !== 'invalid-stage') return;

  const topic = model.focus.topic;
  const currentStage = model.focus.kind === 'ready' ? topic.stage : null;
  const windowEl = parent.createEl('section', {
    cls: 'curiosity-window curiosity-mission',
    attr: { 'aria-labelledby': 'curiosity-mission-title' },
  });
  renderWindowTitlebar(windowEl, t.t('mission.title'), {
    titleId: 'curiosity-mission-title',
    ...focusMeta(model, t),
  });
  renderStages(windowEl, currentStage, t);
  const helpIds = renderWriteHelp(windowEl, model.mobileReadOnly, currentStage, t);

  const grid = windowEl.createDiv({ cls: 'curiosity-mission-grid' });
  renderTasks(grid, model, topic, handlers, helpIds.mobile, t);
  renderQuickLook(grid, model, topic, handlers, helpIds.mobile, t);

  const advance = windowEl.createEl('button', {
    cls: 'curiosity-primary curiosity-write-action',
    text: t.t('mission.advance'),
    type: 'button',
  });
  const disabled =
    model.mobileReadOnly || currentStage === null || currentStage === '复盘';
  advance.disabled = disabled;
  const advanceHelp = [helpIds.mobile, helpIds.stage].filter((id): id is string => id !== null);
  if (advanceHelp.length > 0) advance.setAttr('aria-describedby', advanceHelp.join(' '));
  if (model.mobileReadOnly) advance.setAttr('title', t.t('common.mobileReadonlyMode'));
  else if (currentStage === null) advance.setAttr('title', t.t('mission.invalidStageTitle'));
  else if (currentStage === '复盘') advance.setAttr('title', t.t('mission.terminalStageTitle'));
  else {
    bindGuardedAction(advance, () => handlers.confirmAdvance(topic.path, currentStage));
  }
}

function renderWriteHelp(
  parent: HTMLElement,
  mobileReadOnly: boolean,
  currentStage: Stage | null,
  t: Translator,
): { mobile: string | null; stage: string | null } {
  const mobile = mobileReadOnly ? 'curiosity-mobile-readonly-help' : null;
  const stage = currentStage === null
    ? 'curiosity-invalid-stage-help'
    : currentStage === '复盘'
      ? 'curiosity-terminal-stage-help'
      : null;
  if (mobile === null && stage === null) return { mobile, stage };

  const statuses = parent.createDiv({ cls: 'curiosity-write-statuses' });
  if (mobile !== null) {
    statuses.createEl('p', {
      text: t.t('mission.mobileReadonlyHelp'),
      attr: { id: mobile, role: 'status' },
    });
  }
  if (currentStage === null) {
    statuses.createEl('p', {
      text: t.t('mission.invalidStageHelp'),
      attr: { id: 'curiosity-invalid-stage-help', role: 'status' },
    });
  } else if (currentStage === '复盘') {
    statuses.createEl('p', {
      text: t.t('mission.terminalStageHelp'),
      attr: { id: 'curiosity-terminal-stage-help', role: 'status' },
    });
  }
  return { mobile, stage };
}

function renderStages(parent: HTMLElement, current: Stage | null, t: Translator): void {
  const wrapper = parent.createDiv({ cls: 'curiosity-stage-region' });
  if (current === null) {
    wrapper.createDiv({
      cls: 'curiosity-stage-warning',
      text: t.t('stage.unknown'),
      attr: { role: 'status' },
    });
  }
  const stages = wrapper.createEl('ol', {
    cls: 'curiosity-stage-track',
    attr: { 'aria-label': t.t('mission.stageTrackAria') },
  });
  const currentIndex = current === null ? -1 : stageIndex(current);
  for (const [index, stage] of STAGES.entries()) {
    const state = currentIndex === -1
      ? 'is-pending'
      : index < currentIndex
        ? 'is-complete'
        : index === currentIndex
          ? 'is-current'
          : 'is-pending';
    const item = stages.createEl('li', { cls: state });
    const label = t.stageLabel(stage);
    item.createSpan({ text: index < currentIndex ? `${label} ✓` : label });
    if (index === currentIndex) item.setAttr('aria-current', 'step');
  }
}

function renderTasks(
  parent: HTMLElement,
  model: DashboardModel,
  topic: TopicRecord,
  handlers: DashboardHandlers,
  mobileHelpId: string | null,
  t: Translator,
): void {
  const card = parent.createEl('section', {
    cls: 'curiosity-subcard curiosity-tasks',
    attr: { 'aria-labelledby': 'curiosity-task-title' },
  });
  card.createEl('h3', { text: t.t('mission.tasksTitle'), attr: { id: 'curiosity-task-title' } });
  if (model.tasks.length === 0) {
    card.createEl('p', { text: t.t('mission.tasksEmpty') });
    return;
  }

  const list = card.createEl('ul', { cls: 'curiosity-task-list' });
  for (const task of model.tasks) {
    const item = list.createEl('li');
    const button = item.createEl('button', {
      cls: `curiosity-task curiosity-write-action${task.checked ? ' is-checked' : ''}`,
      text: task.text,
      type: 'button',
      attr: { 'aria-pressed': String(task.checked) },
    });
    button.disabled = model.mobileReadOnly;
    if (model.mobileReadOnly) {
      button.setAttr('title', t.t('common.mobileReadonlyMode'));
      if (mobileHelpId !== null) button.setAttr('aria-describedby', mobileHelpId);
    } else bindGuardedAction(button, () => handlers.toggleTask(topic.path, task));
  }
}

function renderQuickLook(
  parent: HTMLElement,
  model: DashboardModel,
  topic: TopicRecord,
  handlers: DashboardHandlers,
  mobileHelpId: string | null,
  t: Translator,
): void {
  const card = parent.createEl('section', {
    cls: 'curiosity-subcard curiosity-quick-look',
    attr: { 'aria-labelledby': 'curiosity-quick-look-title' },
  });
  card.createEl('h3', { text: t.t('mission.quickLook'), attr: { id: 'curiosity-quick-look-title' } });
  const links: ReadonlyArray<[string, string | null]> = [
    [t.t('link.topicCard'), topic.path],
    [t.t('link.script'), topic.scriptPath],
    [t.t('link.asset'), topic.assetPath],
    [t.t('link.review'), topic.reviewPath],
  ];
  const available = links.filter((entry): entry is [string, string] => entry[1] !== null);
  if (available.length > 0) {
    const list = card.createEl('ul', { cls: 'curiosity-quick-links' });
    for (const [label, path] of available) {
      const item = list.createEl('li');
      const button = item.createEl('button', { text: label, type: 'button' });
      button.setAttr('aria-label', t.t('common.labelPath', { label, path }));
      button.addEventListener('click', () => void handlers.openPath(path));
    }
  }

  const associations: ReadonlyArray<{
    candidates: string[];
    field: AssociationField;
    label: string;
  }> = [
    { candidates: model.associationCandidates.scriptPath, field: 'script_path', label: t.t('link.script') },
    { candidates: model.associationCandidates.assetPath, field: 'asset_path', label: t.t('link.asset') },
    { candidates: model.associationCandidates.reviewPath, field: 'review_path', label: t.t('link.review') },
  ];
  for (const { candidates, field, label } of associations) {
    if (candidates.length <= 1) continue;
    const group = card.createDiv({ cls: 'curiosity-association-group' });
    group.createEl('p', { text: t.t('mission.multipleCandidates', { label }) });
    for (const candidate of candidates) {
      const button = group.createEl('button', {
        cls: 'curiosity-write-action',
        text: candidate,
        type: 'button',
      });
      button.disabled = model.mobileReadOnly;
      if (model.mobileReadOnly) {
        button.setAttr('title', t.t('common.mobileReadonlyMode'));
        if (mobileHelpId !== null) button.setAttr('aria-describedby', mobileHelpId);
      } else {
        bindGuardedAction(button, () =>
          handlers.setAssociation(topic.path, field, candidate));
      }
    }
  }
}
