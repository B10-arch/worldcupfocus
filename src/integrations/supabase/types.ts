export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bets: {
        Row: {
          entry_fee: number
          id: string
          placed_at: string
          points: number
          team_id: string
          user_id: string
        }
        Insert: {
          entry_fee?: number
          id?: string
          placed_at?: string
          points?: number
          team_id: string
          user_id: string
        }
        Update: {
          entry_fee?: number
          id?: string
          placed_at?: string
          points?: number
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quiz_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          quiz_date: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          quiz_date: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          quiz_date?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_quiz_attempts_quiz_date_fkey"
            columns: ["quiz_date"]
            isOneToOne: false
            referencedRelation: "daily_quizzes"
            referencedColumns: ["quiz_date"]
          },
        ]
      }
      daily_quizzes: {
        Row: {
          created_at: string
          question_ids: string[]
          quiz_date: string
          trivia_fact_id: string | null
        }
        Insert: {
          created_at?: string
          question_ids: string[]
          quiz_date: string
          trivia_fact_id?: string | null
        }
        Update: {
          created_at?: string
          question_ids?: string[]
          quiz_date?: string
          trivia_fact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_quizzes_trivia_fact_id_fkey"
            columns: ["trivia_fact_id"]
            isOneToOne: false
            referencedRelation: "trivia_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          group_name: string | null
          id: string
          kickoff_utc: string
          score_a: number | null
          score_b: number | null
          stage: string
          status: string
          team_a_id: string | null
          team_b_id: string | null
          time_tbc: boolean
          venue: string | null
          winner_team_id: string | null
        }
        Insert: {
          created_at?: string
          group_name?: string | null
          id?: string
          kickoff_utc: string
          score_a?: number | null
          score_b?: number | null
          stage?: string
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          time_tbc?: boolean
          venue?: string | null
          winner_team_id?: string | null
        }
        Update: {
          created_at?: string
          group_name?: string | null
          id?: string
          kickoff_utc?: string
          score_a?: number | null
          score_b?: number | null
          stage?: string
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          time_tbc?: boolean
          venue?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          payment_status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          payment_status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          payment_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_progress: {
        Row: {
          answered_at: string
          correct: boolean
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          answered_at?: string
          correct: boolean
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          answered_at?: string
          correct?: boolean
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_progress_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_index: number
          created_at: string
          explanation: string | null
          id: string
          last_used_on: string | null
          options: Json
          question: string
          tier: Database["public"]["Enums"]["quiz_tier"]
        }
        Insert: {
          correct_index: number
          created_at?: string
          explanation?: string | null
          id?: string
          last_used_on?: string | null
          options: Json
          question: string
          tier: Database["public"]["Enums"]["quiz_tier"]
        }
        Update: {
          correct_index?: number
          created_at?: string
          explanation?: string | null
          id?: string
          last_used_on?: string | null
          options?: Json
          question?: string
          tier?: Database["public"]["Enums"]["quiz_tier"]
        }
        Relationships: []
      }
      teams: {
        Row: {
          coach: string | null
          code: string
          created_at: string
          fifa_rank: number | null
          flag_emoji: string
          group_name: string | null
          id: string
          is_eliminated: boolean
          name: string
          squad: string[] | null
          wc_form: string | null
        }
        Insert: {
          coach?: string | null
          code: string
          created_at?: string
          fifa_rank?: number | null
          flag_emoji: string
          group_name?: string | null
          id?: string
          is_eliminated?: boolean
          name: string
          squad?: string[] | null
          wc_form?: string | null
        }
        Update: {
          coach?: string | null
          code?: string
          created_at?: string
          fifa_rank?: number | null
          flag_emoji?: string
          group_name?: string | null
          id?: string
          is_eliminated?: boolean
          name?: string
          squad?: string[] | null
          wc_form?: string | null
        }
        Relationships: []
      }
      trivia_facts: {
        Row: {
          body: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard_entries: {
        Row: {
          avatar_url: string | null
          confirmed_at: string | null
          display_name: string | null
          first_placed_at: string | null
          pick_count: number | null
          picks: Json | null
          points: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_npt_date: { Args: never; Returns: string }
      get_daily_quiz: { Args: never; Returns: Json }
      get_total_bet_count: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reveal_daily_quiz_answer: {
        Args: { p_question_id: string }
        Returns: Json
      }
      submit_daily_quiz_attempt: { Args: { p_answers: Json }; Returns: Json }
      submit_quiz_answer: {
        Args: { p_choice: number; p_question_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "member"
      quiz_tier: "beginner" | "professional" | "expertise"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      quiz_tier: ["beginner", "professional", "expertise"],
    },
  },
} as const
