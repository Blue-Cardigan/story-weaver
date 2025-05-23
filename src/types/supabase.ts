export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chapters: {
        Row: {
          additional_notes: string | null
          chapter_number: number
          created_at: string
          id: string
          story_id: string
          style_notes: string | null
          synopsis: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          user_identifier: string | null
        }
        Insert: {
          additional_notes?: string | null
          chapter_number: number
          created_at?: string
          id?: string
          story_id: string
          style_notes?: string | null
          synopsis?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          user_identifier?: string | null
        }
        Update: {
          additional_notes?: string | null
          chapter_number?: number
          created_at?: string
          id?: string
          story_id?: string
          style_notes?: string | null
          synopsis?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          user_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          comment_text: string
          created_at: string
          id: number
          legislation_id: string
          mark_id: string
          resolved_at: string | null
          section_key: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: never
          legislation_id: string
          mark_id: string
          resolved_at?: string | null
          section_key: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: never
          legislation_id?: string
          mark_id?: string
          resolved_at?: string | null
          section_key?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      proposed_changes: {
        Row: {
          context_after: string | null
          context_before: string | null
          created_at: string
          id: number
          legislation_id: string
          legislation_title: string
          original_html: string | null
          proposed_html: string
          section_key: string
          section_title: string
          status: string
          user_id: string
        }
        Insert: {
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          id?: never
          legislation_id: string
          legislation_title: string
          original_html?: string | null
          proposed_html: string
          section_key: string
          section_title: string
          status?: string
          user_id: string
        }
        Update: {
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          id?: never
          legislation_id?: string
          legislation_title?: string
          original_html?: string | null
          proposed_html?: string
          section_key?: string
          section_title?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          created_at: string
          global_additional_notes: string | null
          global_style_note: string | null
          global_synopsis: string | null
          id: string
          structure_type: Database["public"]["Enums"]["story_structure_type"]
          target_length: number | null
          title: string
          updated_at: string
          user_id: string | null
          user_identifier: string | null
        }
        Insert: {
          created_at?: string
          global_additional_notes?: string | null
          global_style_note?: string | null
          global_synopsis?: string | null
          id?: string
          structure_type?: Database["public"]["Enums"]["story_structure_type"]
          target_length?: number | null
          title: string
          updated_at?: string
          user_id?: string | null
          user_identifier?: string | null
        }
        Update: {
          created_at?: string
          global_additional_notes?: string | null
          global_style_note?: string | null
          global_synopsis?: string | null
          id?: string
          structure_type?: Database["public"]["Enums"]["story_structure_type"]
          target_length?: number | null
          title?: string
          updated_at?: string
          user_id?: string | null
          user_identifier?: string | null
        }
        Relationships: []
      }
      story_generations: {
        Row: {
          chapter_id: string | null
          chapter_number: number | null
          context_current_length: number | null
          context_target_length: number | null
          created_at: string
          generated_story: string | null
          global_context_style: string | null
          global_context_synopsis: string | null
          id: string
          is_accepted: boolean | null
          iteration_feedback: string | null
          parent_generation_id: string | null
          part_instructions: string | null
          part_number: number | null
          prompt: string | null
          requested_length: number | null
          story_id: string | null
          style_note: string | null
          synopsis: string | null
          use_web_search: boolean | null
          user_id: string | null
          user_identifier: string | null
        }
        Insert: {
          chapter_id?: string | null
          chapter_number?: number | null
          context_current_length?: number | null
          context_target_length?: number | null
          created_at?: string
          generated_story?: string | null
          global_context_style?: string | null
          global_context_synopsis?: string | null
          id?: string
          is_accepted?: boolean | null
          iteration_feedback?: string | null
          parent_generation_id?: string | null
          part_instructions?: string | null
          part_number?: number | null
          prompt?: string | null
          requested_length?: number | null
          story_id?: string | null
          style_note?: string | null
          synopsis?: string | null
          use_web_search?: boolean | null
          user_id?: string | null
          user_identifier?: string | null
        }
        Update: {
          chapter_id?: string | null
          chapter_number?: number | null
          context_current_length?: number | null
          context_target_length?: number | null
          created_at?: string
          generated_story?: string | null
          global_context_style?: string | null
          global_context_synopsis?: string | null
          id?: string
          is_accepted?: boolean | null
          iteration_feedback?: string | null
          parent_generation_id?: string | null
          part_instructions?: string | null
          part_number?: number | null
          prompt?: string | null
          requested_length?: number | null
          story_id?: string | null
          style_note?: string | null
          synopsis?: string | null
          use_web_search?: boolean | null
          user_id?: string | null
          user_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_generations_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_generations_parent_generation_id_fkey"
            columns: ["parent_generation_id"]
            isOneToOne: false
            referencedRelation: "story_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_generations_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_pending_changes_for_legislation: {
        Args: { p_legislation_id: string }
        Returns: {
          context_after: string | null
          context_before: string | null
          created_at: string
          id: number
          legislation_id: string
          legislation_title: string
          original_html: string | null
          proposed_html: string
          section_key: string
          section_title: string
          status: string
          user_id: string
        }[]
      }
      save_chapters: {
        Args: {
          _story_id: string
          _user_id: string
          _user_identifier: string
          _chapters: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      story_structure_type: "book" | "short_story"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      story_structure_type: ["book", "short_story"],
    },
  },
} as const
