import type { DashboardModel } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

import type { DashboardHandlers } from '../dashboard-renderer';

export function renderHero(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
  t: Translator,
): void {
  const hero = parent.createEl('header', { cls: 'curiosity-hero' });
  if (model.backgroundUrl !== null) {
    hero.style.setProperty('--curiosity-background', cssBackgroundUrl(model.backgroundUrl));
  }

  const menu = hero.createDiv({
    cls: 'curiosity-menu-bar',
    attr: { 'aria-label': t.t('hero.menuAria') },
  });
  menu.createSpan({ cls: 'curiosity-menu-brand', text: t.t('hero.brand') });
  menu.createSpan({ cls: 'curiosity-menu-context', text: t.t('hero.context') });

  const body = hero.createDiv({ cls: 'curiosity-hero-body' });
  body.createDiv({ cls: 'curiosity-kicker', text: t.t('hero.kicker') });
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
  factCard(facts, t.t('hero.nextActionLabel'), topic.nextAction ?? t.t('hero.nextActionUnset'), 'is-next');

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
