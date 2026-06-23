import { describe, expect, it, vi } from 'vitest';

import type { DashboardModel, TopicRecord } from '@/domain/models';
import { DashboardRenderer, type DashboardHandlers } from '@/ui/dashboard-renderer';

import { FakeElement, findAll, findByText } from '../support/fake-dom';

const topic: TopicRecord = {
  path: '10-选题池/39-首页.md',
  basename: '39-首页',
  title: 'Obsidian 太像文件夹，我用 Codex 重做了首页',
  issue: 39,
  status: '已立项',
  stage: '制作',
  priority: 'P1',
  dueDate: null,
  nextAction: '确认视觉结构',
  homepageFocus: true,
  scriptPath: '40-脚本大纲/39-成稿.md',
  assetPath: null,
  reviewPath: null,
};

function model(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [] },
    backgroundUrl: null,
    commentEvidence: [],
    focus: { kind: 'ready', topic: { ...topic, stage: '制作' } },
    metrics: [],
    mobileReadOnly: false,
    queue: [],
    reviewPath: null,
    tasks: [{ checked: false, line: 12, text: '完成首页开发验证' }],
    thisWeek: [],
    ...overrides,
  };
}

function handlers(): DashboardHandlers {
  return {
    confirmAdvance: vi.fn(async () => undefined),
    openPath: vi.fn(async () => undefined),
    openSettings: vi.fn(),
    selectTab: vi.fn(async () => undefined),
    setAssociation: vi.fn(async () => undefined),
    toggleTask: vi.fn(async () => undefined),
  };
}

function render(value: DashboardModel, activeTab: 'overview' | 'tasks' | 'data' = 'overview') {
  const root = new FakeElement();
  const actions = handlers();
  new DashboardRenderer().render(root as unknown as HTMLElement, value, actions, activeTab);
  return { root, actions };
}

describe('DashboardRenderer', () => {
  it('renders a safe background and the ready Hero content without using HTML strings', () => {
    const { root } = render(model({ backgroundUrl: 'app://vault/space");color:red).png' }));
    const hero = findAll(root, (element) => element.classList.has('curiosity-hero'))[0];

    expect(findByText(root, 'Chase your curiosity')).toBeDefined();
    expect(findByText(root, 'ISSUE 39')).toBeDefined();
    expect(findByText(root, topic.title)).toBeDefined();
    expect(findByText(root, '制作')).toBeDefined();
    expect(findByText(root, '确认视觉结构')).toBeDefined();
    expect(hero?.style.getPropertyValue('--curiosity-background')).toBe(
      'url("app://vault/space%22%29;color:red%29.png")',
    );
  });

  it('renders none, multiple, and invalid-stage focus states explicitly', () => {
    const noneActions = handlers();
    const noneRoot = new FakeElement();
    new DashboardRenderer().render(
      noneRoot as unknown as HTMLElement,
      model({ focus: { kind: 'none' }, tasks: [] }),
      noneActions,
      'overview',
    );
    findByText(noneRoot, '打开插件设置')?.click();
    expect(noneActions.openSettings).toHaveBeenCalledOnce();

    const second = { ...topic, path: '10-选题池/40-B.md', issue: 40, title: 'B' };
    const multiple = render(model({ focus: { kind: 'multiple', topics: [topic, second] }, tasks: [] }));
    findByText(multiple.root, 'B')?.click();
    expect(findByText(multiple.root, '检测到多个当前作品')).toBeDefined();
    expect(multiple.actions.openPath).toHaveBeenCalledWith(second.path);

    const invalidTopic = { ...topic, stage: null };
    const invalid = render(model({ focus: { kind: 'invalid-stage', topic: invalidTopic } }));
    expect(findByText(invalid.root, '未知阶段')).toBeDefined();
    expect(findByText(invalid.root, '完成首页开发验证')).toBeDefined();
    expect(findByText(invalid.root, '选题卡')).toBeDefined();
    expect(findByText(invalid.root, '推进阶段')?.disabled).toBe(true);
    findByText(invalid.root, '查看选题卡')?.click();
    expect(invalid.actions.openPath).toHaveBeenCalledWith(topic.path);
  });

  it('uses semantic tabs and arrow keys to select the adjacent tab', () => {
    const { root, actions } = render(model(), 'tasks');
    const tabs = findAll(root, (element) => element.getAttr('role') === 'tab');
    const tasks = tabs.find((element) => element.text === 'Tasks');

    expect(tabs).toHaveLength(3);
    expect(tasks?.tag).toBe('button');
    expect(tasks?.type).toBe('button');
    expect(tasks?.getAttr('aria-selected')).toBe('true');
    expect(tasks?.getAttr('tabindex')).toBe('0');
    const event = tasks?.keydown('ArrowRight');
    expect(event?.defaultPrevented).toBe(true);
    expect(actions.selectTab).toHaveBeenCalledWith('data');
  });

  it('passes the full task snapshot and explicit paths to handlers', () => {
    const task = { checked: false, line: 12, text: '完成首页开发验证' };
    const value = model({
      associationCandidates: {
        assetPath: ['20-素材库/39-a', '20-素材库/39-b'],
        reviewPath: [],
        scriptPath: [],
      },
      tasks: [task],
    });
    const { root, actions } = render(value);

    findByText(root, task.text)?.click();
    expect(actions.toggleTask).toHaveBeenCalledWith(topic.path, task);
    findByText(root, '脚本')?.click();
    expect(actions.openPath).toHaveBeenCalledWith(topic.scriptPath);
    findByText(root, '20-素材库/39-b')?.click();
    expect(actions.setAssociation).toHaveBeenCalledWith(
      topic.path,
      'asset_path',
      '20-素材库/39-b',
    );
  });

  it.each([
    { label: 'mobile', mobileReadOnly: true, stage: '制作' as const },
    { label: 'terminal', mobileReadOnly: false, stage: '复盘' as const },
  ])('disables unsafe writes for $label state', ({ mobileReadOnly, stage }) => {
    const readyTopic = { ...topic, stage };
    const { root, actions } = render(
      model({
        associationCandidates: {
          assetPath: ['20-素材库/39-a', '20-素材库/39-b'],
          reviewPath: [],
          scriptPath: [],
        },
        focus: { kind: 'ready', topic: readyTopic },
        mobileReadOnly,
      }),
    );

    expect(findByText(root, '推进阶段')?.disabled).toBe(true);
    if (mobileReadOnly) {
      expect(findByText(root, '完成首页开发验证')?.disabled).toBe(true);
      expect(findByText(root, '20-素材库/39-a')?.disabled).toBe(true);
    }
    findByText(root, '推进阶段')?.click();
    expect(actions.confirmAdvance).not.toHaveBeenCalled();
  });

  it('keeps the data tab structurally valid without inventing metrics', () => {
    const { root } = render(model(), 'data');
    const panel = findAll(root, (element) => element.getAttr('role') === 'tabpanel')[0];

    expect(panel).toBeDefined();
    expect(findByText(root, 'Mission Control')).toBeUndefined();
    expect(findByText(root, '0')).toBeUndefined();
  });
});
