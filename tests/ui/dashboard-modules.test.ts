import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn((element: { setAttr(name: string, value: string): void }, icon: string) => {
    element.setAttr('data-icon', icon);
  }),
}));

import type { DashboardModel, TopicRecord } from '@/domain/models';
import type { WorkflowAction } from '@/domain/workflow';
import { createTranslator } from '@/i18n/translator';
import {
  DashboardRenderer,
  type DashboardHandlers,
  type DashboardTab,
} from '@/ui/dashboard-renderer';

import { FakeElement, findAll, findByText } from '../support/fake-dom';

const topic: TopicRecord = {
  assetPath: null,
  basename: '39-home',
  dueDate: null,
  homepageFocus: true,
  issue: 39,
  nextAction: null,
  path: '10-选题池/39-home.md',
  priority: null,
  reviewPath: null,
  scriptPath: null,
  stage: '制作',
  status: '已立项',
  title: 'Obsidian 太像文件夹，我用 Codex 重做了首页',
};

function model(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [] },
    backgroundUrl: null,
    logoUrl: null,
    commentEvidence: [],
    focus: { kind: 'ready', topic: { ...topic, stage: '制作' } },
    focusCandidates: [],
    pickableTopics: [],
    metrics: [],
    mobileReadOnly: false,
    queue: [],
    reviewPath: null,
    tasks: [],
    thisWeek: [],
    workflowActions: [],
    promptTemplatesPresent: false,
    promptTemplatesSkipped: [],
    ideas: [],
    ...overrides,
  };
}

function handlers(): DashboardHandlers {
  return {
    confirmAdvance: vi.fn(async () => undefined),
    copyPrompt: vi.fn(async () => undefined),
    createReview: vi.fn(async () => undefined),
    createScript: vi.fn(async () => undefined),
    createTopic: vi.fn(async () => undefined),
    captureIdea: vi.fn(async () => undefined),
    editIdea: vi.fn(async () => undefined),
    deleteIdea: vi.fn(async () => undefined),
    openWorkflowIdeas: vi.fn(async () => undefined),
    openOutput: vi.fn(async () => undefined),
    openPath: vi.fn(async () => undefined),
    openSettings: vi.fn(),
    seedPromptTemplates: vi.fn(async () => undefined),
    selectTab: vi.fn(async () => undefined),
    setAssociation: vi.fn(async () => undefined),
    switchFocus: vi.fn(async () => undefined),
    openWorkPicker: vi.fn(async () => undefined),
    toggleTask: vi.fn(async () => undefined),
  };
}

function render(
  value = model(),
  activeTab: DashboardTab = 'overview',
  actions = handlers(),
): { actions: DashboardHandlers; root: FakeElement } {
  const root = new FakeElement();
  new DashboardRenderer().render(
    root as unknown as HTMLElement, value, actions, activeTab, createTranslator('zh'),
  );
  return { actions, root };
}

function section(root: FakeElement, heading: string): FakeElement {
  const title = findByText(root, heading);
  // 标题现位于 macOS 窗口标题栏内，向上回溯到 section/window 容器。
  let element: FakeElement | null | undefined = title?.parent;
  while (
    element !== null &&
    element !== undefined &&
    !element.classList.has('curiosity-section') &&
    !element.classList.has('curiosity-window')
  ) {
    element = element.parent;
  }
  if (element === null || element === undefined) {
    throw new Error(`Missing section: ${heading}`);
  }
  return element;
}

function topicAt(index: number): TopicRecord {
  return {
    ...topic,
    dueDate: index % 2 === 0 ? `2026-06-${String(index + 10).padStart(2, '0')}` : null,
    issue: 40 + index,
    path: `10-选题池/${40 + index}-topic.md`,
    title: `Topic ${index + 1}`,
  };
}

