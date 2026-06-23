import { beforeEach, describe, expect, it, vi } from 'vitest';

const obsidianMock = vi.hoisted(() => {
  class Element {
    readonly children: Element[] = [];
    text = '';

    createEl(_tag: string, options: { attr?: Record<string, string>; cls?: string; text?: string } = {}) {
      const child = new Element();
      child.text = options.text ?? '';
      this.children.push(child);
      return child;
    }

    empty(): void {
      this.children.length = 0;
    }

    setText(value: string): void {
      this.text = value;
    }
  }

  class TextComponent {
    value = '';
    private change: (value: string) => void = () => undefined;

    setValue(value: string): this {
      this.value = value;
      return this;
    }

    onChange(change: (value: string) => void): this {
      this.change = change;
      return this;
    }

    trigger(value: string): void {
      this.value = value;
      this.change(value);
    }
  }

  class ButtonComponent {
    disabled = false;
    text = '';
    private click: () => void = () => undefined;

    setButtonText(value: string): this {
      this.text = value;
      return this;
    }

    setCta(): this {
      return this;
    }

    setDisabled(value: boolean): this {
      this.disabled = value;
      return this;
    }

    onClick(click: () => void): this {
      this.click = click;
      return this;
    }

    trigger(): void {
      if (!this.disabled) this.click();
    }
  }

  class Setting {
    name = '';
    readonly buttons: ButtonComponent[] = [];
    readonly texts: TextComponent[] = [];

    constructor(_container: Element) {
      state.settings.push(this);
    }

    setName(value: string): this {
      this.name = value;
      return this;
    }

    addText(build: (text: TextComponent) => void): this {
      const text = new TextComponent();
      this.texts.push(text);
      build(text);
      return this;
    }

    addButton(build: (button: ButtonComponent) => void): this {
      const button = new ButtonComponent();
      this.buttons.push(button);
      build(button);
      return this;
    }
  }

  class Modal {
    readonly contentEl = new Element();

    constructor(readonly app: unknown) {}

    open(): void {
      state.lastModal = this;
      (this as unknown as { onOpen(): void }).onOpen();
    }

    close(): void {
      (this as unknown as { onClose(): void }).onClose();
    }
  }

  const state = {
    lastModal: null as Modal | null,
    settings: [] as Setting[],
  };
  return { ButtonComponent, Element, Modal, Setting, TextComponent, state };
});

vi.mock('obsidian', () => ({
  Modal: obsidianMock.Modal,
  Setting: obsidianMock.Setting,
}));

import { CreateFileModal } from '@/ui/create-file-modal';
import { ConfirmStageModal } from '@/ui/confirm-stage-modal';

function setting(name: string): InstanceType<typeof obsidianMock.Setting> {
  const match = obsidianMock.state.settings.find((candidate) => candidate.name === name);
  if (match === undefined) throw new Error(`Missing setting: ${name}`);
  return match;
}

function button(text: string): InstanceType<typeof obsidianMock.ButtonComponent> {
  const match = obsidianMock.state.settings
    .flatMap((candidate) => candidate.buttons)
    .find((candidate) => candidate.text === text);
  if (match === undefined) throw new Error(`Missing button: ${text}`);
  return match;
}

function createDefaults() {
  return {
    heading: '创建脚本',
    issue: 39,
    targetPath: '40-脚本大纲/39-首页成稿.md',
    targetPathFor: (issue: number, title: string) =>
      `40-脚本大纲/${issue}-${title.replaceAll(':', '-')}成稿.md`,
    templatePath: '99-模板/脚本.md',
    title: '首页',
  };
}

