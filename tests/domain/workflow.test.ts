import { describe, expect, it } from 'vitest';

import { fillPlaceholders, type PromptContext } from '@/domain/workflow';

function context(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    focus: { title: '示例', issue: 39, topicPath: '10-选题池/已立项/39.md', scriptPath: null, reviewPath: null },
    inboxDir: '10-选题池/待评估',
    topicDir: '10-选题池',
    scriptDraftDir: '40-脚本大纲/草稿',
    assetDir: '20-素材库',
    reviewDir: '60-发布复盘',
    topicTemplate: '99-模板/选题卡模板.md',
    scriptTemplate: '99-模板/脚本大纲模板.md',
    reviewTemplate: '99-模板/发布复盘模板.md',
    date: '2026-06-25',
    week: '2026-W26',
    ideas: '',
    ...overrides,
  };
}

describe('fillPlaceholders', () => {
  it('替换已知占位符', () => {
    const out = fillPlaceholders('评估 {{inbox_dir}} 焦点 {{focus_title}} 第{{focus_issue}}期 {{date}}', context());
    expect(out).toBe('评估 10-选题池/待评估 焦点 示例 第39期 2026-06-25');
  });

  it('未知占位符原样保留', () => {
    expect(fillPlaceholders('保留 {{unknown_token}}', context())).toBe('保留 {{unknown_token}}');
  });

  it('无焦点时焦点占位符填为空串', () => {
    const out = fillPlaceholders('script={{focus_script}} title={{focus_title}}', context({ focus: null }));
    expect(out).toBe('script= title=');
  });
});