describe('dashboard secondary modules', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['overview', ['任务中心', '本周', '制作队列', '渠道脉搏', '快捷操作']],
    ['tasks', ['任务中心', '本周']],
    ['data', ['渠道脉搏']],
  ] as const)('composes only the intended modules in the %s panel', (activeTab, expected) => {
    const { root } = render(model(), activeTab);
    const activePanel = findAll(
      root,
      (element) => element.getAttr('role') === 'tabpanel' && !element.hidden,
    )[0];
    const headings = findAll(
      activePanel!,
      (element) => element.tag === 'h2',
    ).map((element) => element.text);

    expect(headings).toEqual(expected);
    expect(findAll(activePanel!, (element) => element.classList.has('curiosity-dock'))).toHaveLength(0);
    expect(findAll(root, (element) => element.classList.has('curiosity-dock'))).toHaveLength(1);
  });

  it('shows a weekly progress summary when no due-dated topics exist', () => {
    const { root } = render(model({
      focus: { kind: 'ready', topic: { ...topic, stage: '制作' } },
      tasks: [
        { checked: true, line: 1, text: 'a' },
        { checked: false, line: 2, text: 'b' },
      ],
      queue: [topicAt(0), topicAt(1)],
      thisWeek: [],
    }), 'tasks');
    const week = section(root, '本周');

    expect(findByText(week, '本周暂无已设置截止日期的作品。')).toBeDefined();
    expect(findByText(week, '阶段进度')).toBeDefined();
    expect(findByText(week, '制作 · 3/5')).toBeDefined();
    expect(findByText(week, '清单完成')).toBeDefined();
    expect(findByText(week, '1/2')).toBeDefined();
    expect(findByText(week, '队列待办')).toBeDefined();
    expect(findByText(week, '2 项')).toBeDefined();
  });

  it('limits long week and queue collections and reports every omitted item', () => {
    const { root } = render(model({
      queue: Array.from({ length: 9 }, (_, index) => topicAt(index)),
      thisWeek: Array.from({ length: 10 }, (_, index) => topicAt(index)),
    }));
    const week = section(root, '本周');
    const queue = section(root, '制作队列');

    expect(findAll(week, (element) => element.tag === 'li')).toHaveLength(8);
    expect(findByText(week, '另有 2 项')).toBeDefined();
    expect(findByText(week, '制作 · 未设置')).toBeDefined();
    expect(findAll(queue, (element) => element.tag === 'article')).toHaveLength(6);
    expect(findByText(queue, '另有 3 项')).toBeDefined();
    expect(findByText(queue, '制作 · 未设置 · 未设置')).toBeDefined();
  });

  it('renders only sourced metric columns, semantic table metadata, and verbatim comments', () => {
    const rawComment = '<script>alert("不要执行")</script> 我想看完整流程';
    const { root, actions } = render(model({
      commentEvidence: [rawComment],
      metrics: [
        {
          collectedAt: '2026-06-22 10:00',
          comments: null,
          favorites: null,
          likes: null,
          platform: '抖音',
          shares: null,
          views: '1200',
        },
        {
          collectedAt: null,
          comments: '7',
          favorites: null,
          likes: '88',
          platform: 'B站',
          shares: null,
          views: null,
        },
      ],
      reviewPath: '60-发布复盘/39-review.md',
    }), 'data');
    const pulse = section(root, '渠道脉搏');
    const headers = findAll(pulse, (element) => element.tag === 'th');

    expect(headers.map((element) => element.text)).toEqual([
      '平台', '采集时间', '播放/观看', '点赞', '评论',
    ]);
    expect(headers.every((element) => element.getAttr('scope') === 'col')).toBe(true);
    expect(findAll(pulse, (element) => element.tag === 'caption')[0]?.text).toBe(
      '本地发布复盘中的平台数据',
    );
    expect(findAll(pulse, (element) => element.text === '—').length).toBeGreaterThan(0);
    expect(findByText(pulse, '收藏')).toBeUndefined();
    expect(findByText(pulse, '分享')).toBeUndefined();
    expect(findAll(pulse, (element) => element.tag === 'blockquote').map((item) => item.text)).toEqual([
      rawComment,
    ]);

    findByText(pulse, '数据来源：本地发布复盘')?.click();
    expect(actions.openPath).toHaveBeenCalledWith('60-发布复盘/39-review.md');
  });

  it('limits Channel Pulse rows and comments while deriving columns from every source row', () => {
    const metrics = Array.from({ length: 14 }, (_, index) => ({
      collectedAt: null,
      comments: null,
      favorites: index === 13 ? '99' : null,
      likes: null,
      platform: `平台 ${index + 1}`,
      shares: null,
      views: String(100 + index),
    }));
    const commentEvidence = Array.from({ length: 10 }, (_, index) => `评论 ${index + 1}`);
    const { root } = render(model({ commentEvidence, metrics }), 'data');
    const pulse = section(root, '渠道脉搏');

    expect(findAll(pulse, (element) => element.tag === 'tbody')[0]?.children).toHaveLength(12);
    expect(findByText(pulse, '平台 12')).toBeDefined();
    expect(findByText(pulse, '平台 13')).toBeUndefined();
    expect(findByText(pulse, '收藏')).toBeDefined();
    expect(findByText(pulse, '另有 2 条平台数据')).toBeDefined();
    expect(findAll(pulse, (element) => element.tag === 'blockquote')).toHaveLength(8);
    expect(findByText(pulse, '评论 8')).toBeDefined();
    expect(findByText(pulse, '评论 9')).toBeUndefined();
    expect(findByText(pulse, '另有 2 条评论')).toBeDefined();
  });

  it('keeps the local review entry and explicit comment state when metrics are absent', () => {
    const { root } = render(model({ reviewPath: '60-发布复盘/39-review.md' }), 'data');

    expect(findByText(root, '暂无可验证平台数据。')).toBeDefined();
    expect(findByText(root, '数据来源：本地发布复盘')).toBeDefined();
    expect(findByText(root, '暂无可验证评论内容')).toBeDefined();
  });

  it('uses existing paths before creation and supports an invalid-stage focus topic', () => {
    const existing = { ...topic, reviewPath: '60-发布复盘/39.md', scriptPath: '40-脚本大纲/39.md' };
    const ready = render(model({ focus: { kind: 'ready', topic: { ...existing, stage: '制作' } } }));

    findByText(ready.root, '打开脚本')?.click();
    findByText(ready.root, '打开复盘')?.click();
    expect(ready.actions.openPath).toHaveBeenCalledWith(existing.scriptPath);
    expect(ready.actions.openPath).toHaveBeenCalledWith(existing.reviewPath);
    expect(ready.actions.createScript).not.toHaveBeenCalled();
    expect(ready.actions.createReview).not.toHaveBeenCalled();

    const invalidTopic = { ...topic, stage: null };
    const invalid = render(model({ focus: { kind: 'invalid-stage', topic: invalidTopic } }));
    findByText(invalid.root, '创建脚本')?.click();
    findByText(invalid.root, '创建复盘')?.click();
    expect(invalid.actions.createScript).toHaveBeenCalledWith(invalidTopic);
    expect(invalid.actions.createReview).toHaveBeenCalledWith(invalidTopic);
  });

  it('always renders real create controls and exposes mobile read-only reasons', () => {
    const desktop = render();
    expect(findByText(desktop.root, '创建选题卡')).toBeDefined();
    expect(findByText(desktop.root, '创建脚本')).toBeDefined();
    expect(findByText(desktop.root, '创建复盘')).toBeDefined();
    expect(findByText(desktop.root, '灵感')).toBeDefined();

    const mobile = render(model({ mobileReadOnly: true }));
    expect(findByText(mobile.root, '移动端只读：创建操作不可用。')).toBeDefined();
    for (const label of ['创建选题卡', '创建脚本', '创建复盘']) {
      const button = findByText(mobile.root, label);
      expect(button?.disabled).toBe(true);
      expect(button?.getAttr('aria-label')).toContain('移动端只读');
    }
  });

  it('guards Quick Actions and Dock creation buttons while an action is in flight', async () => {
    let resolveTopic!: () => void;
    const pendingTopic = new Promise<void>((resolve) => { resolveTopic = resolve; });
    const quick = render();
    vi.mocked(quick.actions.createTopic).mockReturnValueOnce(pendingTopic);
    const quickButton = findByText(quick.root, '创建选题卡');

    quickButton?.click();
    quickButton?.click();
    expect(quick.actions.createTopic).toHaveBeenCalledOnce();
    expect(quickButton?.disabled).toBe(true);
    expect(quickButton?.getAttr('aria-busy')).toBe('true');
    resolveTopic();
    await pendingTopic;
    await Promise.resolve();
    expect(quickButton?.disabled).toBe(false);
    expect(quickButton?.getAttr('aria-busy')).toBeNull();

    let resolveScript!: () => void;
    const pendingScript = new Promise<void>((resolve) => { resolveScript = resolve; });
    const dock = render(model(), 'tasks');
    vi.mocked(dock.actions.createScript).mockReturnValueOnce(pendingScript);
    const dockButton = findByText(dock.root, '脚本')?.parent;
    dockButton?.click();
    dockButton?.click();
    expect(dock.actions.createScript).toHaveBeenCalledOnce();
    expect(dockButton?.disabled).toBe(true);
    expect(dockButton?.getAttr('aria-busy')).toBe('true');
    resolveScript();
    await pendingScript;
    await Promise.resolve();
    expect(dockButton?.disabled).toBe(false);
  });

  it.each([
    ['作品', 'openWorkPicker'],
    ['任务', 'selectTab'],
    ['数据', 'selectTab'],
  ] as const)('keeps the Dock %s action guarded until its handler promise settles', async (label, handler) => {
    let resolveAction!: () => void;
    const pendingAction = new Promise<void>((resolve) => { resolveAction = resolve; });
    const current = { ...topic, reviewPath: '60-发布复盘/39.md', scriptPath: '40-脚本大纲/39.md' };
    const result = render(model({ focus: { kind: 'ready', topic: { ...current, stage: '制作' } } }));
    vi.mocked(result.actions[handler]).mockReturnValueOnce(pendingAction);
    const dock = findAll(result.root, (element) => element.classList.has('curiosity-dock'))[0]!;
    const button = findByText(dock, label)?.parent;

    button?.click();
    await Promise.resolve();
    button?.click();

    expect(result.actions[handler]).toHaveBeenCalledOnce();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttr('aria-busy')).toBe('true');

    resolveAction();
    await pendingAction;
    await Promise.resolve();
    expect(button?.disabled).toBe(false);
    expect(button?.getAttr('aria-busy')).toBeNull();
  });

  it('builds an icon-backed Dock whose enabled items invoke real destinations', () => {
    const current = {
      ...topic,
      reviewPath: '60-发布复盘/39.md',
      scriptPath: '40-脚本大纲/39.md',
    };
    const { root, actions } = render(model({
      focus: { kind: 'ready', topic: { ...current, stage: '制作' } },
    }));
    const dock = findAll(root, (element) => element.classList.has('curiosity-dock'))[0]!;
    const labels = ['灵感', '作品', '任务', '脚本', '数据', '复盘', '设置'];

    expect(findAll(dock, (element) => element.getAttr('data-icon') !== null)).toHaveLength(7);
    expect(vi.mocked(setIcon)).toHaveBeenCalledTimes(7);
    for (const label of labels) {
      const button = findByText(dock, label)?.parent;
      expect(button?.tag).toBe('button');
      expect(button?.type).toBe('button');
      expect(button?.getAttr('aria-label')).toBe(label);
      button?.click();
    }
    expect(actions.captureIdea).toHaveBeenCalledOnce();
    expect(actions.openWorkPicker).toHaveBeenCalledOnce();
    expect(actions.openPath).toHaveBeenCalledWith(current.scriptPath);
    expect(actions.openPath).toHaveBeenCalledWith(current.reviewPath);
    expect(actions.selectTab).toHaveBeenCalledWith('tasks');
    expect(actions.selectTab).toHaveBeenCalledWith('data');
    expect(actions.openSettings).toHaveBeenCalledOnce();
  });

  it('disables unavailable Dock destinations with a visible and accessible reason', () => {
    const actions = handlers();
    const { root } = render(model({ focus: { kind: 'none' } }), 'overview', actions);
    const dock = findAll(root, (element) => element.classList.has('curiosity-dock'))[0]!;

    for (const label of ['脚本', '复盘']) {
      const button = findByText(dock, label)?.parent;
      expect(button?.disabled).toBe(true);
      expect(button?.getAttr('aria-label')).toContain('不可用');
    }
    expect(findByText(dock, '当前作品未关联脚本')).toBeDefined();
    expect(findByText(dock, '当前作品未关联复盘')).toBeDefined();
    expect(findByText(dock, '作品')?.parent?.disabled).toBe(false);
    expect(findByText(dock, '任务')?.parent?.disabled).toBe(false);
    expect(findByText(dock, '数据')?.parent?.disabled).toBe(false);
    expect(findByText(dock, '设置')?.parent?.disabled).toBe(false);
  });

  it('sets button type explicitly for every secondary-module control', () => {
    const { root } = render(model({
      queue: [topicAt(1)],
      reviewPath: '60-发布复盘/39.md',
      thisWeek: [topicAt(2)],
    }));
    const secondary = findAll(
      root,
      (element) => element.classList.has('curiosity-content') || element.classList.has('curiosity-dock'),
    );
    const buttons = secondary.flatMap((area) => findAll(area, (element) => element.tag === 'button'));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.type === 'button')).toBe(true);
  });
});

