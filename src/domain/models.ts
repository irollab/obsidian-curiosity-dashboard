import type { Stage } from './stages';
import type { WorkflowAction } from './workflow';

export interface TopicRecord {
  path: string;
  basename: string;
  title: string;
  issue: number;
  status: string;
  stage: Stage | null;
  priority: string | null;
  dueDate: string | null;
  nextAction: string | null;
  homepageFocus: boolean;
  scriptPath: string | null;
  assetPath: string | null;
  reviewPath: string | null;
}

export interface ChecklistTask {
  line: number;
  text: string;
  checked: boolean;
}

export interface MetricRow {
  platform: string;
  collectedAt: string | null;
  views: string | null;
  likes: string | null;
  favorites: string | null;
  comments: string | null;
  shares: string | null;
}

export type FocusState =
  | { kind: 'none' }
  | { kind: 'multiple'; topics: TopicRecord[] }
  | { kind: 'invalid-stage'; topic: TopicRecord & { stage: null } }
  | { kind: 'ready'; topic: TopicRecord & { stage: Stage } };

export interface FocusHistoryEntry {
  path: string;
  switchedAt: number;
}

export interface FocusCandidate {
  path: string;
  issue: number;
  title: string;
  stage: Stage | null;
  isActive: boolean;
}

export interface DashboardModel {
  focus: FocusState;
  focusCandidates: FocusCandidate[];
  pickableTopics: TopicRecord[];
  tasks: ChecklistTask[];
  thisWeek: TopicRecord[];
  queue: TopicRecord[];
  metrics: MetricRow[];
  reviewPath: string | null;
  commentEvidence: string[];
  backgroundUrl: string | null;
  mobileReadOnly: boolean;
  associationCandidates: {
    scriptPath: string[];
    assetPath: string[];
    reviewPath: string[];
  };
  workflowActions: WorkflowAction[];
  promptTemplatesPresent: boolean;
  promptTemplatesSkipped: string[];
}
