import type { DashboardModel } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';
import { bindGuardedAction } from '../guarded-action';

export function renderHero(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const hero = parent.createEl('header', { cls: 'curiosity-hero' });
  if (model.backgroundUrl !== null) {
    // 设在共同父节点（shell）上，让 hero 与 content 都能继承该背景图变量，
    // 内容区面板的水玻璃 backdrop-filter 才有图可模糊。
    parent.style.setProperty('--curiosity-background', cssBackgroundUrl(model.backgroundUrl));
  }

  const menu = hero.createDiv({
    cls: 'curiosity-menu-bar',
    attr: { 'aria-label': t.t('hero.menuAria') },
  });
  menu.createSpan({ cls: 'curiosity-menu-brand', text: t.t('hero.brand') });
  menu.createSpan({ cls: 'curiosity-menu-context', text: t.t('hero.context') });

  const body = hero.createDiv({ cls: 'curiosity-hero-body' });
  body.createEl('h1', { cls: 'curiosity-hero-title', text: t.t('hero.title') });

  if (model.focus.kind === 'none') {
    body.createEl('p', { cls: 'curiosity-hero-message', text: t.t('hero.noFocus') });
    actionButton(body, t.t('hero.openSettings'), () => handlers.openSettings(), 'curiosity-primary');
    return;
  }

  if (model.focus.kind === 'multiple') {
    body.createEl('h2', { cls: 'curiosity-hero-state-title', text: t.t('hero.multipleTitle') });
    body.createEl('p', {
      cls: 'curiosity-hero-message',
      text: t.t('hero.multipleMessage'),
    });
    const conflicts = body.createEl('ul', { cls: 'curiosity-focus-conflicts' });
    for (const topic of model.focus.topics) {
      const item = conflicts.createEl('li');
      actionButton(item, topic.title, () => void handlers.openPath(topic.path));
    }
    return;
  }

  const topic = model.focus.topic;
  const stage = model.focus.kind === 'ready' ? topic.stage : null;
  body.createDiv({ cls: 'curiosity-issue-pill', text: t.t('hero.issuePill', { issue: topic.issue }) });
  body.createEl('h2', { cls: 'curiosity-current-title', text: topic.title });

  const facts = body.createDiv({ cls: 'curiosity-hero-facts' });
  factCard(
    facts,
    t.t('hero.currentStageLabel'),
    stage === null ? t.t('stage.unknown') : t.stageLabel(stage),
    stage === null ? 'is-invalid' : 'is-stage',
  );
  // 下一步：手动 next_action 优先；否则自动取本期清单第一个未勾选项；都没有才显示未设置。
  const firstPendingTask = model.tasks.find((task) => !task.checked)?.text ?? null;
  const nextAction = topic.nextAction ?? firstPendingTask;
  factCard(facts, t.t('hero.nextActionLabel'), nextAction ?? t.t('hero.nextActionUnset'), 'is-next');

  const actions = body.createDiv({ cls: 'curiosity-hero-actions' });
  const scriptPath = topic.scriptPath;
  if (scriptPath !== null) {
    actionButton(
      actions,
      t.t('hero.openScript'),
      () => void handlers.openPath(scriptPath),
      'curiosity-primary',
    );
  } else {
    const createScript = actionButton(
      actions,
      t.t('action.createScript'),
      () => void handlers.createScript(topic),
      'curiosity-primary curiosity-write-action',
    );
    if (model.mobileReadOnly) {
      createScript.disabled = true;
      createScript.setAttr('title', t.t('hero.mobileReadonlyCreateScript'));
      createScript.setAttr('aria-label', t.t('hero.createScriptDisabledAria'));
    }
  }
  actionButton(actions, t.t('hero.viewTopic'), () => void handlers.openPath(topic.path));

  renderFocusSwitcher(body, model, handlers, t);
}

function renderFocusSwitcher(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  // 只显示"其他"候选：当前焦点已在 Hero 主体展示，无需重复。
  const others = model.focusCandidates.filter((candidate) => !candidate.isActive);
  if (others.length === 0) return;

  const switcher = parent.createDiv({ cls: 'curiosity-focus-switcher' });
  switcher.createSpan({ cls: 'curiosity-focus-switcher-label', text: t.t('hero.switchLabel') });
  const chips = switcher.createDiv({ cls: 'curiosity-focus-chips' });
  for (const candidate of others) {
    const chip = chips.createEl('button', {
      cls: 'curiosity-focus-chip curiosity-write-action',
      type: 'button',
    });
    // track 是 content-box 裁剪层：padding 留在 button 上不参与裁剪，
    // 滚动文字在 track 内被裁断，左右 padding 始终保持留白。
    const track = chip.createSpan({ cls: 'curiosity-focus-chip-track' });
    const label = track.createSpan({
      cls: 'curiosity-focus-chip-label',
      text: t.t('hero.focusChip', { issue: candidate.issue, title: candidate.title }),
    });
    enableOverflowMarquee(track, label);
    if (model.mobileReadOnly) {
      chip.disabled = true;
      chip.setAttr('title', t.t('common.mobileReadonlyMode'));
    } else {
      bindGuardedAction(chip, () => handlers.switchFocus(candidate.path));
    }
  }
}

function enableOverflowMarquee(track: HTMLElement, label: HTMLElement): void {
  // track 是 content-box 裁剪窗口（padding 留在 button 上不参与裁剪）；
  // 文字溢出时由 JS 精确计算位移，测试桩无布局度量则安全跳过。
  const apply = (): void => {
    const trackWidth = track.clientWidth;
    const labelWidth = label.scrollWidth;
    if (typeof trackWidth !== 'number' || typeof labelWidth !== 'number') return;
    if (labelWidth <= trackWidth + 1) return;
    label.style.setProperty('--curiosity-chip-shift', `${trackWidth - labelWidth}px`);
    label.addClass('is-overflow');
  };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}

function factCard(parent: HTMLElement, label: string, value: string, variant: string): void {
  const card = parent.createDiv({ cls: `curiosity-fact-card ${variant}` });
  card.createSpan({ cls: 'curiosity-fact-label', text: label });
  card.createEl('strong', { cls: 'curiosity-fact-value', text: value });
}

function actionButton(
  parent: HTMLElement,
  label: string,
  action: () => void,
  className = '',
): HTMLButtonElement {
  const button = parent.createEl('button', { cls: className, text: label, type: 'button' });
  button.addEventListener('click', action);
  return button;
}

function cssBackgroundUrl(url: string): string {
  const escaped = url
    .replaceAll('\\', '%5C')
    .replaceAll('"', '%22')
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  return `url("${escaped}")`;
}
