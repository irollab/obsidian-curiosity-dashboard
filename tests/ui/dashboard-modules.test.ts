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
    audienceSignals: [],
    hotspots: [],
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
    refreshHotspots: vi.fn(async () => undefined),
    archiveHotspots: vi.fn(async () => undefined),
    copyDiscoveryPrompt: vi.fn(async () => undefined),
    openHotspot: vi.fn(),
    promoteTopic: vi.fn(async () => undefined),
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

  it('渠道脉搏：平台标签彩色、播放量最高值放大突出', () => {
    const { root } = render(model({
      metrics: [
        {
          collectedAt: '2026-06-22 10:00', comments: '7', favorites: null,
          likes: '88', platform: 'B站', shares: null, views: '1200',
        },
        {
          collectedAt: null, comments: null, favorites: null,
          likes: '5', platform: '抖音', shares: null, views: '8.5万',
        },
      ],
      reviewPath: '60-发布复盘/39-review.md',
    }), 'data');
    const pulse = section(root, '渠道脉搏');

    // 平台渲染为彩色标签 span
    const platforms = findAll(pulse, (element) => element.classList.has('curiosity-pulse-platform'));
    expect(platforms.map((element) => element.textContent)).toEqual(['B站', '抖音']);
    expect(platforms[0]?.style.getPropertyValue('background')).not.toBe('');

    // 每个指标列的最高值各自放大突出（播放/点赞/评论 各 1 个）
    const topCells = findAll(pulse, (element) =>
      element.classList.has('curiosity-pulse-top'));
    expect(topCells).toHaveLength(3);
    expect(topCells.some((cell) => cell.textContent.includes('8.5万'))).toBe(true);
    expect(topCells.some((cell) => cell.textContent.includes('88'))).toBe(true);
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
    // dock 7 个图标 + 底部 footer 邮箱/GitHub 2 个图标 = 9 次
    expect(vi.mocked(setIcon)).toHaveBeenCalledTimes(9);
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

  it('底部渲染版权信息：Powered by / ©2026 / 邮箱链接 / GitHub 仓库', () => {
    const { root } = render(model());
    const footer = findAll(root, (element) => element.classList.has('curiosity-footer'))[0];
    expect(footer).toBeDefined();
    expect(footer?.textContent).toContain('iRollab');
    expect(footer?.textContent).toContain('2026');
    expect(footer?.textContent).toContain('th@tancem.cn');
    const email = findAll(footer!, (element) => element.classList.has('curiosity-footer-email'))[0];
    expect(email?.getAttr('href')).toBe('mailto:th@tancem.cn');
    const repo = findAll(footer!, (element) => element.classList.has('curiosity-footer-github'))[0];
    expect(repo?.getAttr('href')).toBe('https://github.com/irollab/obsidian-curiosity-dashboard');
    expect(repo?.textContent).toContain('irollab');
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

describe('promote tab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('列出待评估（无阶段）选题并提供立项按钮，已入流水线的不显示', () => {
    const root = new FakeElement();
    const promote = vi.fn(async () => undefined);
    const actions = { ...handlers(), promoteTopic: promote };
    const pending = { ...topic, path: '10-选题池/待评估/42.md', basename: '42', issue: 42, title: '待评估卡', stage: null, status: '待评估', homepageFocus: false };
    const staged = { ...topic, path: '10-选题池/已立项/40.md', basename: '40', issue: 40, title: '已规划', stage: '选题' as const, homepageFocus: false };
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ pickableTopics: [pending, staged] }),
      actions, 'promote' as DashboardTab, createTranslator('zh'),
    );

    expect(findByText(root, '待评估卡')).not.toBeUndefined();
    expect(findByText(root, '已规划')).toBeUndefined();
    const promoteBtn = findAll(root, (element) => element.classList.has('curiosity-pending-promote'))[0];
    expect(promoteBtn).not.toBeUndefined();
    promoteBtn?.click();
    expect(promote).toHaveBeenCalledWith('10-选题池/待评估/42.md');
  });

  it('无待评估卡时显示空态提示', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ pickableTopics: [] }),
      handlers(), 'promote' as DashboardTab, createTranslator('zh'),
    );

    expect(root.textContent).toContain('暂无待评估选题');
    expect(findAll(root, (element) => element.classList.has('curiosity-pending-promote'))).toHaveLength(0);
  });

  it('移动只读时立项按钮禁用', () => {
    const root = new FakeElement();
    const pending = { ...topic, path: '10-选题池/待评估/42.md', basename: '42', issue: 42, title: '待评估卡', stage: null, status: '待评估', homepageFocus: false };
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ pickableTopics: [pending], mobileReadOnly: true }),
      handlers(), 'promote' as DashboardTab, createTranslator('zh'),
    );

    const promoteBtn = findAll(root, (element) => element.classList.has('curiosity-pending-promote'))[0];
    expect((promoteBtn as unknown as { disabled: boolean }).disabled).toBe(true);
  });
});

