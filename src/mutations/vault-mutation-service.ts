import { parseChecklistSection, toggleChecklistLine } from '@/domain/checklist';
import type { ChecklistTask } from '@/domain/models';
import { nextStage, type Stage } from '@/domain/stages';
import type { VaultGateway } from '@/ports/vault-gateway';

export type AssociationField = 'script_path' | 'asset_path' | 'review_path';

export class VaultMutationService {
  constructor(private readonly vault: VaultGateway) {}

  async toggleTask(path: string, task: ChecklistTask): Promise<void> {
    await this.vault.process(path, (content) => {
      const latest = parseChecklistSection(content).find((candidate) => candidate.line === task.line);
      if (latest?.text !== task.text || latest.checked !== task.checked) {
        throw new Error('Task changed; refresh and try again');
      }
      return toggleChecklistLine(content, task.line);
    });
  }

  async advanceStage(path: string, current: Stage): Promise<Stage> {
    const next = nextStage(current);

    await this.vault.updateFrontmatter(path, (frontmatter) => {
      if (frontmatter.stage !== current) {
        throw new Error('Stage changed; refresh and try again');
      }
      if (next === null) throw new Error('Review is the terminal stage');
      frontmatter.stage = next;
    });
    if (next === null) throw new Error('Review is the terminal stage');
    return next;
  }

  async setAssociationPath(
    path: string,
    field: AssociationField,
    value: string,
    options: { requireHomepageFocus?: boolean } = {},
  ): Promise<void> {
    if (!this.vault.exists(value)) throw new Error('Associated path not found');

    await this.vault.updateFrontmatter(path, (frontmatter) => {
      if (options.requireHomepageFocus === true && frontmatter.homepage_focus !== true) {
        throw new Error('Topic is no longer the homepage focus');
      }
      const existing = frontmatter[field];
      if (existing !== null && existing !== undefined && existing !== '' && existing !== value) {
        throw new Error('Association already set; use an explicit edit to replace it');
      }
      frontmatter[field] = value;
    });
  }
}
