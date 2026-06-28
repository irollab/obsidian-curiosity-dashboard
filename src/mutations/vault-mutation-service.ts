import { parseChecklistSection, toggleChecklistLine } from '@/domain/checklist';
import type { ChecklistTask } from '@/domain/models';
import { nextStage, STAGES, type Stage } from '@/domain/stages';
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

  async promoteTopic(fromFocusPath: string | null, targetPath: string): Promise<void> {
    // 待评估卡立项：进入流水线（已立项 + 流水线首阶段「选题」）并把唯一焦点转移到该卡。
    // 仅改 frontmatter、不移动文件——面板按 frontmatter 识别选题，目录位置不影响逻辑。
    if (fromFocusPath !== null && fromFocusPath !== targetPath) {
      await this.vault.updateFrontmatter(fromFocusPath, (frontmatter) => {
        frontmatter.homepage_focus = false;
      });
    }
    await this.vault.updateFrontmatter(targetPath, (frontmatter) => {
      frontmatter.status = '已立项';
      frontmatter.stage = STAGES[0];
      frontmatter.homepage_focus = true;
    });
  }

  async switchHomepageFocus(from: string | null, to: string): Promise<void> {
    // 在两篇选题之间转移唯一的 `homepage_focus: true` 标记。
    // from === to 或 from 为 null（无/多焦点）时只确保目标为 true。
    if (from !== null && from !== to) {
      await this.vault.updateFrontmatter(from, (frontmatter) => {
        frontmatter.homepage_focus = false;
      });
    }
    await this.vault.updateFrontmatter(to, (frontmatter) => {
      frontmatter.homepage_focus = true;
    });
  }
}