describe('discover deck tab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('有热点时渲染条目与生成按钮', () => {
    const root = new FakeElement();
    let copied = false;
    const actions = {
      ...handlers(),
      copyDiscoveryPrompt: vi.fn(async () => {
        copied = true;
      }),
    };
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [
          {
            sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 1, error: null,
            items: [
              { title: 'HN A', url: 'https://a', source: 'Hacker News', publishedAt: null, summary: null },
            ],
          },
        ],
        audienceSignals: [{ text: '怎么用', kind: '问题', source: '评论档', weight: 1 }],
      }),
      actions, 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(findByText(root, 'HN A')).not.toBeNull();
    expect(findByText(root, '怎么用')).not.toBeNull();
    const copy = findAll(root, (element) => element.classList.has('curiosity-discover-copy'))[0];
    expect(copy).not.toBeUndefined();
    copy?.click();
    expect(copied).toBe(true);
  });

  it('无热点时渲染空态与刷新按钮', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ hotspots: [], audienceSignals: [] }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(root.textContent).toContain('还没有热点');
    expect(findByText(root, '刷新热点')).not.toBeNull();
  });

  it('失败源显示告警', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [
          { sourceId: 'weibo', label: '微博热榜', status: 'failed', fetchedAt: 1, error: 'x', items: [] },
        ],
      }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(root.textContent).toContain('抓取失败');
  });

  it('hotspotsLoading=true 时刷新按钮禁用并显示「抓取中…」', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ hotspots: [], audienceSignals: [] }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'), null, true,
    );

    const refresh = findAll(root, (element) => element.classList.has('curiosity-discover-refresh'))[0];
    expect(refresh).not.toBeUndefined();
    expect((refresh as unknown as { disabled: boolean }).disabled).toBe(true);
    expect(refresh?.textContent).toContain('抓取中');
  });

  it('有抓取时间时显示「数据时间」', () => {
    const root = new FakeElement();
    const fetchedAt = new Date(2026, 5, 26, 14, 30).getTime();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [
          {
            sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt, error: null,
            items: [{ title: 'HN A', url: 'https://a', source: 'Hacker News', publishedAt: null, summary: null }],
          },
        ],
      }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(root.textContent).toContain('数据时间');
    expect(root.textContent).toContain('06-26 14:30');
  });

  it('热点超过每页条数时分页，下一页显示剩余条目', () => {
    const root = new FakeElement();
    const items = Array.from({ length: 23 }, (_, i) => ({
      title: `H${i}`, url: `https://h/${i}`, source: 'Hacker News', publishedAt: null, summary: null,
    }));
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [{ sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 1, error: null, items }],
      }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    const col = findAll(root, (element) => element.classList.has('curiosity-discover-hotspots'))[0]!;
    expect(findAll(col, (e) => e.classList.has('curiosity-discover-row'))).toHaveLength(10);
    expect(col.textContent).toContain('第 1/3 页 · 共 23 条');

    const next = findAll(col, (e) => e.classList.has('curiosity-discover-page-btn'))
      .find((button) => button.textContent === '下一页');
    expect(next).toBeDefined();
    next?.click();

    expect(findAll(col, (e) => e.classList.has('curiosity-discover-row'))).toHaveLength(10);
    expect(col.textContent).toContain('H10');
    expect(col.textContent).toContain('第 2/3 页');
  });

  it('点击热点标题调用 openHotspot 打开原文', () => {
    const root = new FakeElement();
    const open = vi.fn();
    const actions = { ...handlers(), openHotspot: open };
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [
          {
            sourceId: 'hn', label: 'Hacker News', status: 'ok', fetchedAt: 1, error: null,
            items: [{ title: 'HN A', url: 'https://a', source: 'Hacker News', publishedAt: null, summary: null }],
          },
        ],
      }),
      actions, 'discover' as DashboardTab, createTranslator('zh'),
    );

    const link = findAll(root, (element) => element.classList.has('curiosity-discover-link'))[0];
    expect(link).toBeDefined();
    link?.click();
    expect(open).toHaveBeenCalledWith('https://a');
  });

  it('缺少发现模板时显示生成按钮并触发 seedPromptTemplates', () => {
    const root = new FakeElement();
    const seed = vi.fn(async () => undefined);
    const actions = { ...handlers(), seedPromptTemplates: seed };
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({ workflowActions: [] }),
      actions, 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(findAll(root, (e) => e.classList.has('curiosity-discover-template-missing'))).toHaveLength(1);
    const btn = findAll(root, (e) => e.classList.has('curiosity-discover-seed'))[0];
    expect(btn).toBeDefined();
    btn?.click();
    expect(seed).toHaveBeenCalled();
  });

  it('已有发现模板时不显示生成横幅', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        workflowActions: [{
          id: 'spark-topics', label: '从热点+受众生成选题卡', description: '', group: 'general',
          order: 1, needsFocus: false, output: null, body: '', sourcePath: 'p/11.md',
        }],
      }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    expect(findAll(root, (e) => e.classList.has('curiosity-discover-template-missing'))).toHaveLength(0);
  });

  it('分类过滤 chip：单击单独聚焦某来源，再点恢复全部', () => {
    const root = new FakeElement();
    new DashboardRenderer().render(
      root as unknown as HTMLElement,
      model({
        hotspots: [{
          sourceId: 'mix', label: 'Mix', status: 'ok', fetchedAt: 1, error: null,
          items: [
            { title: 'HN1', url: 'https://hn1', source: 'Hacker News', publishedAt: null, summary: null },
            { title: 'GH1', url: 'https://gh1', source: 'GitHub Trending', publishedAt: null, summary: null },
          ],
        }],
      }),
      handlers(), 'discover' as DashboardTab, createTranslator('zh'),
    );

    const col = findAll(root, (e) => e.classList.has('curiosity-discover-hotspots'))[0]!;
    // 「全部」+ Hacker News + GitHub Trending = 3 个 chip
    const chips = findAll(col, (e) => e.classList.has('curiosity-discover-filter-chip'));
    expect(chips).toHaveLength(3);
    expect(findAll(col, (e) => e.classList.has('curiosity-discover-row'))).toHaveLength(2);

    // 点 GitHub Trending → 单独聚焦它，只剩 GH1（无需逐个关其他来源）
    chips.find((c) => c.textContent === 'GitHub Trending')!.click();
    let rows = findAll(col, (e) => e.classList.has('curiosity-discover-row'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('GH1');

    // 再点 GitHub Trending → 取消聚焦，恢复全部
    chips.find((c) => c.textContent === 'GitHub Trending')!.click();
    rows = findAll(col, (e) => e.classList.has('curiosity-discover-row'));
    expect(rows).toHaveLength(2);

    // 点 GitHub 聚焦后，点「全部」chip 也能恢复
    chips.find((c) => c.textContent === 'GitHub Trending')!.click();
    chips.find((c) => c.textContent === '全部')!.click();
    rows = findAll(col, (e) => e.classList.has('curiosity-discover-row'));
    expect(rows).toHaveLength(2);
  });
});

