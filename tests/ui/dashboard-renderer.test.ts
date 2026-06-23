import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn((element: { setAttr(name: string, value: string): void }, icon: string) => {
    element.setAttr('data-icon', icon);
  }),
}));

import type { DashboardModel, TopicRecord } from '@/domain/models';
import { DashboardRenderer, type DashboardHandlers } from '@/ui/dashboard-renderer';

import { FakeElement, fakeDocument, findAll, findByText } from '../support/fake-dom';

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
    createReview: vi.fn(async () => undefined),
    createScript: vi.fn(async () => undefined),
    createTopic: vi.fn(async () => undefined),
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
    expect(fakeDocument.activeElement?.text).toBe('Data');
    expect(actions.selectTab).toHaveBeenCalledWith('data');
  });

  it('creates a real panel target for every tab and hides inactive panels', () => {
    const { root } = render(model(), 'tasks');
    const panels = findAll(root, (element) => element.getAttr('role') === 'tabpanel');

    expect(panels).toHaveLength(3);
    expect(panels.map((panel) => panel.getAttr('id'))).toEqual([
      'curiosity-panel-overview',
      'curiosity-panel-tasks',
      'curiosity-panel-data',
    ]);
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true]);
    expect(findByText(panels[1]!, 'Mission Control')).toBeDefined();
    expect(findByText(panels[0]!, 'Mission Control')).toBeUndefined();
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

  it('guards pending writes against double click and restores a connected button after failure', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const task = { checked: false, line: 12, text: '完成首页开发验证' };
    const value = model({ tasks: [task] });
    const { root, actions } = render(value);
    vi.mocked(actions.toggleTask).mockReturnValueOnce(pending);
    const button = findByText(root, task.text);

    button?.click();
    button?.click();
    expect(actions.toggleTask).toHaveBeenCalledTimes(1);
    expect(button?.disabled).toBe(true);
    expect(button?.getAttr('aria-busy')).toBe('true');

    reject(new Error('stale'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    expect(button?.disabled).toBe(false);
    expect(button?.getAttr('aria-busy')).toBeNull();
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
      expect(findByText(root, '移动端只读：任务、关联路径和阶段推进不可修改。')).toBeDefined();
      expect(findByText(root, '完成首页开发验证')?.getAttr('aria-describedby')).toBe(
        'curiosity-mobile-readonly-help',
      );
    }
    findByText(root, '推进阶段')?.click();
    expect(actions.confirmAdvance).not.toHaveBeenCalled();
  });

  it('shows accessible reasons for invalid and terminal advance controls', () => {
    const invalidTopic = { ...topic, stage: null };
    const invalid = render(model({ focus: { kind: 'invalid-stage', topic: invalidTopic } }));
    expect(findByText(
      invalid.root,
      '当前阶段无法识别；请修正选题卡中的 stage 后再推进。',
    )).toBeDefined();
    expect(findByText(invalid.root, '推进阶段')?.getAttr('aria-describedby')).toBe(
      'curiosity-invalid-stage-help',
    );

    const terminal = render(model({
      focus: { kind: 'ready', topic: { ...topic, stage: '复盘' } },
    }));
    expect(findByText(
      terminal.root,
      '当前已处于复盘终止阶段，无法继续推进。',
    )).toBeDefined();
    expect(findByText(terminal.root, '推进阶段')?.getAttr('aria-describedby')).toBe(
      'curiosity-terminal-stage-help',
    );
  });

  it('includes the topic title in the Mission titlebar', () => {
    const { root } = render(model());
    expect(findByText(root, `Issue 39 — ${topic.title}`)).toBeDefined();
  });

  it('keeps the data tab structurally valid without inventing metrics', () => {
    const { root } = render(model(), 'data');
    const panel = findAll(root, (element) => element.getAttr('role') === 'tabpanel')[0];

    expect(panel).toBeDefined();
    expect(findByText(root, 'Mission Control')).toBeUndefined();
    expect(findByText(root, '0')).toBeUndefined();
  });
});
