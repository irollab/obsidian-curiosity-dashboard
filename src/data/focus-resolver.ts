import type { FocusState, TopicRecord } from '@/domain/models';
import type { Stage } from '@/domain/stages';

export function resolveFocus(topics: TopicRecord[]): FocusState {
  const focused = topics.filter((topic) => topic.homepageFocus);
  if (focused.length === 0) return { kind: 'none' };
  if (focused.length > 1) return { kind: 'multiple', topics: focused };

  const topic = focused[0];
  if (topic === undefined) return { kind: 'none' };
  if (hasInvalidStage(topic)) return { kind: 'invalid-stage', topic };
  if (hasValidStage(topic)) return { kind: 'ready', topic };
  throw new Error('Unreachable focus stage');
}

function hasInvalidStage(topic: TopicRecord): topic is TopicRecord & { stage: null } {
  return topic.stage === null;
}

function hasValidStage(topic: TopicRecord): topic is TopicRecord & { stage: Stage } {
  return topic.stage !== null;
}
