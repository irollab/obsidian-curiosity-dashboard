import { type App, Modal, Setting } from 'obsidian';

import { nextStage, type Stage } from '@/domain/stages';

export class ConfirmStageModal extends Modal {
  static ask(app: App, current: Stage): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmStageModal(app, current, resolve).open();
    });
  }

  private settled = false;

  private constructor(
    app: App,
    private readonly current: Stage,
    private readonly resolveResult: (value: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const next = nextStage(this.current);
    const titleId = 'curiosity-confirm-stage-title';
    this.modalEl.addClass('curiosity-modal', 'curiosity-modal--confirm');
    this.contentEl.addClass('curiosity-modal-content');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.contentEl.createEl('h2', { text: '推进制作阶段', attr: { id: titleId } });
    this.contentEl.createEl('p', {
      text: next === null
        ? '当前已经是最终阶段。'
        : `从「${this.current}」推进到「${next}」？`,
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('取消').onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText('推进')
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
