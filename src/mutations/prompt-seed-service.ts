import type { VaultGateway } from '@/ports/vault-gateway';

interface SeedTemplate {
  filename: string;
  frontmatter: {
    id: string;
    label: string;
    stage: string;
    order: number;
    needs_focus: boolean;
    output: string;
    description: string;
  };
  body: string;
}

const TEMPLATES: SeedTemplate[] = [
  {
    filename: '1-收集灵感整理选题卡.md',
    frontmatter: { id: 'collect-ideas', label: '收集灵感 → 整理选题卡', stage: '选题', order: 1, needs_focus: false, output: '10-选题池/待评估', description: '把零散想法整理成标准选题卡' },
    body: '请把下面这些想法整理成 Obsidian 选题卡，放到 {{inbox_dir}}。\n每个选题使用 {{topic_template}} 的结构。\n不要写完整脚本，只做选题判断。\n\n期号规则：新选题卡期号从 {{next_issue}} 开始（已是全库最大期号+1）；多个则依次 {{next_issue}}、+1、+2……。\n文件名前缀与 frontmatter 的 issue 都用该期号，并扫描整个 10-选题池（含 待评估/已立项/暂缓/已归档 等所有子目录）确认不与已有选题重复——不要只看待评估目录。\n\n想法：\n{{ideas}}',
  },
  {
    filename: '2-批量评估待评估选题.md',
    frontmatter: { id: 'evaluate-topics', label: '批量评估待评估选题', stage: '选题', order: 2, needs_focus: false, output: '', description: '只读·给结论，不写文件' },
    body: '请扫描 {{inbox_dir}} 下的选题卡，按受众明确、痛点强度、差异化、证据充分、制作成本打分。\n输出推荐立项的前 3 个，并说明原因。\n先不要移动文件。',
  },
  {
    filename: '3-从选题生成脚本大纲.md',
    frontmatter: { id: 'generate-outline', label: '从选题生成脚本大纲', stage: '策划', order: 1, needs_focus: true, output: '40-脚本大纲/草稿', description: '基于焦点选题创建大纲' },
    body: '请基于 {{focus_topic}} 创建一份脚本大纲，放到 {{script_draft_dir}}。\n使用 {{script_template}}。\n风格要求：适合 AI 编程初学者，口语化，先讲问题再给方案。',
  },
  {
    filename: '4-扩写脚本成稿.md',
    frontmatter: { id: 'expand-script', label: '扩写脚本成稿', stage: '策划', order: 2, needs_focus: true, output: '40-脚本大纲/成稿', description: '确认结构后再扩写' },
    body: '请基于脚本大纲 {{focus_script}} 继续扩写成稿。\n要求：\n- 口语化\n- 适合 5-8 分钟视频\n- 每段都说明画面建议\n- 不要加入未经验证的事实\n输出到 40-脚本大纲/成稿。',
  },
  {
    filename: '5-整理素材索引.md',
    frontmatter: { id: 'index-assets', label: '整理素材索引', stage: '制作', order: 1, needs_focus: false, output: '20-素材库/引用资料', description: '只做索引，不移动原文件' },
    body: '请根据素材目录里的文件，整理一份素材索引，放到 {{asset_dir}}/引用资料。\n标注每个素材可能适合哪些选题、是否适合做封面/演示/转场/证据。\n不要删除或移动原文件。',
  },
  {
    filename: '6-生成标题封面文案简介.md',
    frontmatter: { id: 'generate-publish-assets', label: '生成标题/封面文案/简介', stage: '制作', order: 2, needs_focus: true, output: '50-制作中/发布素材', description: '脚本基本确定后做发布素材' },
    body: '请基于脚本 {{focus_script}} 生成：\n1. 10 个标题候选\n2. 5 个封面文案\n3. 1 版视频简介\n4. 5 个标签\n\n要求：标题不要夸大，不制造虚假焦虑，适合 AI 编程初学者。\n输出到 50-制作中/发布素材/第{{focus_issue}}期-发布素材.md。',
  },
  {
    filename: '7-发布后做复盘.md',
    frontmatter: { id: 'post-review', label: '发布后做复盘', stage: '复盘', order: 1, needs_focus: true, output: '60-发布复盘', description: '把数据和评论交给 Codex' },
    body: '请根据下面的数据，为焦点选题《{{focus_title}}》创建发布复盘，放到 {{review_dir}}。\n使用 {{review_template}}。\n重点分析：标题是否有效、评论区暴露了什么新需求、下一条内容怎么延展。\n\n数据：\n- 发布时间：\n- 播放量：\n- 点赞：\n- 收藏：\n- 评论：\n- 链接：\n\n典型评论：\n1. \n2. \n3. ',
  },
  {
    filename: '8-沉淀长期知识.md',
    frontmatter: { id: 'distill-knowledge', label: '沉淀长期知识', stage: '复盘', order: 2, needs_focus: true, output: '70-长期知识', description: '抽出可长期复用的结论' },
    body: '请阅读焦点选题 {{focus_topic}}、其脚本与复盘，提炼可长期复用的内容方法论或 AI 编程知识，放到 70-长期知识。\n不要重复原稿，只沉淀结论、原则和例子。',
  },
  {
    filename: '9-联网核验热点.md',
    frontmatter: { id: 'verify-hotspots', label: '🌐 联网核验热点', stage: 'general', order: 1, needs_focus: false, output: '30-竞品热点/热点观察', description: '热点类内容一定要核验' },
    body: '请联网核验最近 7 天 AI 编程工具相关热点，只使用官方文档、发布公告或可信来源。\n把适合做视频的内容整理到 30-竞品热点/热点观察。\n每条都附来源链接、发布日期和为什么适合做选题。',
  },
  {
    filename: '10-周复盘.md',
    frontmatter: { id: 'weekly-review', label: '📅 周复盘', stage: 'general', order: 2, needs_focus: false, output: '00-入口/每日记录', description: '汇总一周知识库变化' },
    body: '请汇总本周知识库变化，范围：{{topic_dir}}、{{script_draft_dir}}、{{review_dir}}。\n输出：\n1. 本周新增选题\n2. 推荐下周优先做的 3 个选题\n3. 当前内容方向的风险\n4. 下一步行动清单\n生成到 00-入口/每日记录/本周复盘-{{date}}.md。',
  },
  {
    filename: '11-从热点+受众生成选题卡.md',
    frontmatter: { id: 'spark-topics', label: '🔥 从热点+受众生成选题卡', stage: '选题', order: 3, needs_focus: false, output: '10-选题池/待评估', description: '热点×受众反馈拼成选题卡' },
    body: '请把下面的热点和受众反馈，整理成 Obsidian 选题卡，放到 {{inbox_dir}}。\n每个选题用 {{topic_template}} 的结构；只做选题判断，不写完整脚本。\n要求：优先选「热点时机」与「受众真实问过的问题」有交集的角度；避免与「已有选题」重复。\n期号规则：新选题卡期号从 {{next_issue}} 开始（已是全库最大期号+1），多个则依次递增；文件名前缀与 frontmatter 的 issue 都用该期号，扫描整个 10-选题池所有子目录确认不重复，不要只看待评估目录。\n\n热点：\n{{hotspots}}\n\n受众反馈：\n{{audience_signals}}\n\n已有选题（不要重复）：\n{{existing_titles}}',
  },
];

export class PromptSeedService {
  constructor(private readonly vault: VaultGateway) {}

  async seed(promptDir: string): Promise<number> {
    const dir = promptDir.replace(/\\/g, '/').replace(/\/+$/, '');
    let written = 0;
    for (const template of TEMPLATES) {
      const path = `${dir}/${template.filename}`;
      if (this.vault.exists(path)) continue;
      await this.vault.create(path, render(template));
      written += 1;
    }
    return written;
  }
}

function render(template: SeedTemplate): string {
  const f = template.frontmatter;
  const front = [
    '---',
    `id: ${f.id}`,
    `label: ${f.label}`,
    `stage: ${f.stage}`,
    `order: ${f.order}`,
    `needs_focus: ${f.needs_focus}`,
    `output: "${f.output}"`,
    `description: ${f.description}`,
    '---',
  ].join('\n');
  return `${front}\n${template.body}\n`;
}
