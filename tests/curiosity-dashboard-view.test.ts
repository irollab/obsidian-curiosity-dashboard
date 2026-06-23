import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceLeaf } from 'obsidian';

import type { DashboardModel } from '@/domain/models';
import { CuriosityDashboardView } from '@/curiosity-dashboard-view';
import { TemplateNotFoundError } from '@/mutations/template-creation-service';
import { DEFAULT_SETTINGS } from '@/settings';

const modalMock = vi.hoisted(() => ({
  confirmAsk: vi.fn<(app: unknown, stage: unknown) => Promise<boolean>>(async () => false),
  createAsk: vi.fn<(app: unknown, defaults: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock('@/ui/confirm-stage-modal', () => ({
  ConfirmStageModal: { ask: modalMock.confirmAsk },
}));

vi.mock('@/ui/create-file-modal', () => ({
  CreateFileModal: { ask: modalMock.createAsk },
}));

const obsidianMock = vi.hoisted(() => {
  let activeElement: FakeElement | null = null;

  class FakeStyle {
    readonly properties = new Map<string, string>();

    setProperty(name: string, value: string): void {
      this.properties.set(name, value);
    }
  }

  class FakeElement {
    readonly children: FakeElement[] = [];
    readonly classList = new Set<string>();
    readonly dataset: Record<string, string> = {};
    readonly attributes = new Map<string, string>();
    readonly listeners = new Map<string, Array<(event: { key: string; preventDefault(): void }) => void>>();
    readonly style = new FakeStyle();
    disabled = false;
    hidden = false;
    isConnected = true;
    parent: FakeElement | null = null;
    text = '';
    tag = 'div';
    type = '';

    set innerHTML(_value: string) {
      throw new Error('Unsafe innerHTML was used');
    }

    empty(): void {
      for (const child of this.children) child.disconnect();
      this.children.length = 0;
    }

    addClass(...classes: string[]): void {
      for (const item of classes) this.classList.add(item);
    }

    removeClass(...classes: string[]): void {
      for (const item of classes) this.classList.delete(item);
    }

    createDiv(options: ElementOptions = {}): FakeElement {
      return this.createEl('div', options);
    }

    createSpan(options: ElementOptions = {}): FakeElement {
      return this.createEl('span', options);
    }

    createEl(tag: string, options: ElementOptions = {}): FakeElement {
      const child = new FakeElement();
      child.tag = tag;
      child.text = options.text ?? '';
      child.type = options.type ?? '';
      child.parent = this;
      child.isConnected = this.isConnected;
      if (options.cls !== undefined) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
      for (const [name, value] of Object.entries(options.attr ?? {})) child.setAttr(name, value);
      this.children.push(child);
      return child;
    }

    setAttr(name: string, value: string): void {
      this.attributes.set(name, value);
    }

    getAttr(name: string): string | null {
      return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string): void {
      this.attributes.delete(name);
    }

    addEventListener(
      name: string,
      listener: (event: { key: string; preventDefault(): void }) => void,
    ): void {
      const listeners = this.listeners.get(name) ?? [];
      listeners.push(listener);
      this.listeners.set(name, listeners);
    }

    click(): void {
      if (this.disabled) return;
      this.focus();
      const event = { key: '', preventDefault: () => undefined };
      for (const listener of this.listeners.get('click') ?? []) listener(event);
    }

    keydown(key: string): { key: string; preventDefault(): void } {
      const event = { key, preventDefault: vi.fn() };
      for (const listener of this.listeners.get('keydown') ?? []) listener(event);
      return event;
    }

    focus(): void {
      if (this.isConnected) activeElement = this;
    }

    private disconnect(): void {
      this.isConnected = false;
      for (const child of this.children) child.disconnect();
    }
  }

  interface ElementOptions {
    attr?: Record<string, string>;
    cls?: string;
    text?: string;
    type?: string;
  }

  return {
    FakeElement,
    getActiveElement: () => activeElement,
    notices: [] as string[],
    platform: { isMobile: false },
    resetFocus: () => { activeElement = null; },
  };
});

vi.mock('obsidian', () => ({
  ItemView: class {
    readonly contentEl = new obsidianMock.FakeElement();
    readonly app: unknown;
    constructor(readonly leaf: { app?: unknown }) {
      this.app = leaf.app;
    }
  },
  Notice: class {
    constructor(message: string) {
      obsidianMock.notices.push(message);
    }
  },
  Platform: obsidianMock.platform,
  Plugin: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (path: string) => path,
  setIcon: (element: { setAttr(name: string, value: string): void }, icon: string) => {
    element.setAttr('data-icon', icon);
  },
}));

const model: DashboardModel = {
  associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [] },
  backgroundUrl: null,
  commentEvidence: [],
  focus: { kind: 'none' },
  metrics: [],
  mobileReadOnly: false,
  queue: [],
  reviewPath: null,
  tasks: [],
  thisWeek: [],
};

function makeHarness(load: () => Promise<DashboardModel>, enableMobileView = true) {
  const mutation = {
    advanceStage: vi.fn(async () => '发布' as const),
    setAssociationPath: vi.fn(async () => undefined),
    toggleTask: vi.fn(async () => undefined),
  };
  const saveSettings = vi.fn<() => Promise<void>>(async () => undefined);
  const templateCreate = vi.fn<
    (request: { targetPath: string }) => Promise<string>
  >(async (request) => request.targetPath.replaceAll('\\', '/'));
  const openLinkText = vi.fn(async () => undefined);
  const setting = { open: vi.fn(), openTabById: vi.fn() };
  const plugin = {
    dataService: () => ({ load }),
    manifest: { id: 'curiosity-dashboard' },
    mutationService: () => mutation,
    saveSettings,
    settings: { ...DEFAULT_SETTINGS, defaultTab: 'tasks' as const, enableMobileView },
    templateService: () => ({ create: templateCreate }),
    updateObservedDataPaths: vi.fn(),
  };
  const view = new CuriosityDashboardView(
    { app: { setting, workspace: { openLinkText } } } as unknown as WorkspaceLeaf,
    plugin as never,
  ) as CuriosityDashboardView & { contentEl: InstanceType<typeof obsidianMock.FakeElement> };
  return { mutation, openLinkText, plugin, saveSettings, setting, templateCreate, view };
}

function makeView(load: () => Promise<DashboardModel>, enableMobileView = true) {
  return makeHarness(load, enableMobileView).view;
}

function findByText(
  root: InstanceType<typeof obsidianMock.FakeElement>,
  text: string,
): InstanceType<typeof obsidianMock.FakeElement> | undefined {
  if (root.text === text) return root;
  for (const child of root.children) {
    const match = findByText(child, text);
    if (match !== undefined) return match;
  }
  return undefined;
}

describe('CuriosityDashboardView', () => {
  beforeEach(() => {
    obsidianMock.platform.isMobile = false;
    obsidianMock.notices.length = 0;
    obsidianMock.resetFocus();
    vi.unstubAllGlobals();
    modalMock.confirmAsk.mockReset().mockResolvedValue(false);
    modalMock.createAsk.mockReset().mockResolvedValue(null);
  });

  it('publishes current explicit review paths after a successful model render', async () => {
    const focused: DashboardModel = {
      ...model,
      focus: {
        kind: 'ready',
        topic: {
          assetPath: null,
          basename: '39',
          dueDate: null,
          homepageFocus: true,
          issue: 39,
          nextAction: null,
          path: '10-选题池/39.md',
          priority: null,
          reviewPath: 'archive\\explicit.md',
          scriptPath: null,
          stage: '制作',
          status: '已立项',
          title: 'Focus',
        },
      },
      reviewPath: null,
    };
    const harness = makeHarness(async () => focused);

    await harness.view.refresh();

    expect(harness.plugin.updateObservedDataPaths).toHaveBeenCalledWith([
      'archive\\explicit.md',
    ]);
  });

  it('renders loading before replacing it with the loaded shell', async () => {
    let resolve!: (value: DashboardModel) => void;
    const pending = new Promise<DashboardModel>((done) => {
      resolve = done;
    });
    const view = makeView(() => pending);

    const refresh = view.refresh();
    expect(findByText(view.contentEl, '正在加载 Curiosity Dashboard')).toBeDefined();
    resolve(model);
    await refresh;

    expect(findByText(view.contentEl, 'Chase your curiosity')).toBeDefined();
    expect(view.contentEl.children[0]?.dataset.activeTab).toBe('tasks');
    expect(obsidianMock.getActiveElement()).toBeNull();
  });

  it('renders a readable failure and retries safely', async () => {
    const load = vi
      .fn<() => Promise<DashboardModel>>()
      .mockRejectedValueOnce(new Error('Vault unavailable'))
      .mockResolvedValue(model);
    const view = makeView(load);

    await expect(view.refresh()).resolves.toMatchObject({ status: 'error' });
    expect(findByText(view.contentEl, 'Vault unavailable')).toBeDefined();

    findByText(view.contentEl, '重试')?.click();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(findByText(view.contentEl, 'Chase your curiosity')).toBeDefined());
  });

  it('does not load data when mobile view is disabled', async () => {
    obsidianMock.platform.isMobile = true;
    const load = vi.fn(async () => model);
    const view = makeView(load, false);

    await view.refresh();

    expect(load).not.toHaveBeenCalled();
    expect(findByText(view.contentEl, '移动端视图已关闭')).toBeDefined();
  });

  it('clears content and prevents pending work from rendering after close', async () => {
    let resolve!: (value: DashboardModel) => void;
    const pending = new Promise<DashboardModel>((done) => {
      resolve = done;
    });
    const view = makeView(() => pending);
    const refresh = view.refresh();

    await view.onClose();
    resolve(model);
    await refresh;

    expect(view.contentEl.children).toHaveLength(0);
  });

  it('persists a selected tab and refreshes the rendered model', async () => {
    const load = vi.fn(async () => model);
    const { plugin, saveSettings, view } = makeHarness(load);
    await view.refresh();

    findByText(view.contentEl, 'Overview')?.click();
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledOnce());

    expect(plugin.settings.defaultTab).toBe('overview');
    expect(view.contentEl.children[0]?.dataset.activeTab).toBe('overview');
    expect(load).toHaveBeenCalledOnce();
    expect(obsidianMock.getActiveElement()?.text).toBe('Overview');
  });

  it('keeps keyboard focus on the newly rendered active tab', async () => {
    const load = vi.fn(async () => model);
    const { saveSettings, view } = makeHarness(load);
    await view.refresh();

    const event = findByText(view.contentEl, 'Tasks')?.keydown('ArrowRight');
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledOnce());

    expect(event?.preventDefault).toHaveBeenCalledOnce();
    expect(view.contentEl.children[0]?.dataset.activeTab).toBe('data');
    expect(obsidianMock.getActiveElement()?.text).toBe('Data');
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not save or rerender when the active tab is selected again', async () => {
    const load = vi.fn(async () => model);
    const { saveSettings, view } = makeHarness(load);
    await view.refresh();
    const shell = view.contentEl.children[0];

    findByText(view.contentEl, 'Tasks')?.click();
    await Promise.resolve();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(view.contentEl.children[0]).toBe(shell);
    expect(load).toHaveBeenCalledOnce();
  });

  it('keeps the newer tab when an older save fails and the newer save succeeds', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const load = vi.fn(async () => model);
    const harness = makeHarness(load);
    harness.saveSettings
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Overview')?.click();
    findByText(harness.view.contentEl, 'Data')?.click();
    first.reject(new Error('first failed'));
    second.resolve();
    await vi.waitFor(() => expect(harness.saveSettings).toHaveBeenCalledTimes(2));
    await Promise.allSettled([first.promise, second.promise]);
    await vi.waitFor(() => expect(harness.view.contentEl.children[0]?.dataset.activeTab).toBe('data'));

    expect(harness.plugin.settings.defaultTab).toBe('data');
    expect(load).toHaveBeenCalledOnce();
  });

  it('rolls the latest failed tab back to the last successfully persisted tab', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const load = vi.fn(async () => model);
    const harness = makeHarness(load);
    harness.saveSettings
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Overview')?.click();
    findByText(harness.view.contentEl, 'Data')?.click();
    first.resolve();
    await first.promise;
    second.reject(new Error('second failed'));
    await Promise.allSettled([second.promise]);
    await vi.waitFor(() => expect(harness.view.contentEl.children[0]?.dataset.activeTab).toBe('overview'));

    expect(harness.plugin.settings.defaultTab).toBe('overview');
    expect(obsidianMock.getActiveElement()?.text).toBe('Overview');
    expect(load).toHaveBeenCalledOnce();
  });

  it('passes a full task snapshot to the mutation and reports mutation errors with Notice', async () => {
    const task = { checked: false, line: 9, text: '验证交互' };
    const readyModel: DashboardModel = {
      ...model,
      focus: {
        kind: 'ready',
        topic: {
          path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
          status: '已立项', stage: '制作', priority: null, dueDate: null,
          nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
          reviewPath: null,
        },
      },
      tasks: [task],
    };
    const harness = makeHarness(async () => readyModel);
    harness.mutation.toggleTask.mockRejectedValueOnce(new Error('Task changed; refresh and try again'));
    await harness.view.refresh();

    findByText(harness.view.contentEl, task.text)?.click();
    await vi.waitFor(() => expect(harness.mutation.toggleTask).toHaveBeenCalledWith('10-选题池/39.md', task));
    await vi.waitFor(() => expect(obsidianMock.notices).toContain(
      '无法更新任务：Task changed; refresh and try again',
    ));
  });

  it('uses the native confirmation modal before advancing and surfaces file-open failures', async () => {
    const readyModel: DashboardModel = {
      ...model,
      focus: {
        kind: 'ready',
        topic: {
          path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
          status: '已立项', stage: '制作', priority: null, dueDate: null,
          nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
          reviewPath: null,
        },
      },
    };
    const harness = makeHarness(async () => readyModel);
    harness.openLinkText.mockRejectedValueOnce(new Error('cannot open'));
    modalMock.confirmAsk.mockResolvedValueOnce(true);
    await harness.view.refresh();

    findByText(harness.view.contentEl, '查看选题卡')?.click();
    await vi.waitFor(() => expect(obsidianMock.notices).toContain('无法打开文件：cannot open'));
    findByText(harness.view.contentEl, '推进阶段')?.click();
    await vi.waitFor(() => expect(modalMock.confirmAsk).toHaveBeenCalledWith(
      expect.anything(),
      '制作',
    ));
    await vi.waitFor(() => expect(harness.mutation.advanceStage).toHaveBeenCalledWith(
      '10-选题池/39.md',
      '制作',
    ));
  });

  it('derives the next topic issue from the largest topic visible in the loaded model', async () => {
    const topic = {
      path: '10-选题池/42.md', basename: '42', title: 'Queue', issue: 42,
      status: '已立项', stage: '策划' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: false, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = {
      ...model,
      queue: [topic],
      thisWeek: [{ ...topic, issue: 44, path: '10-选题池/44.md' }],
    };
    const harness = makeHarness(async () => value);
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Ideas')?.parent?.click();
    await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledOnce());
    const defaults = modalMock.createAsk.mock.calls[0]?.[1] as {
      issue: number; targetPath: string; targetPathFor(issue: number, title: string): string;
      templatePath: string; title: string;
    };
    expect(defaults).toMatchObject({
      issue: 45,
      targetPath: '10-选题池/45-新选题.md',
      templatePath: DEFAULT_SETTINGS.topicTemplate,
      title: '新选题',
    });
    expect(defaults.targetPathFor(46, 'A:B')).toBe('10-选题池/46-A-B.md');
  });

  it.each(['ready', 'invalid-stage'] as const)(
    'creates and associates script/review for a %s focus topic, then opens and refreshes',
    async (kind) => {
      const topic = {
        path: '10-选题池/39.md', basename: '39', title: '首页:A', issue: 39,
        status: '已立项', stage: kind === 'ready' ? '制作' as const : null,
        priority: null, dueDate: null, nextAction: null, homepageFocus: true,
        scriptPath: null, assetPath: null, reviewPath: null,
      };
      const value: DashboardModel = {
        ...model,
        focus: kind === 'ready'
          ? { kind, topic: { ...topic, stage: '制作' } }
          : { kind, topic: { ...topic, stage: null } },
      };
      const load = vi.fn(async () => value);
      const harness = makeHarness(load);
      const scriptRequest = {
        issue: 39,
        targetPath: '40-脚本大纲/39-首页-A成稿.md',
        templatePath: DEFAULT_SETTINGS.scriptTemplate,
        title: '首页:A',
      };
      const reviewRequest = {
        issue: 39,
        targetPath: '60-发布复盘/第39期-首页-A-综合复盘.md',
        templatePath: DEFAULT_SETTINGS.reviewTemplate,
        title: '首页:A',
      };
      modalMock.createAsk
        .mockResolvedValueOnce(scriptRequest)
        .mockResolvedValueOnce(reviewRequest);
      await harness.view.refresh();

      findByText(harness.view.contentEl, 'Script')?.parent?.click();
      await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledTimes(1));
      expect(modalMock.createAsk.mock.calls[0]?.[1]).toMatchObject({
        issue: 39,
        targetPath: '40-脚本大纲/39-首页-A成稿.md',
        title: '首页:A',
      });
      await vi.waitFor(() => expect(harness.templateCreate).toHaveBeenCalledWith(scriptRequest));
      await vi.waitFor(() => expect(harness.mutation.setAssociationPath).toHaveBeenCalledWith(
        topic.path,
        'script_path',
        scriptRequest.targetPath,
        { requireHomepageFocus: true },
      ));
      await vi.waitFor(() => expect(harness.openLinkText).toHaveBeenCalledWith(
        scriptRequest.targetPath,
        '',
        false,
      ));

      await vi.waitFor(() => expect(findByText(harness.view.contentEl, 'Review')).toBeDefined());
      findByText(harness.view.contentEl, 'Review')?.parent?.click();
      await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledTimes(2));
      expect(modalMock.createAsk.mock.calls[1]?.[1]).toMatchObject({
        issue: 39,
        targetPath: '60-发布复盘/第39期-首页-A-综合复盘.md',
        title: '首页:A',
      });
      await vi.waitFor(() => expect(harness.templateCreate).toHaveBeenCalledWith(reviewRequest));
      await vi.waitFor(() => expect(harness.mutation.setAssociationPath).toHaveBeenCalledWith(
        topic.path,
        'review_path',
        reviewRequest.targetPath,
        { requireHomepageFocus: true },
      ));
      await vi.waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(3));
      expect(obsidianMock.notices).toEqual([]);
    },
  );

  it('distinguishes create, association, open, and refresh failures after creation', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = { ...model, focus: { kind: 'ready', topic } };
    const request = {
      issue: 39, targetPath: '40-脚本大纲/39-首页成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate, title: '首页',
    };

    const createFailure = makeHarness(async () => value);
    modalMock.createAsk.mockResolvedValueOnce(request);
    createFailure.templateCreate.mockRejectedValueOnce(new Error('target exists'));
    await createFailure.view.refresh();
    findByText(createFailure.view.contentEl, 'Script')?.parent?.click();
    await vi.waitFor(() => expect(obsidianMock.notices).toContain('创建失败：target exists'));
    expect(createFailure.mutation.setAssociationPath).not.toHaveBeenCalled();
    expect(createFailure.openLinkText).not.toHaveBeenCalled();

    obsidianMock.notices.length = 0;
    const partial = makeHarness(async () => value);
    modalMock.createAsk.mockResolvedValueOnce(request);
    partial.mutation.setAssociationPath.mockRejectedValueOnce(new Error('concurrent association'));
    partial.openLinkText.mockRejectedValueOnce(new Error('open failed'));
    await partial.view.refresh();
    findByText(partial.view.contentEl, 'Script')?.parent?.click();
    await vi.waitFor(() => expect(obsidianMock.notices.some((message) =>
      message.includes('文件已创建，但关联失败') && message.includes('无法打开'))).toBe(true));
  });

  it('does not write on modal cancellation and runs only one creation for a double click', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const harness = makeHarness(async () => ({
      ...model,
      focus: { kind: 'ready', topic },
    }));
    await harness.view.refresh();

    const cancelledScript = findByText(harness.view.contentEl, 'Script')?.parent;
    cancelledScript?.click();
    await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledOnce());
    expect(harness.templateCreate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cancelledScript?.disabled).toBe(false));

    modalMock.createAsk.mockClear().mockResolvedValueOnce({
      issue: 39,
      targetPath: '60-发布复盘/第39期-首页-综合复盘.md',
      templatePath: DEFAULT_SETTINGS.reviewTemplate,
      title: '首页',
    });
    let finishCreate!: () => void;
    harness.templateCreate.mockImplementationOnce(() => new Promise<string>((resolve) => {
      finishCreate = () => resolve('60-发布复盘/第39期-首页-综合复盘.md');
    }));
    const review = findByText(harness.view.contentEl, 'Review')?.parent;
    review?.click();
    review?.click();
    await vi.waitFor(() => expect(harness.templateCreate).toHaveBeenCalledOnce());
    expect(modalMock.createAsk).toHaveBeenCalledOnce();
    expect(review?.disabled).toBe(true);
    finishCreate();
    await vi.waitFor(() => expect(harness.mutation.setAssociationPath).toHaveBeenCalledOnce());
  });

  it('reports refresh failure as partial success without undoing creation', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = { ...model, focus: { kind: 'ready', topic } };
    const load = vi.fn<() => Promise<DashboardModel>>()
      .mockResolvedValueOnce(value)
      .mockResolvedValueOnce(value)
      .mockRejectedValueOnce(new Error('refresh failed'));
    const harness = makeHarness(load);
    const request = {
      issue: 39,
      targetPath: '40-脚本大纲/39-首页成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '首页',
    };
    modalMock.createAsk.mockResolvedValueOnce(request);
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();

    await vi.waitFor(() => expect(obsidianMock.notices).toContain(
      '文件已创建并关联，但无法刷新 Dashboard：refresh failed',
    ));
    expect(harness.templateCreate).toHaveBeenCalledOnce();
    expect(harness.openLinkText).toHaveBeenCalledOnce();
    expect(findByText(harness.view.contentEl, 'Dashboard 加载失败')).toBeDefined();
  });

  it('uses the normalized created path for association and opening', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = { ...model, focus: { kind: 'ready', topic } };
    const harness = makeHarness(async () => value);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 39,
      targetPath: '40-脚本大纲\\39-首页成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '首页',
    });
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();

    await vi.waitFor(() => expect(harness.mutation.setAssociationPath).toHaveBeenCalledWith(
      topic.path,
      'script_path',
      '40-脚本大纲/39-首页成稿.md',
      { requireHomepageFocus: true },
    ));
    expect(harness.openLinkText).toHaveBeenCalledWith(
      '40-脚本大纲/39-首页成稿.md',
      '',
      false,
    );
  });

  it('keeps the created file unassociated when authoritative focus changes after creation', async () => {
    const oldTopic = {
      path: '10-选题池/39.md', basename: '39', title: '旧作品', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const newTopic = { ...oldTopic, path: '10-选题池/40.md', basename: '40', issue: 40, title: '新作品' };
    const oldModel: DashboardModel = { ...model, focus: { kind: 'ready', topic: oldTopic } };
    const newModel: DashboardModel = { ...model, focus: { kind: 'ready', topic: newTopic } };
    const load = vi.fn<() => Promise<DashboardModel>>()
      .mockResolvedValueOnce(oldModel)
      .mockResolvedValueOnce(newModel)
      .mockResolvedValueOnce(newModel);
    const harness = makeHarness(load);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 39,
      targetPath: '40-脚本大纲/39-旧作品成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '旧作品',
    });
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();

    await vi.waitFor(() => expect(obsidianMock.notices.some((notice) =>
      notice.includes('文件已创建') && notice.includes('当前作品已变化，文件未关联'))).toBe(true));
    expect(harness.mutation.setAssociationPath).not.toHaveBeenCalled();
    expect(harness.openLinkText).toHaveBeenCalledWith(
      '40-脚本大纲/39-旧作品成稿.md',
      '',
      false,
    );
  });

  it('treats an authoritative focus read failure as partial success and still opens the file', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = { ...model, focus: { kind: 'ready', topic } };
    const load = vi.fn<() => Promise<DashboardModel>>()
      .mockResolvedValueOnce(value)
      .mockRejectedValueOnce(new Error('vault changed'))
      .mockResolvedValueOnce(value);
    const harness = makeHarness(load);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 39,
      targetPath: '40-脚本大纲/39-首页成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '首页',
    });
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();

    await vi.waitFor(() => expect(obsidianMock.notices.some((notice) =>
      notice.includes('无法核对当前作品：vault changed') && notice.includes('文件已创建'))).toBe(true));
    expect(harness.mutation.setAssociationPath).not.toHaveBeenCalled();
    expect(harness.openLinkText).toHaveBeenCalledOnce();
  });

  it('opens settings for a typed missing-template failure without creating a shell file', async () => {
    const harness = makeHarness(async () => model);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 1,
      targetPath: '10-选题池/1-新选题.md',
      templatePath: 'missing.md',
      title: '新选题',
    });
    harness.templateCreate.mockRejectedValueOnce(new TemplateNotFoundError('missing.md'));
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Ideas')?.parent?.click();

    await vi.waitFor(() => expect(harness.setting.open).toHaveBeenCalledOnce());
    expect(harness.setting.openTabById).toHaveBeenCalledWith('curiosity-dashboard');
    expect(obsidianMock.notices).toContain('创建失败：模板不存在：missing.md。已打开插件设置。');
    expect(harness.openLinkText).not.toHaveBeenCalled();
  });

  it('reports one accurate fallback when missing-template settings cannot be opened', async () => {
    const harness = makeHarness(async () => model);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 1,
      targetPath: '10-选题池/1-新选题.md',
      templatePath: 'missing.md',
      title: '新选题',
    });
    harness.templateCreate.mockRejectedValueOnce(new TemplateNotFoundError('missing.md'));
    harness.setting.open = undefined as never;
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Ideas')?.parent?.click();

    await vi.waitFor(() => expect(obsidianMock.notices).toEqual([
      '创建失败：模板缺失且无法自动打开，请手动打开设置：missing.md。',
    ]));
    expect(harness.setting.openTabById).not.toHaveBeenCalled();
    expect(harness.openLinkText).not.toHaveBeenCalled();
  });

  it('defensively rejects creation when the last rendered model is mobile read-only', async () => {
    const mobileModel = { ...model, mobileReadOnly: true };
    const harness = makeHarness(async () => mobileModel);
    await harness.view.refresh();

    await (harness.view as unknown as {
      openCreate(kind: 'topic', topic: null): Promise<void>;
    }).openCreate('topic', null);

    expect(modalMock.createAsk).not.toHaveBeenCalled();
    expect(harness.templateCreate).not.toHaveBeenCalled();
    expect(obsidianMock.notices).toContain('移动端只读，不能修改文件。');
  });

  it('blocks every write handler when the runtime platform becomes mobile', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const harness = makeHarness(async () => ({ ...model, focus: { kind: 'ready', topic } }));
    await harness.view.refresh();
    obsidianMock.platform.isMobile = true;
    const actions = harness.view as unknown as {
      toggleTask(path: string, task: { line: number; text: string; checked: boolean }): Promise<void>;
      confirmAdvance(path: string, stage: '制作'): Promise<void>;
      setAssociation(path: string, field: 'script_path', value: string): Promise<void>;
      openCreate(kind: 'topic', topic: null): Promise<void>;
    };

    await actions.toggleTask(topic.path, { line: 1, text: 'task', checked: false });
    await actions.confirmAdvance(topic.path, '制作');
    await actions.setAssociation(topic.path, 'script_path', 'script.md');
    await actions.openCreate('topic', null);

    expect(harness.mutation.toggleTask).not.toHaveBeenCalled();
    expect(harness.mutation.advanceStage).not.toHaveBeenCalled();
    expect(harness.mutation.setAssociationPath).not.toHaveBeenCalled();
    expect(modalMock.confirmAsk).not.toHaveBeenCalled();
    expect(modalMock.createAsk).not.toHaveBeenCalled();
    expect(obsidianMock.notices.filter((notice) => notice === '移动端只读，不能修改文件。')).toHaveLength(4);
  });

  it('uses homepage-focus CAS for a desktop association candidate', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const candidate = '40-脚本大纲/39-首页成稿.md';
    const harness = makeHarness(async () => ({
      ...model,
      associationCandidates: {
        assetPath: [],
        reviewPath: [],
        scriptPath: [candidate, '40-脚本大纲/39-备选.md'],
      },
      focus: { kind: 'ready', topic },
    }));
    await harness.view.refresh();

    findByText(harness.view.contentEl, candidate)?.click();

    await vi.waitFor(() => expect(harness.mutation.setAssociationPath).toHaveBeenCalledWith(
      topic.path,
      'script_path',
      candidate,
      { requireHomepageFocus: true },
    ));
  });

  it('retries a successful post-create refresh until the current focus is visible', async () => {
    const topic = {
      path: '10-选题池/39.md', basename: '39', title: '首页', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const value: DashboardModel = { ...model, focus: { kind: 'ready', topic } };
    const transientEmpty: DashboardModel = { ...model, focus: { kind: 'none' } };
    const load = vi.fn<() => Promise<DashboardModel>>()
      .mockResolvedValueOnce(value)
      .mockResolvedValueOnce(value)
      .mockResolvedValueOnce(transientEmpty)
      .mockResolvedValueOnce(value);
    const harness = makeHarness(load);
    modalMock.createAsk.mockResolvedValueOnce({
      issue: 39,
      targetPath: '40-脚本大纲/39-首页成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '首页',
    });
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(4));

    expect(obsidianMock.notices).toEqual([]);
    expect(findByText(harness.view.contentEl, 'Chase your curiosity')).toBeDefined();
    expect(findByText(harness.view.contentEl, '尚未设置当前作品。')).toBeUndefined();
  });

  it('coalesces Quick Actions and Dock creation into one modal and allows retry after settlement', async () => {
    const harness = makeHarness(async () => model);
    await harness.view.refresh();
    findByText(harness.view.contentEl, 'Overview')?.click();
    await vi.waitFor(() => expect(harness.view.contentEl.children[0]?.dataset.activeTab).toBe('overview'));
    let closeModal!: (value: unknown) => void;
    modalMock.createAsk.mockImplementationOnce(() => new Promise((resolve) => { closeModal = resolve; }));

    findByText(harness.view.contentEl, '创建选题卡')?.click();
    findByText(harness.view.contentEl, 'Ideas')?.parent?.click();
    await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledOnce());
    closeModal(null);
    await Promise.resolve();
    await Promise.resolve();

    findByText(harness.view.contentEl, 'Ideas')?.parent?.click();
    await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledTimes(2));
  });

  it('rejects script/review creation unless the supplied topic is the current loaded focus', async () => {
    const staleTopic = {
      path: '10-选题池/39.md', basename: '39', title: '旧作品', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const harness = makeHarness(async () => model);
    await harness.view.refresh();

    await (harness.view as unknown as {
      openCreate(kind: 'script', topic: typeof staleTopic): Promise<void>;
    }).openCreate('script', staleTopic);

    expect(modalMock.createAsk).not.toHaveBeenCalled();
    expect(obsidianMock.notices).toContain('当前作品已变化，不能创建关联文件。');
  });

  it('aborts before writing when the focus changes while the create modal is open', async () => {
    const oldTopic = {
      path: '10-选题池/39.md', basename: '39', title: '旧作品', issue: 39,
      status: '已立项', stage: '制作' as const, priority: null, dueDate: null,
      nextAction: null, homepageFocus: true, scriptPath: null, assetPath: null,
      reviewPath: null,
    };
    const newTopic = { ...oldTopic, path: '10-选题池/40.md', basename: '40', issue: 40, title: '新作品' };
    let current: DashboardModel = { ...model, focus: { kind: 'ready', topic: oldTopic } };
    const harness = makeHarness(async () => current);
    let confirm!: (request: unknown) => void;
    modalMock.createAsk.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    await harness.view.refresh();

    findByText(harness.view.contentEl, 'Script')?.parent?.click();
    await vi.waitFor(() => expect(modalMock.createAsk).toHaveBeenCalledOnce());
    current = { ...model, focus: { kind: 'ready', topic: newTopic } };
    await harness.view.refresh();
    confirm({
      issue: 39,
      targetPath: '40-脚本大纲/39-旧作品成稿.md',
      templatePath: DEFAULT_SETTINGS.scriptTemplate,
      title: '旧作品',
    });

    await vi.waitFor(() => expect(obsidianMock.notices).toContain(
      '当前作品已变化，已取消创建。',
    ));
    expect(harness.templateCreate).not.toHaveBeenCalled();
  });

  it.each(['open', 'openTabById'] as const)(
    'reports an incomplete Obsidian setting capability when %s is unavailable',
    async (method) => {
      const harness = makeHarness(async () => model);
      (harness.setting as Record<string, unknown>)[method] = undefined;
      await harness.view.refresh();

      findByText(harness.view.contentEl, '打开插件设置')?.click();

      expect(obsidianMock.notices).toContain(
        '无法打开插件设置：当前 Obsidian 版本未提供设置入口',
      );
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
