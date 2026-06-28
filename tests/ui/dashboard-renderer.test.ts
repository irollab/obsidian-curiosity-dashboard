import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn((element: { setAttr(name: string, value: string): void }, icon: string) => {
    element.setAttr('data-icon', icon);
  }),
}));

import type { DashboardModel, TopicRecord } from '@/domain/models';
import { createTranslator } from '@/i18n/translator';
import { DashboardRenderer, type DashboardHandlers, type DashboardTab } from '@/ui/dashboard-renderer';

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
    logoUrl: null,
    commentEvidence: [],
    focus: { kind: 'ready', topic: { ...topic, stage: '制作' } },
    focusCandidates: [],
    pickableTopics: [],
    metrics: [],
    mobileReadOnly: false,
    queue: [],
    reviewPath: null,
    tasks: [{ checked: false, line: 12, text: '完成首页开发验证' }],
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

// hero「下一步」清单优先后，可能与某个任务按钮同文案；定位可点击任务按钮时跳过纯文本节点（如 hero fact-value）。
function findButtonByText(root: FakeElement, text: string): FakeElement | undefined {
  return findAll(root, (element) => element.tag === 'button' && element.textContent === text)[0];
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

function render(value: DashboardModel, activeTab: DashboardTab = 'overview') {
  const root = new FakeElement();
  const actions = handlers();
  new DashboardRenderer().render(
    root as unknown as HTMLElement, value, actions, activeTab, createTranslator('zh'),
  );
  return { root, actions };
}

describe('DashboardRenderer', () => {
  it('renders a safe background and the ready Hero content without using HTML strings', () => {
    const { root } = render(model({ backgroundUrl: 'app://vault/space");color:red).png' }));
    const shell = findAll(root, (element) => element.classList.has('curiosity-dashboard-shell'))[0];

    expect(findByText(root, '追逐你的好奇心')).toBeDefined();
    expect(findByText(root, '第 39 期')).toBeDefined();
    expect(findByText(root, topic.title)).toBeDefined();
    expect(findByText(root, '制作')).toBeDefined();
    // 「下一步」清单优先：有未勾选清单项时显示清单项，而非陈旧的 next_action。
    expect(findByText(root, '完成首页开发验证')).toBeDefined();
    expect(shell?.style.getPropertyValue('--curiosity-background')).toBe(
      'url("app://vault/space%22%29;color:red%29.png")',
    );
  });

  it('derives the hero next step from the first unchecked task, falling back to next_action', () => {
    const nextStepValue = (root: FakeElement): string | undefined => {
      const card = findAll(
        root,
        (element) => element.classList.has('curiosity-fact-card') && element.classList.has('is-next'),
      )[0];
      return card === undefined
        ? undefined
        : findAll(card, (element) => element.classList.has('curiosity-fact-value'))[0]?.text;
    };

    // 有未勾选清单项：用清单首个未勾选项，忽略已完成（陈旧）的 next_action。
    const pending = render(model({
      focus: { kind: 'ready', topic: { ...topic, stage: '制作', nextAction: '创建脚本大纲与成稿' } },
      tasks: [
        { checked: true, line: 1, text: '创建脚本大纲与成稿' },
        { checked: false, line: 2, text: '录制演示并发布' },
      ],
    }));
    expect(nextStepValue(pending.root)).toBe('录制演示并发布');

    // 清单全部勾选：回退到手动 next_action。
    const done = render(model({
      focus: { kind: 'ready', topic: { ...topic, stage: '制作', nextAction: '推进阶段' } },
      tasks: [{ checked: true, line: 1, text: '录制演示并发布' }],
    }));
    expect(nextStepValue(done.root)).toBe('推进阶段');
  });

  it('opens the current script or creates one without conflating it with the topic card', () => {
    const existing = render(model());

    findByText(existing.root, '打开当前脚本')?.click();
    findByText(existing.root, '查看选题卡')?.click();
    expect(existing.actions.openPath).toHaveBeenNthCalledWith(1, topic.scriptPath);
    expect(existing.actions.openPath).toHaveBeenNthCalledWith(2, topic.path);
    expect(existing.actions.createScript).not.toHaveBeenCalled();

    const topicWithoutScript = { ...topic, scriptPath: null, stage: '制作' as const };
    const missing = render(model({
      focus: { kind: 'ready', topic: topicWithoutScript },
    }));

    expect(findByText(missing.root, '打开当前作品')).toBeUndefined();
    findByText(missing.root, '创建脚本')?.click();
    findByText(missing.root, '查看选题卡')?.click();
    expect(missing.actions.createScript).toHaveBeenCalledWith(topicWithoutScript);
    expect(missing.actions.openPath).toHaveBeenCalledOnce();
    expect(missing.actions.openPath).toHaveBeenCalledWith(topic.path);
  });

  it('disables Hero script creation in mobile read-only mode', () => {
    const topicWithoutScript = { ...topic, scriptPath: null, stage: '制作' as const };
    const { root, actions } = render(model({
      focus: { kind: 'ready', topic: topicWithoutScript },
      mobileReadOnly: true,
    }));
    const createScript = findByText(root, '创建脚本');

    expect(createScript?.disabled).toBe(true);
    expect(createScript?.getAttr('title')).toBe('移动端只读，不能创建脚本');
    expect(createScript?.getAttr('aria-label')).toBe('创建脚本（不可用：移动端只读）');
    createScript?.click();
    expect(actions.createScript).not.toHaveBeenCalled();
  });

  it('renders none, multiple, and invalid-stage focus states explicitly', () => {
    const noneActions = handlers();
    const noneRoot = new FakeElement();
    new DashboardRenderer().render(
      noneRoot as unknown as HTMLElement,
      model({ focus: { kind: 'none' }, tasks: [] }),
      noneActions,
      'overview',
      createTranslator('zh'),
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
    const tasks = tabs.find((element) => element.text === '任务');

    expect(tabs).toHaveLength(5);
    expect(tasks?.tag).toBe('button');
    expect(tasks?.type).toBe('button');
    expect(tasks?.getAttr('aria-selected')).toBe('true');
    expect(tasks?.getAttr('tabindex')).toBe('0');
    const event = tasks?.keydown('ArrowRight');
    expect(event?.defaultPrevented).toBe(true);
    expect(fakeDocument.activeElement?.text).toBe('工作流');
    expect(actions.selectTab).toHaveBeenCalledWith('workflow');
  });

  it('creates a real panel target for every tab and hides inactive panels', () => {
    const { root } = render(model(), 'tasks');
    const panels = findAll(root, (element) => element.getAttr('role') === 'tabpanel');

    expect(panels).toHaveLength(5);
    expect(panels.map((panel) => panel.getAttr('id'))).toEqual([
      'curiosity-panel-overview',
      'curiosity-panel-tasks',
      'curiosity-panel-workflow',
      'curiosity-panel-discover',
      'curiosity-panel-data',
    ]);
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true, true, true]);
    expect(findByText(panels[1]!, '任务中心')).toBeDefined();
    expect(findByText(panels[0]!, '任务中心')).toBeUndefined();
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

    findButtonByText(root, task.text)?.click();
    expect(actions.toggleTask).toHaveBeenCalledWith(topic.path, task);
    findByText(root, '脚本')?.click();
    expect(actions.openPath).toHaveBeenCalledWith(topic.scriptPath);
    const candidate = findAll(
      root,
      (element) =>
        element.classList.has('curiosity-association-candidate') && element.getAttr('title') === '20-素材库/39-b',
    )[0];
    candidate?.click();
    expect(actions.setAssociation).toHaveBeenCalledWith(
      topic.path,
      'asset_path',
      '20-素材库/39-b',
    );
  });

  it('renders each association candidate full-width on one line with the marquee track structure', () => {
    const first = '40-脚本大纲/成稿/39-A成稿.md';
    const second = '40-脚本大纲/草稿/39-A脚本大纲.md';
    const { root } = render(model({
      associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [first, second] },
    }));

    const buttons = findAll(
      root,
      (element) => element.classList.has('curiosity-association-candidate'),
    );
    expect(buttons).toHaveLength(2);
    // 完整路径保留在 title（悬浮可读）与聚合文本（点击/句柄不变）。
    expect(buttons[0]?.getAttr('title')).toBe(first);
    expect(buttons[0]?.textContent).toBe(first);
    // 跑马灯结构：button > track（裁剪窗口）> label（完整路径），复用 hero 焦点切换器样式。
    const track = buttons[0]?.children[0];
    expect(track?.classList.has('curiosity-focus-chip-track')).toBe(true);
    const label = track?.children[0];
    expect(label?.classList.has('curiosity-focus-chip-label')).toBe(true);
    expect(label?.text).toBe(first);
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
    const button = findButtonByText(root, task.text);

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
      const taskButton = findButtonByText(root, '完成首页开发验证');
      expect(taskButton?.disabled).toBe(true);
      // 移动只读时 title 被改写为只读提示，按类取首个候选按钮即可。
      const candidate = findAll(
        root,
        (element) => element.classList.has('curiosity-association-candidate'),
      )[0];
      expect(candidate?.disabled).toBe(true);
      expect(findByText(root, '移动端只读：任务、关联路径和阶段推进不可修改。')).toBeDefined();
      expect(taskButton?.getAttr('aria-describedby')).toBe(
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
    expect(findByText(root, `第 39 期 — ${topic.title}`)).toBeDefined();
  });

  it('keeps the data tab structurally valid without inventing metrics', () => {
    const { root } = render(model(), 'data');
    const panel = findAll(root, (element) => element.getAttr('role') === 'tabpanel')[0];

    expect(panel).toBeDefined();
    expect(findByText(root, '任务中心')).toBeUndefined();
    expect(findByText(root, '0')).toBeUndefined();
  });

  it('discover tab 渲染发现面板标题', () => {
    const { root } = render(model(), 'discover');
    const panel = findAll(
      root,
      (element) => element.classList.has('curiosity-tab-panel--discover'),
    )[0];

    expect(panel).not.toBeUndefined();
    expect(root.textContent).toContain('灵感发现');
  });
});