describe('hero focus switcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a chip for each other active topic and switches focus on click', () => {
    const candidate = {
      path: '10-选题池/40-topic.md',
      issue: 40,
      title: 'Topic 1',
      stage: '制作' as const,
      isActive: false,
    };
    const actions = handlers();
    const { root } = render(model({ focusCandidates: [candidate] }), 'overview', actions);

    expect(findByText(root, '切换当前作品')).toBeDefined();
    expect(findByText(root, '第 40 期 · Topic 1')).toBeDefined();
    const chip = findAll(root, (element) => element.classList.has('curiosity-focus-chip'))[0];
    chip?.click();

    expect(actions.switchFocus).toHaveBeenCalledWith('10-选题池/40-topic.md');
  });

  it('omits the switcher when no other active topic exists', () => {
    const { root } = render(model({ focusCandidates: [] }), 'overview');
    expect(findByText(root, '切换当前作品')).toBeUndefined();
  });

  it('disables focus chips in mobile read-only mode', () => {
    const candidate = {
      path: '10-选题池/40-topic.md',
      issue: 40,
      title: 'Topic 1',
      stage: '制作' as const,
      isActive: false,
    };
    const actions = handlers();
    const { root } = render(
      model({ focusCandidates: [candidate], mobileReadOnly: true }),
      'overview',
      actions,
    );
    const chip = findAll(root, (element) => element.classList.has('curiosity-focus-chip'))[0];
    expect(chip?.disabled).toBe(true);
    chip?.click();
    expect(actions.switchFocus).not.toHaveBeenCalled();
  });
});