describe('window titlebar focus meta', () => {
  // 标题栏元数据定位用 cls 而非 findByText：workflow tab 下「工作流」会先命中 tab 按钮（后序遍历）。
  const ISSUE_TEXT = '第 39 期 — Obsidian 太像文件夹，我用 Codex 重做了首页';

  it('渠道脉搏标题栏显示当前焦点选题的期数与标题', () => {
    const { root } = render(model(), 'data');
    const pulse = findAll(root, (element) => element.classList.has('curiosity-channel-pulse'))[0]!;
    const issue = findAll(pulse, (element) => element.classList.has('curiosity-window-issue'));
    expect(issue).toHaveLength(1);
    expect(issue[0]?.textContent).toBe(ISSUE_TEXT);
  });

  it('工作流标题栏显示当前焦点选题的期数与标题', () => {
    const { root } = render(model({ promptTemplatesPresent: true }), 'workflow');
    const deck = findAll(root, (element) => element.classList.has('curiosity-workflow'))[0]!;
    const issue = findAll(deck, (element) => element.classList.has('curiosity-window-issue'));
    expect(issue).toHaveLength(1);
    expect(issue[0]?.textContent).toBe(ISSUE_TEXT);
  });

  it('无焦点时渠道脉搏标题栏不渲染期数元数据', () => {
    const { root } = render(model({ focus: { kind: 'none' } }), 'data');
    const pulse = findAll(root, (element) => element.classList.has('curiosity-channel-pulse'))[0]!;
    expect(findAll(pulse, (element) => element.classList.has('curiosity-window-issue'))).toHaveLength(0);
  });
});
