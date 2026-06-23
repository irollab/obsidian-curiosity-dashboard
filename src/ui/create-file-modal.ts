import { type App, Modal, Setting, type TextComponent } from 'obsidian';

import {
  sanitizeTitle,
  type CreateRequest,
} from '@/mutations/template-creation-service';

export interface CreateFileDefaults extends CreateRequest {
  heading: string;
  targetPathFor(issue: number, title: string): string;
}

export class CreateFileModal extends Modal {
  static ask(app: App, defaults: CreateFileDefaults): Promise<CreateRequest | null> {
    return new Promise((resolve) => {
      new CreateFileModal(app, defaults, resolve).open();
    });
  }

  private issueInput: string;
  private pathManuallyEdited = false;
  private settled = false;
  private targetPath: string;
  private title: string;
  private targetText: TextComponent | null = null;

  private constructor(
    app: App,
    private readonly defaults: CreateFileDefaults,
    private readonly resolveResult: (value: CreateRequest | null) => void,
  ) {
    super(app);
    this.issueInput = String(defaults.issue);
    this.targetPath = defaults.targetPath;
    this.title = defaults.title;
  }

  override onOpen(): void {
    const titleId = 'curiosity-create-file-title';
    const errorId = 'curiosity-create-file-error';
    this.modalEl.addClass('curiosity-modal', 'curiosity-modal--create');
    this.contentEl.addClass('curiosity-modal-content');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.contentEl.createEl('h2', { text: this.defaults.heading, attr: { id: titleId } });
    new Setting(this.contentEl)
      .setName('期数')
      .addText((text) => {
        labelInput(text, '期数', errorId);
        text.setValue(this.issueInput).onChange((value) => {
          this.issueInput = value.trim();
          this.updateGeneratedPath();
        });
      });
    new Setting(this.contentEl)
      .setName('标题')
      .addText((text) => {
        labelInput(text, '标题', errorId);
        text.setValue(this.title).onChange((value) => {
          this.title = value;
          this.updateGeneratedPath();
        });
      });
    new Setting(this.contentEl)
      .setName('目标路径')
      .addText((text) => {
        labelInput(text, '目标路径', errorId);
        this.targetText = text;
        text.setValue(this.targetPath).onChange((value) => {
          this.pathManuallyEdited = true;
          this.targetPath = value;
        });
      });

    const error = this.contentEl.createEl('p', {
      cls: 'curiosity-form-error',
      attr: { 'aria-live': 'polite', id: errorId, role: 'alert' },
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('取消').onClick(() => this.finish(null)))
      .addButton((button) =>
        button.setCta().setButtonText('创建').onClick(() => {
          const validation = this.validate();
          if (typeof validation === 'string') {
            error.setText(validation);
            return;
          }
          this.finish(validation);
        }));
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finishWithoutClosing(null);
  }

  private updateGeneratedPath(): void {
    if (this.pathManuallyEdited) return;
    const issue = parsePositiveSafeInteger(this.issueInput);
    if (issue === null || sanitizeTitle(this.title).length === 0) return;
    this.targetPath = this.defaults.targetPathFor(issue, this.title.trim());
    this.targetText?.setValue(this.targetPath);
  }

  private validate(): CreateRequest | string {
    const issue = parsePositiveSafeInteger(this.issueInput);
    if (issue === null) return '期数必须是正安全整数。';
    const title = this.title.trim();
    if (title.length === 0) return '标题不能为空。';
    if (sanitizeTitle(title).length === 0) return '标题不能生成有效文件名。';
    const targetPath = this.targetPath.trim();
    if (targetPath.length === 0) return '目标路径不能为空。';
    if (!targetPath.endsWith('.md') || targetPath.endsWith('/.md')) {
      return '目标路径必须以 .md 结尾。';
    }
    return {
      issue,
      targetPath,
      templatePath: this.defaults.templatePath,
      title,
    };
  }

  private finish(value: CreateRequest | null): void {
    if (!this.finishWithoutClosing(value)) return;
    this.close();
  }

  private finishWithoutClosing(value: CreateRequest | null): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolveResult(value);
    return true;
  }
}

function labelInput(text: TextComponent, label: string, errorId: string): void {
  text.inputEl.setAttribute('aria-label', label);
  text.inputEl.setAttribute('aria-describedby', errorId);
}

function parsePositiveSafeInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
