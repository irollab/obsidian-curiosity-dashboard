import type { DashboardModel } from '@/domain/models';
import { fillPlaceholders, type PromptContext, type WorkflowAction } from '@/domain/workflow';
import type { DashboardSettings } from '@/settings';

export interface PromptBuildResult {
  label: string;
  text: string;
  output: string | null;
}

export function buildPrompt(
  action: WorkflowAction,
  model: DashboardModel,
  settings: DashboardSettings,
  now: () => Date = () => new Date(),
): PromptBuildResult {
  const date = now();
  const context: PromptContext = {
    focus: focusContext(model),
    inboxDir: settings.topicInboxDir,
    topicDir: settings.topicDir,
    scriptDraftDir: settings.scriptDraftDir,
    assetDir: settings.assetDir,
    reviewDir: settings.reviewDir,
    topicTemplate: settings.topicTemplate,
    scriptTemplate: settings.scriptTemplate,
    reviewTemplate: settings.reviewTemplate,
    date: formatDate(date),
    week: formatWeek(date),
  };
  return { label: action.label, text: fillPlaceholders(action.body, context), output: action.output };
}

function focusContext(model: DashboardModel): PromptContext['focus'] {
  if (model.focus.kind !== 'ready' && model.focus.kind !== 'invalid-stage') return null;
  const topic = model.focus.topic;
  return {
    title: topic.title,
    issue: topic.issue,
    topicPath: topic.path,
    scriptPath: topic.scriptPath,
    reviewPath: topic.reviewPath,
  };
}

function formatDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
