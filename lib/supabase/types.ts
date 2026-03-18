export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          client_name: string;
          site_name: string;
          planning_reference: string | null;
          lpa: string;
          boolean_search_terms: string;
          assigned_lead_id: string | null;
          application_stage: string;
          key_dates: Record<string, string>;
          alert_level: string;
          last_scanned_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          site_name: string;
          planning_reference?: string | null;
          lpa: string;
          boolean_search_terms: string;
          assigned_lead_id?: string | null;
          application_stage: string;
          key_dates?: Record<string, string>;
          alert_level?: string;
          last_scanned_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          client_name?: string;
          site_name?: string;
          planning_reference?: string;
          lpa?: string;
          boolean_search_terms?: string;
          assigned_lead_id?: string | null;
          application_stage?: string;
          key_dates?: Record<string, string>;
          alert_level?: string;
          last_scanned_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      analysis_items: {
        Row: {
          id: string;
          project_id: string | null;
          source_text: string;
          source_type: string | null;
          source_url: string | null;
          source_name: string | null;
          published_at: string | null;
          summary: string | null;
          sentiment: string | null;
          alert_level: string | null;
          notable_voices: string[];
          key_themes: string[];
          recommended_action: string | null;
          review_status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          source_text: string;
          source_type?: string | null;
          source_url?: string | null;
          source_name?: string | null;
          published_at?: string | null;
          summary?: string | null;
          sentiment?: string | null;
          alert_level?: string | null;
          notable_voices?: string[];
          key_themes?: string[];
          recommended_action?: string | null;
          review_status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_id?: string | null;
          source_type?: string | null;
          source_url?: string | null;
          source_name?: string | null;
          published_at?: string | null;
          summary?: string | null;
          sentiment?: string | null;
          alert_level?: string | null;
          notable_voices?: string[];
          key_themes?: string[];
          recommended_action?: string | null;
          review_status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          project_id: string;
          report_content: Record<string, unknown>;
          report_text: string;
          week_start: string;
          week_end: string;
          coverage_count: number;
          sentiment_trend: string;
          alert_level: string;
          generated_by: string;
          locked_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          report_content: Record<string, unknown>;
          report_text: string;
          week_start: string;
          week_end: string;
          coverage_count: number;
          sentiment_trend: string;
          alert_level: string;
          generated_by: string;
          locked_at?: string;
          created_at?: string;
        };
        Update: {
          id?: never;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
