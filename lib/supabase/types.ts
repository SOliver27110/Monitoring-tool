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
          planning_reference: string;
          lpa: string;
          boolean_search_terms: string;
          exclusion_terms: string;
          assigned_lead_id: string | null;
          application_stage: string;
          key_dates: Record<string, string>;
          alert_level: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          site_name: string;
          planning_reference: string;
          lpa: string;
          boolean_search_terms: string;
          exclusion_terms?: string;
          assigned_lead_id?: string | null;
          application_stage: string;
          key_dates?: Record<string, string>;
          alert_level?: string;
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
          exclusion_terms?: string;
          assigned_lead_id?: string | null;
          application_stage?: string;
          key_dates?: Record<string, string>;
          alert_level?: string;
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
          summary: string;
          sentiment: string;
          alert_level: string;
          notable_voices: string[];
          key_themes: string[];
          recommended_action: string;
          review_status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          match_type: string | null;
          match_reason: string | null;
          confidence_score: number | null;
          needs_review: boolean;
          key_entities: Record<string, string[]>;
          is_new_information: boolean;
          new_information_detail: string | null;
          match_confidence: string | null;
          planning_stage: string | null;
          themes: string[];
          has_full_text: boolean;
          author: string | null;
          image_url: string | null;
          word_count: number | null;
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
          summary: string;
          sentiment: string;
          alert_level: string;
          notable_voices?: string[];
          key_themes?: string[];
          recommended_action: string;
          review_status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          match_type?: string | null;
          match_reason?: string | null;
          confidence_score?: number | null;
          needs_review?: boolean;
          key_entities?: Record<string, string[]>;
          is_new_information?: boolean;
          new_information_detail?: string | null;
          match_confidence?: string | null;
          planning_stage?: string | null;
          themes?: string[];
          has_full_text?: boolean;
          author?: string | null;
          image_url?: string | null;
          word_count?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_id?: string | null;
          source_type?: string | null;
          source_url?: string | null;
          review_status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          match_type?: string | null;
          match_reason?: string | null;
          confidence_score?: number | null;
          needs_review?: boolean;
          key_entities?: Record<string, string[]>;
          is_new_information?: boolean;
          new_information_detail?: string | null;
          match_confidence?: string | null;
          planning_stage?: string | null;
          themes?: string[];
          has_full_text?: boolean;
          author?: string | null;
          image_url?: string | null;
          word_count?: number | null;
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
      feeds: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          url: string;
          feed_type: string;
          is_active: boolean;
          last_fetched_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          url: string;
          feed_type: string;
          is_active?: boolean;
          last_fetched_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          url?: string;
          feed_type?: string;
          is_active?: boolean;
          last_fetched_at?: string | null;
        };
        Relationships: [];
      };
      fetched_articles: {
        Row: {
          id: string;
          feed_id: string | null;
          project_id: string | null;
          title: string;
          excerpt: string | null;
          url: string | null;
          source_name: string | null;
          published_at: string | null;
          guid: string;
          matched_by: string | null;
          status: string;
          analysis_item_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          feed_id?: string | null;
          project_id?: string | null;
          title: string;
          excerpt?: string | null;
          url?: string | null;
          source_name?: string | null;
          published_at?: string | null;
          guid: string;
          matched_by?: string | null;
          status?: string;
          analysis_item_id?: string | null;
          created_at?: string;
        };
        Update: {
          feed_id?: string | null;
          project_id?: string | null;
          title?: string;
          excerpt?: string | null;
          url?: string | null;
          source_name?: string | null;
          published_at?: string | null;
          matched_by?: string | null;
          status?: string;
          analysis_item_id?: string | null;
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
