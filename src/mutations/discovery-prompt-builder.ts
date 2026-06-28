import type { AudienceSignal, Hotspot } from '@/domain/discovery';
import { fillPlaceholders, type PromptContext, type WorkflowAction } from '@/domain/workflow';
import type { PromptBuildResult } from '@/mutations/prompt-builder-service';
import type { DashboardSettings } from '@/settings';

export interface DiscoveryPromptInput {
  action: WorkflowAction;
  hotspots: Hotspot[];
  signals: AudienceSignal[];
  existingTitles: string[];
  nextIssue: number;
  settings: DashboardSettings;
}

const EMPTY = '（无）';

export function buildDiscoveryPrompt(input: DiscoveryPromptInput): PromptBuildResult {
  const context: PromptContext = {
    focus: null,
    inboxDir: input.settings.topicInboxDir,
    topicDir: input.settings.topicDir,
    scriptDraftDir: input.settings.scriptDraftDir,
    assetDir: input.settings.assetDir,
    reviewDir: input.settings.reviewDir,
    topicTemplate: input.settings.topicTemplate,
    scriptTemplate: input.settings.scriptTemplate,
    reviewTemplate: input.settings.reviewTemplate,
    date: '',
    week: '',
    ideas: '',
    hotspots: formatHotspots(input.hotspots),
    audienceSignals: formatSignals(input.signals),
    existingTitles: formatTitles(input.existingTitles),
    nextIssue: String(input.nextIssue),
  };
  return {
    label: input.action.label,
    text: fillPlaceholders(input.action.body, context),
    output: input.action.output,
  };
}

function formatHotspots(items: Hotspot[]): string {
  if (items.length === 0) return EMPTY;
  return items
    .map((h, i) => {
      const date = h.publishedAt === null ? '' : `（${h.publishedAt}）`;
      const url = h.url.trim().length > 0 ? ` ${h.url}` : '';
      return `${i + 1}. [${h.source}] ${h.title}${date}${url}`;
    })
    .join('\n');
}

function formatSignals(items: AudienceSignal[]): string {
  if (items.length === 0) return EMPTY;
  return items.map((s) => `- (${s.kind}) ${s.text} — ${s.source}`).join('\n');
}

function formatTitles(titles: string[]): string {
  const cleaned = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return EMPTY;
  return cleaned.map((t) => `- ${t}`).join('\n');
}
