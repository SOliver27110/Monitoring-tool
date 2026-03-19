export type UserRole = 'admin' | 'project_lead' | 'team_member';

export interface AppUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type AlertLevel = 'green' | 'yellow' | 'red';

export type ApplicationStage =
  | 'Pre-app'
  | 'Submitted'
  | 'Consultation'
  | 'Committee'
  | 'Appeal'
  | 'Approved'
  | 'Refused';

export interface KeyDates {
  submission?: string;
  consultation_end?: string;
  committee?: string;
  appeal?: string;
  decision?: string;
}

export interface Project {
  id: string;
  client_name: string;
  site_name: string;
  planning_reference: string | null;
  lpa: string;
  boolean_search_terms: string;
  assigned_lead_id: string | null;
  assigned_lead?: AppUser;
  application_stage: ApplicationStage;
  key_dates: KeyDates;
  alert_level: AlertLevel;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFormData {
  client_name: string;
  site_name: string;
  planning_reference: string | null;
  lpa: string;
  boolean_search_terms: string;
  assigned_lead_id: string | null;
  application_stage: ApplicationStage;
  key_dates: KeyDates;
  alert_level: AlertLevel;
}

export type Sentiment = 'Supportive' | 'Neutral' | 'Opposed' | 'Mixed';

export type ItemAlertLevel = 'Routine' | 'Watch' | 'Action Required';

export type SourceType =
  | 'news_article'
  | 'rss-local'
  | 'social_media'
  | 'committee_report'
  | 'planning_document'
  | 'other';

export type ReviewStatus = 'pending_analysis' | 'unreviewed' | 'approved' | 'dismissed' | 'analysis_failed';

export interface AnalysisResult {
  summary: string;
  sentiment: Sentiment;
  alert_level: ItemAlertLevel;
  notable_voices: string[];
  key_themes: string[];
  recommended_action: string;
  relevant: boolean;
}

export interface AnalysisItem {
  id: string;
  project_id: string | null;
  project?: Project;
  source_text: string;
  source_type: SourceType | null;
  source_url: string | null;
  source_name: string | null;
  published_at: string | null;
  summary: string | null;
  sentiment: Sentiment | null;
  alert_level: ItemAlertLevel | null;
  notable_voices: string[];
  key_themes: string[];
  recommended_action: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SentimentTrend = 'improving' | 'stable' | 'worsening';

export interface Report {
  id: string;
  project_id: string;
  project?: Project;
  report_content: ReportContent;
  report_text: string;
  week_start: string;
  week_end: string;
  coverage_count: number;
  sentiment_trend: SentimentTrend;
  alert_level: string;
  generated_by: string;
  locked_at: string;
  created_at: string;
}

export interface ReportContent {
  client_name: string;
  site_name: string;
  coverage_volume: number;
  sentiment_trend: SentimentTrend;
  alert_level: AlertLevel;
  key_developments: string;
  notable_voices: string[];
  items_requiring_action: string;
  sources_reviewed: string[];
}

export interface ApiError {
  error: string;
  details?: string;
}
