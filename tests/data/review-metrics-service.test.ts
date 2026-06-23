import { describe, expect, it } from 'vitest';
import { ReviewMetricsService } from '@/data/review-metrics-service';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

describe('ReviewMetricsService', () => {
  it('prefers an explicit in-directory Markdown review and preserves empty metrics', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/explicit.md',
      '## 评论区需求\r\n- 想要安装教程\r\n* 希望展示完整配置\r\n\r\n### 其他\r\n- 不应收集',
    );
    vault.metadata.set('60-发布复盘/explicit.md', { type: '发布复盘' });

    await expect(
      new ReviewMetricsService(vault, '60-发布复盘').load('60-发布复盘/explicit.md'),
    ).resolves.toEqual({
      path: '60-发布复盘/explicit.md',
      metrics: [],
      commentEvidence: ['想要安装教程', '希望展示完整配置'],
    });
  });

  it('falls back from an unsafe explicit path to the latest dated review', async () => {
    const vault = reviewVault();
    vault.files.set('outside.md', '## 评论区需求\n- 外部文件');
    vault.metadata.set('outside.md', { created: '2099-01-01' });

    const service = new ReviewMetricsService(vault, '60-发布复盘');
    await expect(service.load('outside.md')).resolves.toMatchObject({
      path: '60-发布复盘/new.md',
    });
    await expect(service.load('60-发布复盘/not-markdown.txt')).resolves.toMatchObject({
      path: '60-发布复盘/new.md',
    });
    await expect(service.load('60-发布复盘/../outside.md')).resolves.toMatchObject({
      path: '60-发布复盘/new.md',
    });
  });

  it('selects the latest parseable frontmatter date and ignores undated or invalid dates', async () => {
    const vault = reviewVault();
    vault.files.set('60-发布复盘/future-undated.md', 'ignored');
    vault.metadata.set('60-发布复盘/future-undated.md', {});
    vault.files.set('60-发布复盘/invalid.md', 'ignored');
    vault.metadata.set('60-发布复盘/invalid.md', {
      created: 'not-a-date',
      publish_date: '2026-06-10',
    });
    vault.files.set('60-发布复盘/invalid-calendar.md', 'ignored');
    vault.metadata.set('60-发布复盘/invalid-calendar.md', { created: '2027-02-30' });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.path).toBe('60-发布复盘/new.md');
    expect(result.metrics[0]?.views).toBe('10');
  });

  it('falls back to publish_date when created is absent or invalid', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set('60-发布复盘/published.md', reviewTable('11'));
    vault.metadata.set('60-发布复盘/published.md', { publish_date: '2026-06-23' });
    vault.files.set('60-发布复盘/invalid-created.md', reviewTable('12'));
    vault.metadata.set('60-发布复盘/invalid-created.md', {
      created: 'not-a-date',
      publish_date: '2026-06-24',
    });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.path).toBe('60-发布复盘/invalid-created.md');
  });

  it('uses normalized path order as a deterministic date tie-breaker', async () => {
    const vault = new FakeVaultGateway();
    for (const path of ['60-发布复盘/z.md', '60-发布复盘/a.md']) {
      vault.files.set(path, reviewTable('10'));
      vault.metadata.set(path, { created: '2026-06-22' });
    }

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.path).toBe('60-发布复盘/a.md');
  });

  it('collects evidence from every exact supported section and stops at any next heading', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/comments.md',
      [
        '# 评论反馈',
        '- 一级标题不匹配',
        '## 评论反馈',
        '+ 需要模板',
        '### 子标题会终止',
        '- 不应收集',
        '## 评论样本',
        '  - 原始评论 A',
        '## 评论区需求补充',
        '- 非精确标题不应收集',
        '## 评论区需求',
        '- 原始评论 B',
        '# 一级标题也会终止',
        '- 不应收集',
      ].join('\n'),
    );
    vault.metadata.set('60-发布复盘/comments.md', { created: '2026-06-23' });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.commentEvidence).toEqual(['需要模板', '原始评论 A', '原始评论 B']);
  });

  it('returns an empty result when no eligible review exists', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set('60-发布复盘/undated.md', reviewTable('99'));
    vault.metadata.set('60-发布复盘/undated.md', {});
    vault.files.set('60-发布复盘/note.txt', 'not markdown');

    await expect(new ReviewMetricsService(vault, '60-发布复盘').load(null)).resolves.toEqual({
      path: null,
      metrics: [],
      commentEvidence: [],
    });
  });
});

function reviewVault(): FakeVaultGateway {
  const vault = new FakeVaultGateway();
  vault.files.set('60-发布复盘/old.md', reviewTable('5'));
  vault.metadata.set('60-发布复盘/old.md', { created: '2026-06-01' });
  vault.files.set('60-发布复盘/new.md', reviewTable('10'));
  vault.metadata.set('60-发布复盘/new.md', { created: '2026-06-22' });
  return vault;
}

function reviewTable(views: string): string {
  return `| 平台 | 播放/观看 |\n| --- | ---: |\n| B站 | ${views} |`;
}
