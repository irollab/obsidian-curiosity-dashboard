import { type App, Modal, Setting } from 'obsidian';

import { nextStage, type Stage } from '@/domain/stages';
import type { Translator } from '@/i18n/translator';

export class ConfirmStageModal extends Modal {
  static ask(app: App, current: Stage, t: Translator): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmStageModal(app, current, resolve, t).open();
    });
  }

  private settled = false;

  private constructor(
    app: App,
    private readonly current: Stage,
    private readonly resolveResult: (value: boolean) => void,
    private readonly t: Translator,
  ) {
    super(app);
  }

  override onOpen(): void {
    const next = nextStage(this.current);
    const titleId = 'curiosity-confirm-stage-title';
    this.modalEl.addClass('curiosity-modal', 'curiosity-modal--confirm');
    this.contentEl.addClass('curiosity-modal-content');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.contentEl.createEl('h2', { text: this.t.t('confirmStage.title'), attr: { id: titleId } });
    this.contentEl.createEl('p', {
      text: next === null
        ? this.t.t('confirmStage.terminal')
        : this.t.t('confirmStage.prompt', {
            from: this.t.stageLabel(this.current),
            to: this.t.stageLabel(next),
          }),
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText(this.t.t('common.cancel')).onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(this.t.t('confirmStage.confirm'))
          .setDisabled(next === null)
          .onClick(() => this.finish(next !== null)));
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finishWithoutClosing(false);
  }

  private finish(value: boolean): void {
    if (!this.finishWithoutClosing(value)) return;
    this.close();
  }

  private finishWithoutClosing(value: boolean): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolveResult(value);
    return true;
  }
}
