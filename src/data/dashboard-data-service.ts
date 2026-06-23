import { parseChecklistSection } from '@/domain/checklist';
import type { DashboardModel, FocusState, TopicRecord } from '@/domain/models';
import type { VaultGateway } from '@/ports/vault-gateway';
import type { DashboardSettings } from '@/settings';

import { AssociationResolver } from './association-resolver';
import { resolveFocus } from './focus-resolver';
import { ReviewMetricsService } from './review-metrics-service';
import { TopicRepository } from './topic-repository';

export class DashboardDataService {
  constructor(
    private readonly vault: VaultGateway,
    private readonly settings: DashboardSettings,
  ) {}

  async load(mobileReadOnly: boolean): Promise<DashboardModel> {
    // These services intentionally live for one load. Repository snapshots are shared by all
    // projections in this model, while a later refresh observes the latest Vault state.
    const topics = new TopicRepository(this.vault, this.settings.topicDir);
    const resolver = new AssociationResolver(this.vault, this.settings);
    const reviewService = new ReviewMetricsService(this.vault, this.settings.reviewDir);

    const focus = resolveAssociations(resolveFocus(topics.all()), resolver);
    const focusTopic = topicFromFocus(focus);
    const associationCandidates =
      focusTopic === null
        ? emptyAssociationCandidates()
        : {
            scriptPath:
              focusTopic.scriptPath === null
                ? resolver.candidates(this.settings.scriptDir, focusTopic.issue)
                : [],
            assetPath:
              focusTopic.assetPath === null
                ? resolver.candidates(this.settings.assetDir, focusTopic.issue, true)
                : [],
            reviewPath:
              focusTopic.reviewPath === null
                ? resolver.candidates(this.settings.reviewDir, focusTopic.issue)
                : [],
          };
    const tasks =
      focusTopic === null
        ? []
        : parseChecklistSection(await this.vault.read(focusTopic.path));
    const review = await reviewService.load(focusTopic?.reviewPath ?? null);
    const backgroundUrl =
      this.settings.backgroundPath.length === 0
        ? null
        : this.vault.resourceUrl(this.settings.backgroundPath);

    return {
      focus,
      tasks,
      thisWeek: topics.thisWeek(),
      queue: topics.productionQueue(),
      metrics: review.metrics,
      reviewPath: review.path,
      commentEvidence: review.commentEvidence,
      backgroundUrl,
      mobileReadOnly,
      associationCandidates,
    };
  }
}

function resolveAssociations(focus: FocusState, resolver: AssociationResolver): FocusState {
  if (focus.kind === 'ready') {
    const topic = { ...resolver.resolve(focus.topic), stage: focus.topic.stage };
    return { kind: 'ready', topic };
  }
  if (focus.kind === 'invalid-stage') {
    const topic = { ...resolver.resolve(focus.topic), stage: focus.topic.stage };
    return { kind: 'invalid-stage', topic };
  }
  return focus;
}

function topicFromFocus(focus: FocusState): TopicRecord | null {
  return focus.kind === 'ready' || focus.kind === 'invalid-stage' ? focus.topic : null;
}

function emptyAssociationCandidates(): DashboardModel['associationCandidates'] {
  return { scriptPath: [], assetPath: [], reviewPath: [] };
}
