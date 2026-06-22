export const STAGES = ['选题', '策划', '制作', '发布', '复盘'] as const;

export type Stage = (typeof STAGES)[number];

export function normalizeStage(value: unknown): Stage | null {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
    ? (value as Stage)
    : null;
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  return STAGES[stageIndex(stage) + 1] ?? null;
}
