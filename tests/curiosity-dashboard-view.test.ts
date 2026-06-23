import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceLeaf } from 'obsidian';

import type { DashboardModel } from '@/domain/models';
import { CuriosityDashboardView } from '@/curiosity-dashboard-view';
import { DEFAULT_SETTINGS } from '@/settings';

const obsidianMock = vi.hoisted(() => {
  class FakeElement {
    readonly children: FakeElement[] = [];
    readonly classList = new Set<string>();
    readonly dataset: Record<string, string> = {};
    readonly listeners = new Map<string, () => void>();
    text = '';
    tag = 'div';

    empty(): void {
      this.children.length = 0;
    }

    addClass(...classes: string[]): void {
      for (const item of classes) this.classList.add(item);
    }

    removeClass(...classes: string[]): void {
      for (const item of classes) this.classList.delete(item);
    }

    createDiv(options: { cls?: string; text?: string } = {}): FakeElement {
      return this.createEl('div', options);
    }

    createEl(
      tag: string,
      options: { cls?: string; text?: string; type?: string } = {},
    ): FakeElement {
      const child = new FakeElement();
      child.tag = tag;
      child.text = options.text ?? '';
      if (options.cls !== undefined) child.addClass(...options.cls.split(' '));
      this.children.push(child);
      return child;
    }

    addEventListener(name: string, listener: () => void): void {
      this.listeners.set(name, listener);
    }

    click(): void {
      this.listeners.get('click')?.();
    }
  }

  return { FakeElement, platform: { isMobile: false } };
});

vi.mock('obsidian', () => ({
  ItemView: class {
    readonly contentEl = new obsidianMock.FakeElement();
    constructor(readonly leaf: unknown) {}
  },
  Notice: class {},
  Platform: obsidianMock.platform,
  Plugin: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (path: string) => path,
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

function makeView(load: () => Promise<DashboardModel>, enableMobileView = true) {
  const plugin = {
    dataService: () => ({ load }),
    settings: { ...DEFAULT_SETTINGS, defaultTab: 'tasks' as const, enableMobileView },
  };
  return new CuriosityDashboardView(
    {} as WorkspaceLeaf,
    plugin as never,
  ) as CuriosityDashboardView & { contentEl: InstanceType<typeof obsidianMock.FakeElement> };
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
});