describe('workflow deck tab', () => {
  beforeEach(() => vi.clearAllMocks());

  const evalAction: WorkflowAction = {
    id: 'eval', label: '批量评估', description: '给结论不改文件', group: '选题', order: 2,
    needsFocus: false, output: null, body: '评估 {{inbox_dir}}', sourcePath: 'x.md',
  };
  const scriptAction: WorkflowAction = {
    id: 'gen-script', label: '从选题生成脚本大纲', description: '', group: '策划', order: 1,
    needsFocus: true, output: '40-脚本大纲/草稿', body: '基于 {{focus_topic}}', sourcePath: 'y.md',
  };

  it('工作流 tab 渲染分组与按钮', () => {
    const root = new FakeElement();
    const actions = handlers();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ workflowActions: [evalAction, scriptAction], promptTemplatesPresent: true, focus: { kind: 'none' } }),
      actions, 'workflow' as DashboardTab, createTranslator('zh'),
    );
    expect(findByText(root, '批量评估')).not.toBeNull();
    expect(findByText(root, '从选题生成脚本大纲')).not.toBeNull();
    // 只读类（output=null）不渲染"打开输出位置"
    expect(findAll(root, (element) => element.tag === 'button' && element.text === '打开输出位置')).toHaveLength(1);
  });

  it('needs_focus 但无焦点时复制按钮禁用', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ workflowActions: [scriptAction], promptTemplatesPresent: true, focus: { kind: 'none' } }),
      handlers(), 'workflow' as DashboardTab, createTranslator('zh'),
    );
    const copy = findAll(root, (element) => element.tag === 'button' && element.text === '复制提示词')[0];
    expect(copy?.disabled).toBe(true);
  });

  it('无模板时渲染种子按钮', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ workflowActions: [], promptTemplatesPresent: false }),
      handlers(), 'workflow' as DashboardTab, createTranslator('zh'),
    );
    expect(findByText(root, '生成默认提示词模板')).not.toBeNull();
  });
});
