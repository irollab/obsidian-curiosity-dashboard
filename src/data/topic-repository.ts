import type { TopicRecord } from '@/domain/models';
import { normalizeStage } from '@/domain/stages';
import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';

export class TopicRepository {
  constructor(
    private readonly vault: VaultGateway,
    private readonly topicDir: string,
  ) {}

  all(): TopicRecord[] {
    const directory = normalizePath(this.topicDir);
    const prefix = directory.length === 0 ? '' : `${directory}/`;

    return this.vault
      .listMarkdownPaths()
      .map(normalizePath)
      .filter((path) => path.startsWith(prefix))
      .map((path) => this.toTopic(path))
      .filter((topic): topic is TopicRecord => topic !== null);
  }

  productionQueue(): TopicRecord[] {
    return this.all()
      .filter((topic) => topic.status === '已立项' && !topic.homepageFocus)
      .sort(compareTopics);
  }

  thisWeek(now = new Date()): TopicRecord[] {
    const [start, end] = localWeekRange(now);

    return this.all()
      .filter((topic) => {
        if (topic.stage === '复盘' || topic.dueDate === null) return false;
        const due = parseLocalDate(topic.dueDate);
        return due !== null && due >= start && due <= end;
      })
      .sort(compareTopics);
  }

  private toTopic(path: string): TopicRecord | null {
    const frontmatter = this.vault.getFrontmatter(path);
    if (frontmatter?.type !== '选题') return null;

    const basename = path.split('/').at(-1)?.replace(/\.md$/i, '');
    if (basename === undefined) return null;
    const issue = topicIssue(frontmatter, basename);
    if (issue === null) return null;

    return {
      path,
      basename,
      title: stringValue(frontmatter.title) ?? titleFromBasename(basename),
      issue,
      status: stringValue(frontmatter.status) ?? '',
      stage: normalizeStage(frontmatter.stage),
      priority: stringValue(frontmatter.priority),
      dueDate: stringValue(frontmatter.due_date),
      nextAction: stringValue(frontmatter.next_action),
      homepageFocus: frontmatter.homepage_focus === true,
      scriptPath: pathValue(frontmatter.script_path),
      assetPath: pathValue(frontmatter.asset_path),
      reviewPath: pathValue(frontmatter.review_path),
    };
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pathValue(value: unknown): string | null {
  const path = stringValue(value);
  return path === null ? null : normalizePath(path);
}

function topicIssue(frontmatter: Frontmatter, basename: string): number | null {
  if (typeof frontmatter.issue === 'number') {
    return Number.isFinite(frontmatter.issue) ? frontmatter.issue : null;
  }
  const value = Number.parseInt(basename.match(/^(\d+)/)?.[1] ?? '', 10);
  return Number.isFinite(value) ? value : null;
}

function titleFromBasename(basename: string): string {
  return basename.replace(/^\d+(?:期)?(?:[-_\s]+)?/, '');
}

function compareTopics(left: TopicRecord, right: TopicRecord): number {
  if (left.dueDate === null && right.dueDate !== null) return 1;
  if (left.dueDate !== null && right.dueDate === null) return -1;
  const dueOrder = (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
  return dueOrder !== 0 ? dueOrder : left.issue - right.issue;
}

function localWeekRange(now: Date): [Date, Date] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}
