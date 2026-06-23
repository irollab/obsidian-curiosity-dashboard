import type { DashboardModel, TopicRecord } from '@/domain/models';
import { STAGES, stageIndex, type Stage } from '@/domain/stages';

import type { AssociationField, DashboardHandlers } from '../dashboard-renderer';

export function renderMissionControl(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
): void {
  if (model.focus.kind !== 'ready' && model.focus.kind !== 'invalid-stage') return;

  const topic = model.focus.topic;
  const currentStage = model.focus.kind === 'ready' ? topic.stage : null;
  const windowEl = parent.createEl('section', {
    cls: 'curiosity-window curiosity-mission',
    attr: { 'aria-labelledby': 'curiosity-mission-title' },
  });
  renderTitlebar(windowEl, topic);
  renderStages(windowEl, currentStage);
  const helpIds = renderWriteHelp(windowEl, model.mobileReadOnly, currentStage);

  const grid = windowEl.createDiv({ cls: 'curiosity-mission-grid' });
  renderTasks(grid, model, topic, handlers, helpIds.mobile);
  renderQuickLook(grid, model, topic, handlers, helpIds.mobile);

  const advance = windowEl.createEl('button', {
    cls: 'curiosity-primary curiosity-write-action',
    text: '推进阶段',
    type: 'button',
  });
  const disabled =
    model.mobileReadOnly || currentStage === null || currentStage === '复盘';
  advance.disabled = disabled;
  const advanceHelp = [helpIds.mobile, helpIds.stage].filter((id): id is string => id !== null);
  if (advanceHelp.length > 0) advance.setAttr('aria-describedby', advanceHelp.join(' '));
  if (model.mobileReadOnly) advance.setAttr('title', '移动端为只读模式');
  else if (currentStage === null) advance.setAttr('title', '当前阶段无效，无法推进');
  else if (currentStage === '复盘') advance.setAttr('title', '复盘是终止阶段');
  else {
    bindGuardedAction(advance, () => handlers.confirmAdvance(topic.path, currentStage));
  }
}

function renderTitlebar(parent: HTMLElement, topic: TopicRecord): void {
  const bar = parent.createDiv({ cls: 'curiosity-titlebar' });
  const dots = bar.createDiv({
    cls: 'curiosity-traffic-lights',
    attr: { 'aria-hidden': 'true' },
  });
  for (const color of ['red', 'yellow', 'green']) {
    dots.createSpan({ cls: `curiosity-dot is-${color}` });
  }
  bar.createEl('h2', {
    cls: 'curiosity-window-title',
    text: 'Mission Control',
    attr: { id: 'curiosity-mission-title' },
  });
  bar.createSpan({
    cls: 'curiosity-window-issue',
    text: `Issue ${topic.issue} — ${topic.title}`,
  });
}

function renderWriteHelp(
  parent: HTMLElement,
  mobileReadOnly: boolean,
  currentStage: Stage | null,
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
      text: '移动端只读：任务、关联路径和阶段推进不可修改。',
      attr: { id: mobile, role: 'status' },
    });
  }
  if (currentStage === null) {
    statuses.createEl('p', {
      text: '当前阶段无法识别；请修正选题卡中的 stage 后再推进。',
      attr: { id: 'curiosity-invalid-stage-help', role: 'status' },
    });
  } else if (currentStage === '复盘') {
    statuses.createEl('p', {
      text: '当前已处于复盘终止阶段，无法继续推进。',
      attr: { id: 'curiosity-terminal-stage-help', role: 'status' },
    });
  }
  return { mobile, stage };
}

function renderStages(parent: HTMLElement, current: Stage | null): void {
  const wrapper = parent.createDiv({ cls: 'curiosity-stage-region' });
  if (current === null) {
    wrapper.createDiv({
      cls: 'curiosity-stage-warning',
      text: '未知阶段',
      attr: { role: 'status' },
    });
  }
  const stages = wrapper.createEl('ol', {
    cls: 'curiosity-stage-track',
    attr: { 'aria-label': '制作阶段' },
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
    item.createSpan({ text: index < currentIndex ? `${stage} ✓` : stage });
    if (index === currentIndex) item.setAttr('aria-current', 'step');
  }
}

function renderTasks(
  parent: HTMLElement,
  model: DashboardModel,
  topic: TopicRecord,
  handlers: DashboardHandlers,
  mobileHelpId: string | null,
): void {
  const card = parent.createEl('section', {
    cls: 'curiosity-subcard curiosity-tasks',
    attr: { 'aria-labelledby': 'curiosity-task-title' },
  });
  card.createEl('h3', { text: '本期执行清单', attr: { id: 'curiosity-task-title' } });
  if (model.tasks.length === 0) {
    card.createEl('p', { text: '未找到「本期执行清单」' });
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
      button.setAttr('title', '移动端为只读模式');
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
): void {
  const card = parent.createEl('section', {
    cls: 'curiosity-subcard curiosity-quick-look',
    attr: { 'aria-labelledby': 'curiosity-quick-look-title' },
  });
  card.createEl('h3', { text: 'Quick Look', attr: { id: 'curiosity-quick-look-title' } });
  const links: ReadonlyArray<[string, string | null]> = [
    ['选题卡', topic.path],
    ['脚本', topic.scriptPath],
    ['素材', topic.assetPath],
    ['复盘', topic.reviewPath],
  ];
  const available = links.filter((entry): entry is [string, string] => entry[1] !== null);
  if (available.length > 0) {
    const list = card.createEl('ul', { cls: 'curiosity-quick-links' });
    for (const [label, path] of available) {
      const item = list.createEl('li');
      const button = item.createEl('button', { text: label, type: 'button' });
      button.setAttr('aria-label', `${label}：${path}`);
      button.addEventListener('click', () => void handlers.openPath(path));
    }
  }

  const associations: ReadonlyArray<{
    candidates: string[];
    field: AssociationField;
    label: string;
  }> = [
    { candidates: model.associationCandidates.scriptPath, field: 'script_path', label: '脚本' },
    { candidates: model.associationCandidates.assetPath, field: 'asset_path', label: '素材' },
    { candidates: model.associationCandidates.reviewPath, field: 'review_path', label: '复盘' },
  ];
  for (const { candidates, field, label } of associations) {
    if (candidates.length <= 1) continue;
    const group = card.createDiv({ cls: 'curiosity-association-group' });
    group.createEl('p', { text: `${label}存在多个候选，请选择：` });
    for (const candidate of candidates) {
      const button = group.createEl('button', {
        cls: 'curiosity-write-action',
        text: candidate,
        type: 'button',
      });
      button.disabled = model.mobileReadOnly;
      if (model.mobileReadOnly) {
        button.setAttr('title', '移动端为只读模式');
        if (mobileHelpId !== null) button.setAttr('aria-describedby', mobileHelpId);
      } else {
        bindGuardedAction(button, () =>
          handlers.setAssociation(topic.path, field, candidate));
      }
    }
  }
}

function bindGuardedAction(button: HTMLButtonElement, action: () => Promise<void>): void {
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttr('aria-busy', 'true');
    const settle = (): void => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    };
    void action().then(settle, settle);
  });
}
