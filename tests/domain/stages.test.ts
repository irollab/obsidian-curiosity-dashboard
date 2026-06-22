import { describe, expect, it } from 'vitest';

import { nextStage, normalizeStage, stageIndex } from '../../src/domain/stages';

describe('stage model', () => {
  it('normalizes supported stages', () => {
    expect(normalizeStage('制作')).toBe('制作');
  });

  it('rejects unsupported or missing stages', () => {
    expect(normalizeStage('unknown')).toBeNull();
    expect(normalizeStage(undefined)).toBeNull();
  });

  it('returns the next stage', () => {
    expect(nextStage('策划')).toBe('制作');
    expect(nextStage('复盘')).toBeNull();
  });

  it('returns a stage index', () => {
    expect(stageIndex('发布')).toBe(3);
  });
});
