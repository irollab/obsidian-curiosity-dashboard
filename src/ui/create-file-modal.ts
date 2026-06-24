import { type App, Modal, Setting, type TextComponent } from 'obsidian';

import type { Translator } from '@/i18n/translator';
import {
  sanitizeTitle,
  type CreateRequest,
} from '@/mutations/template-creation-service';

export interface CreateFileDefaults extends CreateRequest {
  heading: string;
  targetPathFor(issue: number, title: string): string;
}

export class CreateFileModal extends Modal {
  static ask(app: App, defaults: CreateFileDefaults, t: Translator): Promise<CreateRequest | null> {
    return new Promise((resolve) => {
      new CreateFileModal(app, defaults, resolve, t).open();
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
    private readonly t: Translator,
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
      .setName(this.t.t('createFile.issue'))
      .addText((text) => {
        labelInput(text, this.t.t('createFile.issue'), errorId);
        text.setValue(this.issueInput).onChange((value) => {
          this.issueInput = value.trim();
          this.updateGeneratedPath();
        });
      });
    new Setting(this.contentEl)
      .setName(this.t.t('createFile.title'))
      .addText((text) => {
        labelInput(text, this.t.t('createFile.title'), errorId);
        text.setValue(this.title).onChange((value) => {
          this.title = value;
          this.updateGeneratedPath();
        });
      });
    new Setting(this.contentEl)
      .setName(this.t.t('createFile.targetPath'))
      .addText((text) => {
        labelInput(text, this.t.t('createFile.targetPath'), errorId);
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
        button.setButtonText(this.t.t('common.cancel')).onClick(() => this.finish(null)))
      .addButton((button) =>
        button.setCta().setButtonText(this.t.t('common.create')).onClick(() => {
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
    if (issue === null) return this.t.t('createFile.errIssue');
    const title = this.title.trim();
    if (title.length === 0) return this.t.t('createFile.errTitleEmpty');
    if (sanitizeTitle(title).length === 0) return this.t.t('createFile.errTitleInvalid');
    const targetPath = this.targetPath.trim();
    if (targetPath.length === 0) return this.t.t('createFile.errPathEmpty');
    if (!targetPath.endsWith('.md') || targetPath.endsWith('/.md')) {
      return this.t.t('createFile.errPathExt');
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
