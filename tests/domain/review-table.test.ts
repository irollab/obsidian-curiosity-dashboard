import { describe, expect, it } from 'vitest';
import { parseReviewMetrics } from '@/domain/review-table';

describe('parseReviewMetrics', () => {
  it('reads only raw fields that are present in a cross-platform table', () => {
    const markdown = [
      '| 平台 | 播放/观看 | 点赞 | 收藏 | 评论 | 分享 |',
      '| :--- | ---: | ---: | ---: | ---: | ---: |',
      '| 小红书 | 2,408 | 96 | 165 | 9 | 29 |',
      '| B站 | 310 | | | 3 | |',
    ].join('\r\n');

    expect(parseReviewMetrics(markdown)).toEqual([
      {
        platform: '小红书',
        collectedAt: null,
        views: '2,408',
        likes: '96',
        favorites: '165',
        comments: '9',
        shares: '29',
      },
      {
        platform: 'B站',
        collectedAt: null,
        views: '310',
        likes: null,
        favorites: null,
        comments: '3',
        shares: null,
      },
    ]);
  });

  it('uses the last valid metric row in a single-platform snapshot', () => {
    const markdown = [
      '平台：抖音',
      '| 时间点 | 采集时间 | 播放/阅读 | 点赞 | 收藏 | 评论 | 转发 |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
      '| 2小时 | 2026-06-16 | 100 | 2 | 3 | 0 | 0 |',
      '| 24小时 | 2026-06-17 | 300 | 8 | 12 | 1 | 2 |',
      '| 48小时 | 2026-06-18 | | | | | |',
    ].join('\n');

    expect(parseReviewMetrics(markdown)).toEqual([
      {
        platform: '抖音',
        collectedAt: '2026-06-17',
        views: '300',
        likes: '8',
        favorites: '12',
        comments: '1',
        shares: '2',
      },
    ]);
  });

  it('uses 时间点 as the raw collection label when 采集时间 is absent', () => {
    const markdown = [
      '平台: YouTube',
      '时间点 | 观看 | 点赞',
      '--- | ---: | ---:',
      '发布后 1 天 | 80 | 4',
    ].join('\n');

    expect(parseReviewMetrics(markdown)[0]).toMatchObject({
      platform: 'YouTube',
      collectedAt: '发布后 1 天',
      views: '80',
      likes: '4',
    });
  });

  it('skips empty and malformed rows without filling missing values', () => {
    const markdown = [
      '| 平台 | 播放 | 点赞 |',
      '| --- | ---: | ---: |',
      '| | 10 | 1 |',
      '| 小红书 | | |',
      '| B站 | 8 |',
      '| malformed |',
    ].join('\n');

    expect(parseReviewMetrics(markdown)).toEqual([
      {
        platform: 'B站',
        collectedAt: null,
        views: '8',
        likes: null,
        favorites: null,
        comments: null,
        shares: null,
      },
    ]);
  });

  it('ignores tables with invalid alignment rows or required columns missing', () => {
    const malformed = '| 平台 | 播放 |\n| -- | --- |\n| B站 | 10 |';
    const noViews = '| 平台 | 点赞 |\n| --- | --- |\n| B站 | 2 |';
    const noExplicitPlatform = [
      '| 采集时间 | 播放 |',
      '| --- | ---: |',
      '| 2026-06-22 | 10 |',
    ].join('\n');

    expect(parseReviewMetrics(malformed)).toEqual([]);
    expect(parseReviewMetrics(noViews)).toEqual([]);
    expect(parseReviewMetrics(noExplicitPlatform)).toEqual([]);
  });

  it('uses the platform declaration nearest and before the matching table', () => {
    const markdown = [
      '平台：旧平台',
      '无关正文',
      '平台：小红书',
      '| 采集时间 | 播放 |',
      '| --- | ---: |',
      '| 2026-06-22 | 42 |',
      '平台：后续平台',
    ].join('\n');

    expect(parseReviewMetrics(markdown)[0]?.platform).toBe('小红书');
  });

  it('continues to a later supported table when an earlier candidate has no valid data', () => {
    const markdown = [
      '| 平台 | 播放 |',
      '| --- | ---: |',
      '| B站 | |',
      '',
      '| 平台 | 观看 |',
      '| --- | ---: |',
      '| YouTube | 15 |',
    ].join('\n');

    expect(parseReviewMetrics(markdown)[0]).toMatchObject({ platform: 'YouTube', views: '15' });
  });
});
