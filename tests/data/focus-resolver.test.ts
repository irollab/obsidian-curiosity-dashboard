import { describe, expect, expectTypeOf, it } from 'vitest';

import { resolveFocus } from '@/data/focus-resolver';
import type { FocusState, TopicRecord } from '@/domain/models';
import type { Stage } from '@/domain/stages';

function topic(issue: number, stage: TopicRecord['stage'], homepageFocus = true): TopicRecord {
  return {
    path: `${issue}.md`, basename: `${issue}`, title: `${issue}`, issue,
    status: '已立项', stage, priority: null, dueDate: null, nextAction: null,
    homepageFocus, scriptPath: null, assetPath: null, reviewPath: null,
  };
}

describe('resolveFocus', () => {
  it('returns none when no topic is focused', () => {
    expect(resolveFocus([topic(1, '策划', false)])).toEqual({ kind: 'none' });
  });

  it('returns every focused topic when focus is ambiguous', () => {
    const focused = [topic(1, '策划'), topic(2, '制作')];
    expect(resolveFocus([...focused, topic(3, '发布', false)]))
      .toEqual({ kind: 'multiple', topics: focused });
  });

  it('returns an invalid-stage topic with a precisely null stage', () => {
    const result = resolveFocus([topic(1, null)]);
    expect(result.kind).toBe('invalid-stage');
    if (result.kind === 'invalid-stage') expectTypeOf(result.topic.stage).toEqualTypeOf<null>();
  });

  it('returns a ready topic with a precisely valid stage', () => {
    const result = resolveFocus([topic(1, '制作')]);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expectTypeOf(result.topic.stage).toEqualTypeOf<Stage>();
  });

  it('conforms to the FocusState union without widening', () => {
    expectTypeOf(resolveFocus).returns.toEqualTypeOf<FocusState>();
  });
});
