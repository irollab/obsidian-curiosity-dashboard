import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceLeaf } from 'obsidian';

import type { DashboardModel } from '@/domain/models';
import { CuriosityDashboardView } from '@/curiosity-dashboard-view';
import { DEFAULT_SETTINGS } from '@/settings';

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
  const openLinkText = vi.fn(async () => undefined);
  const setting = { open: vi.fn(), openTabById: vi.fn() };
  const plugin = {
    dataService: () => ({ load }),
    manifest: { id: 'curiosity-dashboard' },
    mutationService: () => mutation,
    saveSettings,
    settings: { ...DEFAULT_SETTINGS, defaultTab: 'tasks' as const, enableMobileView },
  };
  const view = new CuriosityDashboardView(
    { app: { setting, workspace: { openLinkText } } } as unknown as WorkspaceLeaf,
    plugin as never,
  ) as CuriosityDashboardView & { contentEl: InstanceType<typeof obsidianMock.FakeElement> };
  return { mutation, openLinkText, plugin, saveSettings, setting, view };
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

    await expect(view.refresh()).resolves.toBeUndefined();
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

  it('requires confirmation before advancing and surfaces file-open failures', async () => {
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
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    await harness.view.refresh();

    findByText(harness.view.contentEl, '查看选题卡')?.click();
    await vi.waitFor(() => expect(obsidianMock.notices).toContain('无法打开文件：cannot open'));
    findByText(harness.view.contentEl, '推进阶段')?.click();
    await vi.waitFor(() => expect(harness.mutation.advanceStage).toHaveBeenCalledWith(
      '10-选题池/39.md',
      '制作',
    ));
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
