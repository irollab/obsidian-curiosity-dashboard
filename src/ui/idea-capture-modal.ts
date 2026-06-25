import { type App, Modal, Setting } from 'obsidian';

import type { Translator } from '@/i18n/translator';

export type IdeaModalResult = { kind: 'save'; text: string } | { kind: 'organize' } | null;

export interface IdeaModalOptions {
  initial?: string;
  heading?: string;
  showOrganize?: boolean;
}

// 极速灵感捕获/编辑模态：一行输入，回车即提交；可选「去整理选题」跳转。
export class IdeaCaptureModal extends Modal {
  static ask(app: App, t: Translator, options: IdeaModalOptions = {}): Promise<IdeaModalResult> {
    return new Promise((resolve) => {
      new IdeaCaptureModal(app, resolve, t, options).open();
    });
  }

  private value: string;
  private settled = false;

  private constructor(
    app: App,
    private readonly resolveResult: (value: IdeaModalResult) => void,
    private readonly t: Translator,
    private readonly options: IdeaModalOptions,
  ) {
    super(app);
    this.value = options.initial ?? '';
  }

  override onOpen(): void {
    const titleId = 'curiosity-idea-title';
    this.modalEl.addClass('curiosity-modal', 'curiosity-modal--idea');
    this.contentEl.addClass('curiosity-modal-content');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.contentEl.createEl('h2', {
      text: this.options.heading ?? this.t.t('idea.captureHeading'),
      attr: { id: titleId },
    });

    const input = this.contentEl.createEl('input', {
      cls: 'curiosity-idea-input',
      type: 'text',
      attr: {
        placeholder: this.t.t('idea.capturePlaceholder'),
        'aria-label': this.t.t('idea.captureHeading'),
      },
    });
    input.value = this.value;
    input.addEventListener('input', () => {
      this.value = input.value;
    });
    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });
    window.setTimeout(() => input.focus(), 0);

    const actions = new Setting(this.contentEl);
    if (this.options.showOrganize === true) {
      actions.addButton((button) =>
        button.setButtonText(this.t.t('idea.organize')).onClick(() => this.finish({ kind: 'organize' })));
    }
    actions
      .addButton((button) =>
        button.setButtonText(this.t.t('common.cancel')).onClick(() => this.finish(null)))
      .addButton((button) =>
        button.setCta().setButtonText(this.t.t('idea.save')).onClick(() => this.submit()));
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finishWithoutClosing(null);
  }

  private submit(): void {
    if (this.value.trim().length === 0) return;
    this.finish({ kind: 'save', text: this.value });
  }

  private finish(value: IdeaModalResult): void {
    if (!this.finishWithoutClosing(value)) return;
    this.close();
  }

  private finishWithoutClosing(value: IdeaModalResult): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolveResult(value);
    return true;
  }
}
