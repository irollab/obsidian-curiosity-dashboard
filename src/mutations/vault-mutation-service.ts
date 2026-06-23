import { toggleChecklistLine } from '@/domain/checklist';
import { nextStage, type Stage } from '@/domain/stages';
import type { VaultGateway } from '@/ports/vault-gateway';

export type AssociationField = 'script_path' | 'asset_path' | 'review_path';

export class VaultMutationService {
  constructor(private readonly vault: VaultGateway) {}

  async toggleTask(path: string, line: number): Promise<void> {
    await this.vault.process(path, (content) => toggleChecklistLine(content, line));
  }

  async advanceStage(path: string, current: Stage): Promise<Stage> {
    const next = nextStage(current);
    if (next === null) throw new Error('Review is the terminal stage');

    await this.vault.updateFrontmatter(path, (frontmatter) => {
      if (frontmatter.stage !== current) {
        throw new Error('Stage changed; refresh and try again');
      }
      frontmatter.stage = next;
    });
    return next;
  }

  async setAssociationPath(
    path: string,
    field: AssociationField,
    value: string,
  ): Promise<void> {
    if (!this.vault.exists(value)) throw new Error('Associated path not found');

    await this.vault.updateFrontmatter(path, (frontmatter) => {
      const existing = frontmatter[field];
      if (typeof existing === 'string' && existing.length > 0 && existing !== value) {
        throw new Error('Association already set; use an explicit edit to replace it');
      }
      frontmatter[field] = value;
    });
  }
}
