import { describe, expect, it } from 'vitest';

import { STAGES, nextStage, normalizeStage, stageIndex } from '../../src/domain/stages';

const stageTransitions = [
  ['选题', '策划'],
  ['策划', '制作'],
  ['制作', '发布'],
  ['发布', '复盘'],
  ['复盘', null],
] as const;

const stageIndexes = [
  ['选题', 0],
  ['策划', 1],
  ['制作', 2],
  ['发布', 3],
  ['复盘', 4],
] as const;

describe('stage model', () => {
  it('keeps stages in workflow order', () => {
    expect(STAGES).toEqual(['选题', '策划', '制作', '发布', '复盘']);
  });

  it('normalizes supported stages', () => {
    expect(normalizeStage('制作')).toBe('制作');
  });

  it('rejects unsupported or missing stages', () => {
    expect(normalizeStage('unknown')).toBeNull();
    expect(normalizeStage(undefined)).toBeNull();
  });

  it.each(stageTransitions)('moves from %s to %s', (stage, expected) => {
    expect(nextStage(stage)).toBe(expected);
  });

  it.each(stageIndexes)('returns the index of %s', (stage, expected) => {
    expect(stageIndex(stage)).toBe(expected);
  });
});
