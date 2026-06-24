import { describe, expect, it } from 'vitest';

import {
  isRelevantVaultChange,
  normalizeObservedPaths,
  type VaultChange,
} from '@/relevant-vault-change';

const settings = {
  topicDir: '10-选题池',
  scriptDir: '40-脚本大纲',
  assetDir: '20-素材库',
  reviewDir: '60-发布复盘',
  topicTemplate: '99-模板/选题卡.md',
  scriptTemplate: '99-模板/脚本.md',
  reviewTemplate: '99-模板/复盘.md',
  backgroundPath: '80-制作资产/背景图.png',
  openOnStartup: false,
  defaultTab: 'overview' as const,
  enableMobileView: true,
  language: 'auto' as const,
};

function relevant(change: VaultChange, observed: Iterable<string> = []): boolean {
  return isRelevantVaultChange(change, settings, normalizeObservedPaths(observed));
}

describe('isRelevantVaultChange', () => {
  it.each(['create', 'modify', 'delete', 'rename', 'metadata'] as const)(
    'treats topic and review directory %s events as relevant',
    (kind) => {
      expect(relevant({ kind, path: '10-选题池\\39.md' })).toBe(true);
      expect(relevant({ kind, path: '/60-发布复盘/39.md' })).toBe(true);
    },
  );

  it('only observes candidate membership changes in script and asset directories', () => {
    for (const directory of ['40-脚本大纲', '20-素材库']) {
      expect(relevant({ kind: 'create', path: `${directory}/39.md` })).toBe(true);
      expect(relevant({ kind: 'delete', path: `${directory}/39.md` })).toBe(true);
      expect(relevant({ kind: 'modify', path: `${directory}/39.md` })).toBe(false);
      expect(relevant({ kind: 'metadata', path: `${directory}/39.md` })).toBe(false);
    }
  });

  it.each(['create', 'modify', 'delete', 'rename'] as const)(
    'observes background path %s events across path separators',
    (kind) => {
      expect(relevant({ kind, path: '\\80-制作资产\\背景图.png\\' })).toBe(true);
    },
  );

  it('copies and normalizes observed external review paths', () => {
    const source = new Set([' archive\\explicit.md ']);
    const observed = normalizeObservedPaths(source);
    source.clear();

    expect(observed).toEqual(new Set(['archive/explicit.md']));
    for (const kind of ['create', 'modify', 'delete', 'rename', 'metadata'] as const) {
      expect(isRelevantVaultChange({ kind, path: '/archive/explicit.md/' }, settings, observed)).toBe(true);
    }
  });

  it('checks both old and new rename paths', () => {
    expect(relevant({
      kind: 'rename',
      oldPath: 'unrelated/file.md',
      path: '40-脚本大纲/39.md',
    })).toBe(true);
    expect(relevant({
      kind: 'rename',
      oldPath: '20-素材库/39',
      path: 'unrelated/39',
    })).toBe(true);
    expect(relevant({
      kind: 'rename',
      oldPath: 'archive/explicit.md',
      path: 'archive/renamed.md',
    }, ['archive/explicit.md'])).toBe(true);
  });

  it('ignores unrelated templates, attachments, and ordinary files', () => {
    for (const path of [
      '99-模板/选题卡模板.md',
      '附件/截图.png',
      'archive/other-review.md',
      '40-脚本大纲外/39.md',
    ]) {
      expect(relevant({ kind: 'modify', path })).toBe(false);
    }
  });
});
