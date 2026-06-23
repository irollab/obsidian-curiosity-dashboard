import type { DashboardModel } from '@/domain/models';

import type { DashboardHandlers } from '../dashboard-renderer';

export function renderHero(
  parent: HTMLElement,
  model: DashboardModel,
  handlers: DashboardHandlers,
): void {
  const hero = parent.createEl('header', { cls: 'curiosity-hero' });
  if (model.backgroundUrl !== null) {
    hero.style.setProperty('--curiosity-background', cssBackgroundUrl(model.backgroundUrl));
  }

  const menu = hero.createDiv({
    cls: 'curiosity-menu-bar',
    attr: { 'aria-label': 'Content Studio menu bar' },
  });
  menu.createSpan({ cls: 'curiosity-menu-brand', text: 'Content Studio' });
  menu.createSpan({ cls: 'curiosity-menu-context', text: 'Local Markdown Workspace' });

  const body = hero.createDiv({ cls: 'curiosity-hero-body' });
  body.createDiv({ cls: 'curiosity-kicker', text: 'CURRENT MISSION' });
  body.createEl('h1', { cls: 'curiosity-hero-title', text: 'Chase your curiosity' });

  if (model.focus.kind === 'none') {
    body.createEl('p', { cls: 'curiosity-hero-message', text: '尚未设置当前作品。' });
    actionButton(body, '打开插件设置', () => handlers.openSettings(), 'curiosity-primary');
    return;
  }

  if (model.focus.kind === 'multiple') {
    body.createEl('h2', { cls: 'curiosity-hero-state-title', text: '检测到多个当前作品' });
    body.createEl('p', {
      cls: 'curiosity-hero-message',
      text: '请只保留一个 homepage_focus: true，然后刷新工作台。',
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
  body.createDiv({ cls: 'curiosity-issue-pill', text: `ISSUE ${topic.issue}` });
  body.createEl('h2', { cls: 'curiosity-current-title', text: topic.title });

  const facts = body.createDiv({ cls: 'curiosity-hero-facts' });
  factCard(facts, 'CURRENT STAGE', stage ?? '未知阶段', stage === null ? 'is-invalid' : 'is-stage');
  factCard(facts, 'NEXT ACTION', topic.nextAction ?? '下一步未设置', 'is-next');

  const actions = body.createDiv({ cls: 'curiosity-hero-actions' });
  const currentPath = topic.scriptPath ?? topic.path;
  actionButton(
    actions,
    '打开当前作品',
    () => void handlers.openPath(currentPath),
    'curiosity-primary',
  );
  actionButton(actions, '查看选题卡', () => void handlers.openPath(topic.path));
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
