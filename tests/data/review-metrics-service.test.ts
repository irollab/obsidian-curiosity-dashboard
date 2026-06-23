import { describe, expect, it } from 'vitest';
import { ReviewMetricsService } from '@/data/review-metrics-service';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

describe('ReviewMetricsService', () => {
  it('prefers an explicit in-directory Markdown review and preserves empty metrics', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/explicit.md',
      '## 评论区需求\r\n- 想要安装教程\r\n* 希望展示完整配置\r\n\r\n## 其他\r\n- 不应收集',
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

  it('prefers a safe explicit Markdown review anywhere in the vault', async () => {
    const vault = reviewVault();
    vault.files.set('自定义复盘/outside.md', '## 评论区需求\n- 外部文件');
    vault.metadata.set('自定义复盘/outside.md', { created: '2020-01-01' });

    const service = new ReviewMetricsService(vault, '60-发布复盘');
    await expect(service.load('自定义复盘/outside.md')).resolves.toEqual({
      path: '自定义复盘/outside.md',
      metrics: [],
      commentEvidence: ['外部文件'],
    });
  });

  it('returns empty data for unsafe, missing, folder, or non-Markdown explicit paths', async () => {
    const vault = reviewVault();
    vault.files.set('outside.md', 'outside');
    vault.metadata.set('outside.md', { created: '2099-01-01' });
    vault.files.set('C:/outside.md', 'drive absolute');
    vault.metadata.set('C:/outside.md', { created: '2099-01-02' });

    const service = new ReviewMetricsService(vault, '60-发布复盘');
    const empty = { path: null, metrics: [], commentEvidence: [] };
    await expect(service.load('60-发布复盘/not-markdown.txt')).resolves.toEqual(empty);
    await expect(service.load('60-发布复盘/missing.md')).resolves.toEqual(empty);
    await expect(service.load('60-发布复盘/../outside.md')).resolves.toEqual(empty);
    await expect(service.load('/outside.md')).resolves.toEqual(empty);
    await expect(service.load('C:\\outside.md')).resolves.toEqual(empty);
    vault.directories.add('60-发布复盘/folder.md');
    await expect(service.load('60-发布复盘/folder.md')).resolves.toEqual(empty);
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

  it('parses and orders Vault date-time formats with optional seconds', async () => {
    const vault = new FakeVaultGateway();
    const reviews = [
      ['morning.md', { created: '2026-06-23 09:30' }],
      ['later.md', { created: '2026-06-23 10:15:30' }],
      ['invalid-time.md', { created: '2026-06-24 25:00', publish_date: '2026-06-23 11:00' }],
      ['iso.md', { created: '2026-06-23T10:30:00Z' }],
    ] as const;
    for (const [name, frontmatter] of reviews) {
      const path = `60-发布复盘/${name}`;
      vault.files.set(path, reviewTable(name));
      vault.metadata.set(path, frontmatter);
    }

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.path).toBe('60-发布复盘/invalid-time.md');
  });

  it('collects every exact supported section and stops at a same-level heading', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/comments.md',
      [
        '# 评论反馈',
        '- 一级标题不匹配',
        '## 评论反馈',
        '+ 需要模板',
        '## 同级标题会终止',
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

  it('keeps evidence through deeper headings and stops at the same or a higher level', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/nested-comments.md',
      [
        '### 评论反馈',
        '- 顶层证据',
        '#### 高频需求',
        '- 子标题证据',
        '##### 评论样本',
        '- 新目标标题证据',
        '###### 细节',
        '- 更深层证据',
        '##### 同级结束',
        '- 不应收集',
        '## 评论区需求',
        '- 第二段证据',
        '# 上级结束',
        '- 仍不应收集',
      ].join('\n'),
    );
    vault.metadata.set('60-发布复盘/nested-comments.md', { created: '2026-06-23' });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.commentEvidence).toEqual([
      '顶层证据',
      '子标题证据',
      '新目标标题证据',
      '更深层证据',
      '第二段证据',
    ]);
  });

  it('ignores comment evidence inside code blocks and HTML comments', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/visible-comments.md',
      [
        '## 评论反馈',
        '- 可见证据',
        '~~~markdown',
        '- 围栏伪证据',
        '~~~',
        '普通段落会结束列表上下文',
        '    - 缩进伪证据',
        '<!--',
        '- 注释伪证据',
        '-->',
        '### 分类',
        '- 子标题可见证据',
        '- 父级需求',
        '    - 四空格子需求',
        '\t- Tab 子需求',
      ].join('\n'),
    );
    vault.metadata.set('60-发布复盘/visible-comments.md', { created: '2026-06-23' });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.commentEvidence).toEqual([
      '可见证据',
      '子标题可见证据',
      '父级需求',
      '四空格子需求',
      'Tab 子需求',
    ]);
  });

  it('resets list context at ATX headings with one to three leading spaces', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      '60-发布复盘/heading-list-boundary.md',
      [
        '## 评论反馈',
        '- 父需求 1',
        ' ### 分类 1',
        '    - 伪子需求 1',
        '- 父需求 2',
        '  ### 分类 2',
        '    - 伪子需求 2',
        '- 父需求 3',
        '   ### 分类 3',
        '    - 伪子需求 3',
        '- 合法父需求',
        '    - 合法子需求',
      ].join('\n'),
    );
    vault.metadata.set('60-发布复盘/heading-list-boundary.md', { created: '2026-06-23' });

    const result = await new ReviewMetricsService(vault, '60-发布复盘').load(null);

    expect(result.commentEvidence).toEqual([
      '父需求 1',
      '父需求 2',
      '父需求 3',
      '合法父需求',
      '合法子需求',
    ]);
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
