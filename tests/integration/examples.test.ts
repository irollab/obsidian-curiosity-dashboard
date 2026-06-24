import { readFile } from 'node:fs/promises';

import { DashboardDataService } from '@/data/dashboard-data-service';
import { ReviewMetricsService } from '@/data/review-metrics-service';
import { TopicRepository } from '@/data/topic-repository';
import { parseChecklistSection } from '@/domain/checklist';
import type { DashboardSettings } from '@/settings';
import { describe, expect, it } from 'vitest';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const topicPath = '10-选题池/39-example.md';
const reviewPath = '60-发布复盘/39-example.md';
const settings: DashboardSettings = {
  topicDir: '10-选题池',
  topicInboxDir: '10-选题池/待评估',
  scriptDir: '40-脚本大纲',
  scriptDraftDir: '40-脚本大纲/草稿',
  assetDir: '20-素材库',
  reviewDir: '60-发布复盘',
  topicTemplate: '99-模板/选题卡模板.md',
  scriptTemplate: '99-模板/脚本大纲模板.md',
  reviewTemplate: '99-模板/发布复盘模板.md',
  promptDir: '99-模板/codex-提示词',
  backgroundPath: '',
  openOnStartup: false,
  defaultTab: 'overview',
  enableMobileView: true,
  language: 'auto',
  focusHistory: [],
};

describe('published examples', () => {
  it('loads the topic example through the real topic and checklist parsers', async () => {
    const markdown = await fixture('examples/topic.md');
    const frontmatter = parseExampleFrontmatter(markdown);
    const vault = new FakeVaultGateway();
    vault.files.set(topicPath, markdown);
    vault.metadata.set(topicPath, frontmatter);

    expect(new TopicRepository(vault, '10-选题池').all()).toMatchObject([
      {
        issue: 39,
        status: '已立项',
        stage: '制作',
        nextAction: '完成首页开发验证',
        homepageFocus: true,
      },
    ]);
    expect(parseChecklistSection(markdown)).toEqual([
      { line: 15, text: '技术路线确认', checked: true },
      { line: 16, text: '完成首页开发验证', checked: false },
      { line: 17, text: '录制演示', checked: false },
    ]);
  });

  it('loads example metrics and comment demand through the real review service', async () => {
    const markdown = await fixture('examples/review.md');
    const vault = new FakeVaultGateway();
    vault.files.set(reviewPath, markdown);
    vault.metadata.set(reviewPath, parseExampleFrontmatter(markdown));

    await expect(new ReviewMetricsService(vault, '60-发布复盘').load(reviewPath)).resolves.toEqual({
      path: reviewPath,
      metrics: [
        {
          platform: '示例平台A',
          collectedAt: '2026-06-22',
          views: '100',
          likes: '10',
          favorites: '8',
          comments: '2',
          shares: '1',
        },
        {
          platform: '示例平台B',
          collectedAt: '2026-06-22',
          views: '80',
          likes: '6',
          favorites: null,
          comments: '1',
          shares: null,
        },
      ],
      commentEvidence: ['示例：希望提供安装说明。'],
    });
  });

  it('aggregates both examples without injecting fixture values into settings', async () => {
    const topic = await fixture('examples/topic.md');
    const review = await fixture('examples/review.md');
    const vault = new FakeVaultGateway();
    vault.files.set(topicPath, topic);
    vault.files.set(reviewPath, review);
    vault.metadata.set(topicPath, parseExampleFrontmatter(topic));
    vault.metadata.set(reviewPath, parseExampleFrontmatter(review));

    const model = await new DashboardDataService(vault, settings).load(false);

    expect(model.focus.kind).toBe('ready');
    expect(model.tasks).toHaveLength(3);
    expect(model.reviewPath).toBe(reviewPath);
    expect(model.metrics.map((row) => row.platform)).toEqual(['示例平台A', '示例平台B']);
    expect(model.commentEvidence).toEqual(['示例：希望提供安装说明。']);
    expect(settings.topicDir).toBe('10-选题池');
  });
});

async function fixture(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function parseExampleFrontmatter(markdown: string): Record<string, unknown> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1];
  if (block === undefined) throw new Error('Example frontmatter is missing');
  return Object.fromEntries(
    block.split(/\r?\n/).map((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) throw new Error(`Unsupported example frontmatter: ${line}`);
      const key = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      const value = raw === 'true' ? true : /^\d+$/.test(raw) ? Number(raw) : raw;
      return [key, value];
    }),
  );
}
