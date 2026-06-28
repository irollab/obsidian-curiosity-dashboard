import { type App, Modal, Setting } from 'obsidian';

import type { TopicRecord } from '@/domain/models';
import type { Translator } from '@/i18n/translator';

export class WorkPickerModal extends Modal {
  static ask(
    app: App,
    topics: TopicRecord[],
    currentPath: string | null,
    t: Translator,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      new WorkPickerModal(app, topics, currentPath, resolve, t).open();
    });
  }

  private settled = false;

  private constructor(
    app: App,
    private readonly topics: TopicRecord[],
    private readonly currentPath: string | null,
    private readonly resolveResult: (value: string | null) => void,
    private readonly t: Translator,
  ) {
    super(app);
  }

  override onOpen(): void {
    const titleId = 'curiosity-work-picker-title';
    this.modalEl.addClass('curiosity-modal', 'curiosity-modal--work-picker');
    this.contentEl.addClass('curiosity-modal-content');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.contentEl.createEl('h2', { text: this.t.t('workPicker.title'), attr: { id: titleId } });

    if (this.topics.length === 0) {
      this.contentEl.createEl('p', { text: this.t.t('workPicker.empty') });
    } else {
      const list = this.contentEl.createEl('ul', { cls: 'curiosity-work-picker-list' });
      for (const topic of this.topics) {
        const item = list.createEl('li');
        const button = item.createEl('button', {
          cls: 'curiosity-work-picker-item',
          type: 'button',
          attr: { 'aria-label': this.t.t('mission.issue', { issue: topic.issue, title: topic.title }) },
        });
        if (topic.path === this.currentPath) {
          button.addClass('is-current');
          button.setAttr('aria-current', 'true');
        }
        button.createSpan({
          cls: 'curiosity-work-picker-issue',
          text: this.t.t('hero.issuePill', { issue: topic.issue }),
        });
        button.createSpan({ cls: 'curiosity-work-picker-title', text: topic.title });
        if (topic.stage !== null) {
          button.createSpan({ cls: 'curiosity-work-picker-stage', text: this.t.stageLabel(topic.stage) });
        }
        button.addEventListener('click', () => this.finish(topic.path));
      }
    }

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText(this.t.t('common.cancel')).onClick(() => this.finish(null)),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finishWithoutClosing(null);
  }

  private finish(value: string | null): void {
    if (!this.finishWithoutClosing(value)) return;
    this.close();
  }

  private finishWithoutClosing(value: string | null): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.resolveResult(value);
    return true;
  }
}