describe('ConfirmStageModal', () => {
  beforeEach(() => {
    obsidianMock.state.lastModal = null;
    obsidianMock.state.settings.length = 0;
  });

  it('shows the exact transition and resolves true only once on repeated confirmation', async () => {
    const result = ConfirmStageModal.ask({} as never, '制作');

    expect(obsidianMock.state.lastModal?.contentEl.children.map((child) => child.text)).toContain(
      '从「制作」推进到「发布」？',
    );
    button('推进').trigger();
    button('推进').trigger();

    await expect(result).resolves.toBe(true);
  });

  it('treats cancel, close, and ESC-style close as one false settlement', async () => {
    const cancelled = ConfirmStageModal.ask({} as never, '策划');
    button('取消').trigger();
    obsidianMock.state.lastModal?.close();
    await expect(cancelled).resolves.toBe(false);

    obsidianMock.state.settings.length = 0;
    const closed = ConfirmStageModal.ask({} as never, '策划');
    obsidianMock.state.lastModal?.close();
    obsidianMock.state.lastModal?.close();
    await expect(closed).resolves.toBe(false);
  });

  it('cannot confirm the terminal stage', async () => {
    const result = ConfirmStageModal.ask({} as never, '复盘');

    expect(button('推进').disabled).toBe(true);
    expect(obsidianMock.state.lastModal?.contentEl.children.map((child) => child.text)).toContain(
      '当前已经是最终阶段。',
    );
    obsidianMock.state.lastModal?.close();
    await expect(result).resolves.toBe(false);
  });
});

describe('CreateFileModal', () => {
  beforeEach(() => {
    obsidianMock.state.lastModal = null;
    obsidianMock.state.settings.length = 0;
  });

  it('shows labeled issue, title, and editable target path and submits once', async () => {
    const result = CreateFileModal.ask({} as never, createDefaults());

    expect(setting('期数').texts[0]?.value).toBe('39');
    expect(setting('标题').texts[0]?.value).toBe('首页');
    expect(setting('目标路径').texts[0]?.value).toBe('40-脚本大纲/39-首页成稿.md');
    button('创建').trigger();
    button('创建').trigger();

    await expect(result).resolves.toEqual({
      issue: 39,
      targetPath: '40-脚本大纲/39-首页成稿.md',
      templatePath: '99-模板/脚本.md',
      title: '首页',
    });
  });

  it('updates the default path with issue/title until the path is manually edited', async () => {
    const result = CreateFileModal.ask({} as never, createDefaults());
    setting('期数').texts[0]?.trigger('40');
    setting('标题').texts[0]?.trigger('新:标题');
    expect(setting('目标路径').texts[0]?.value).toBe('40-脚本大纲/40-新-标题成稿.md');

    setting('目标路径').texts[0]?.trigger('自定义/最终.md');
    setting('标题').texts[0]?.trigger('不会覆盖路径');
    expect(setting('目标路径').texts[0]?.value).toBe('自定义/最终.md');
    button('创建').trigger();

    await expect(result).resolves.toMatchObject({
      issue: 40,
      targetPath: '自定义/最终.md',
      title: '不会覆盖路径',
    });
  });

  it.each(['1abc', '1.5', '0', '-1', '9007199254740992', ''])('rejects invalid issue %j visibly', async (value) => {
    const result = CreateFileModal.ask({} as never, createDefaults());
    setting('期数').texts[0]?.trigger(value);
    button('创建').trigger();

    expect(obsidianMock.state.lastModal?.contentEl.children.some((child) =>
      child.text.includes('期数必须是正安全整数'))).toBe(true);
    obsidianMock.state.lastModal?.close();
    await expect(result).resolves.toBeNull();
  });

  it.each([
    ['blank title', '标题', '  ', '标题不能为空'],
    ['empty sanitized title', '标题', '<>:"/\\|?*', '标题不能生成有效文件名'],
    ['blank target', '目标路径', ' ', '目标路径不能为空'],
    ['non markdown target', '目标路径', 'safe/file.txt', '目标路径必须以 .md 结尾'],
  ])('rejects %s with a visible error', async (_case, field, value, message) => {
    const result = CreateFileModal.ask({} as never, createDefaults());
    setting(field).texts[0]?.trigger(value);
    button('创建').trigger();

    expect(obsidianMock.state.lastModal?.contentEl.children.some((child) =>
      child.text.includes(message))).toBe(true);
    obsidianMock.state.lastModal?.close();
    await expect(result).resolves.toBeNull();
  });

  it('settles cancellation and external close once without a request', async () => {
    const cancelled = CreateFileModal.ask({} as never, createDefaults());
    button('取消').trigger();
    obsidianMock.state.lastModal?.close();
    await expect(cancelled).resolves.toBeNull();

    obsidianMock.state.settings.length = 0;
    const closed = CreateFileModal.ask({} as never, createDefaults());
    obsidianMock.state.lastModal?.close();
    await expect(closed).resolves.toBeNull();
  });
});
