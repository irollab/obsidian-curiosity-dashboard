import type { Stage } from './stages';

export type WorkflowGroup = Stage | 'general';

export interface WorkflowAction {
  id: string;
  label: string;
  description: string;
  group: WorkflowGroup;
  order: number;
  needsFocus: boolean;
  output: string | null;
  body: string;
  sourcePath: string;
}

export interface PromptFocusContext {
  title: string;
  issue: number;
  topicPath: string;
  scriptPath: string | null;
  reviewPath: string | null;
}

export interface PromptContext {
  focus: PromptFocusContext | null;
  inboxDir: string;
  topicDir: string;
  scriptDraftDir: string;
  assetDir: string;
  reviewDir: string;
  topicTemplate: string;
  scriptTemplate: string;
  reviewTemplate: string;
  date: string;
  week: string;
  ideas: string;
}

const TOKEN = /\{\{(\w+)\}\}/g;

export function fillPlaceholders(body: string, context: PromptContext): string {
  const values = tokenValues(context);
  return body.replace(TOKEN, (match: string, name: string) => {
    const value = values[name];
    return value === undefined ? match : value;
  });
}

function tokenValues(context: PromptContext): Record<string, string> {
  const focus = context.focus;
  return {
    focus_title: focus?.title ?? '',
    focus_issue: focus === null ? '' : String(focus.issue),
    focus_topic: focus?.topicPath ?? '',
    focus_script: focus?.scriptPath ?? '',
    focus_review: focus?.reviewPath ?? '',
    inbox_dir: context.inboxDir,
    topic_dir: context.topicDir,
    script_draft_dir: context.scriptDraftDir,
    asset_dir: context.assetDir,
    review_dir: context.reviewDir,
    topic_template: context.topicTemplate,
    script_template: context.scriptTemplate,
    review_template: context.reviewTemplate,
    date: context.date,
    week: context.week,
    ideas: context.ideas,
  };
}
