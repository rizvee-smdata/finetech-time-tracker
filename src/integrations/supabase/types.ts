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
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_visits: {
        Row: {
          company: string | null
          company_id: string | null
          contact_number: string | null
          contact_type: string
          created_at: string
          customer_name: string
          designation: string | null
          discussion_summary: string | null
          email: string | null
          id: string
          location: string | null
          meeting_at: string
          next_action: string | null
          next_meeting_at: string | null
          remarks: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          company_id?: string | null
          contact_number?: string | null
          contact_type?: string
          created_at?: string
          customer_name: string
          designation?: string | null
          discussion_summary?: string | null
          email?: string | null
          id?: string
          location?: string | null
          meeting_at: string
          next_action?: string | null
          next_meeting_at?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          company_id?: string | null
          contact_number?: string | null
          contact_type?: string
          created_at?: string
          customer_name?: string
          designation?: string | null
          discussion_summary?: string | null
          email?: string | null
          id?: string
          location?: string | null
          meeting_at?: string
          next_action?: string | null
          next_meeting_at?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company_id: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          designation: string | null
          email: string | null
          id: string
          kind: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          designation?: string | null
          email?: string | null
          id?: string
          kind?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          designation?: string | null
          email?: string | null
          id?: string
          kind?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string
          id: string
          read_at: string | null
          remind_at: string
          title: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          remind_at: string
          title: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          remind_at?: string
          title?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "customer_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          check_in: string
          check_out: string | null
          company_id: string | null
          created_at: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          check_in?: string
          check_out?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          check_in?: string
          check_out?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_checklist_items: {
        Row: {
          assignee_id: string | null
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          sort_order: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          sort_order?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          sort_order?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_checklist_assignee_fk"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_checklist_done_by_fk"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_checklist_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_comment_reactions_comment_fk"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "tms_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "tms_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_comment_reactions_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_labels: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
          project_id: string | null
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tms_labels_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_labels_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_labels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_milestones: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_milestones_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_milestones_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_milestones_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_notification_prefs: {
        Row: {
          category: string
          digest_mode: string
          email: boolean
          in_app: boolean
          muted_project_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          digest_mode?: string
          email?: boolean
          in_app?: boolean
          muted_project_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          digest_mode?: string
          email?: boolean
          in_app?: boolean
          muted_project_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tms_project_members: {
        Row: {
          added_at: string
          added_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["tms_project_member_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["tms_project_member_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["tms_project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_project_members_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_project_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_projects: {
        Row: {
          archived_at: string | null
          budget_hours: number | null
          color: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          name: string
          owner_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["tms_project_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["tms_project_visibility"]
        }
        Insert: {
          archived_at?: string | null
          budget_hours?: number | null
          color?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          name: string
          owner_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["tms_project_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tms_project_visibility"]
        }
        Update: {
          archived_at?: string | null
          budget_hours?: number | null
          color?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          name?: string
          owner_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["tms_project_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tms_project_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "tms_projects_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_projects_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_projects_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_saved_views: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          is_shared: boolean
          name: string
          updated_at: string
          user_id: string
          view_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean
          name: string
          updated_at?: string
          user_id: string
          view_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_saved_views_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_saved_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_saved_views_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_sprints: {
        Row: {
          capacity_hours: number | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          goal: string | null
          id: string
          name: string
          project_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          capacity_hours?: number | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          goal?: string | null
          id?: string
          name: string
          project_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          capacity_hours?: number | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_sprints_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_sprints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_sprints_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_sprints_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_activity_actor_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_activity_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role: Database["public"]["Enums"]["tms_assignee_role"]
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role?: Database["public"]["Enums"]["tms_assignee_role"]
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role?: Database["public"]["Enums"]["tms_assignee_role"]
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_assignees_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_assignees_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_attachments: {
        Row: {
          comment_id: string | null
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          comment_id?: string | null
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          comment_id?: string | null
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_attachments_comment_fk"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "tms_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_attachments_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_attachments_user_fk"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_comment_id: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_comments_author_fk"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "tms_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_comments_parent_fk"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "tms_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_comments_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          dependency_type: Database["public"]["Enums"]["tms_dependency_type"]
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dependency_type?: Database["public"]["Enums"]["tms_dependency_type"]
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dependency_type?: Database["public"]["Enums"]["tms_dependency_type"]
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_deps_depends_fk"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_deps_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_labels: {
        Row: {
          label_id: string
          task_id: string
        }
        Insert: {
          label_id: string
          task_id: string
        }
        Update: {
          label_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_labels_label_fk"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tms_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tms_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_labels_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_task_statuses: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          is_terminal: boolean
          name: string
          project_id: string | null
          sort_order: number
          wip_limit: number | null
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name: string
          project_id?: string | null
          sort_order?: number
          wip_limit?: number | null
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name?: string
          project_id?: string | null
          sort_order?: number
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tms_task_statuses_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_statuses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_statuses_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_task_statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_tasks: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          is_private: boolean
          is_recurring: boolean
          logged_hours: number
          milestone_id: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["tms_priority"]
          project_id: string | null
          recurrence_count: number | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          sort_order: number
          sprint_id: string | null
          status_id: string | null
          task_type: Database["public"]["Enums"]["tms_task_type"]
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_private?: boolean
          is_recurring?: boolean
          logged_hours?: number
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["tms_priority"]
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          sort_order?: number
          sprint_id?: string | null
          status_id?: string | null
          task_type?: Database["public"]["Enums"]["tms_task_type"]
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_private?: boolean
          is_recurring?: boolean
          logged_hours?: number
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["tms_priority"]
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          sort_order?: number
          sprint_id?: string | null
          status_id?: string | null
          task_type?: Database["public"]["Enums"]["tms_task_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_tasks_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_milestone_fk"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "tms_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "tms_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_parent_fk"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tms_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_sprint_fk"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "tms_sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "tms_sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_status_fk"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "tms_task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "tms_task_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      tms_time_logs: {
        Row: {
          created_at: string
          hours: number
          id: string
          log_date: string
          note: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hours: number
          id?: string
          log_date?: string
          note?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hours?: number
          id?: string
          log_date?: string
          note?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tms_time_logs_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_time_logs_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      tms_can_manage_project: {
        Args: { _project: string; _user: string }
        Returns: boolean
      }
      tms_can_view_project: {
        Args: { _project: string; _user: string }
        Returns: boolean
      }
      tms_can_view_task: {
        Args: { _task_id: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
      tms_assignee_role: "primary" | "collaborator" | "watcher"
      tms_dependency_type:
        | "blocks"
        | "is_blocked_by"
        | "relates_to"
        | "duplicates"
      tms_priority: "critical" | "high" | "medium" | "low"
      tms_project_member_role: "manager" | "member" | "viewer"
      tms_project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "archived"
      tms_project_visibility: "public" | "restricted" | "private"
      tms_task_type: "task" | "bug" | "story" | "milestone"
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
      app_role: ["admin", "manager", "employee"],
      tms_assignee_role: ["primary", "collaborator", "watcher"],
      tms_dependency_type: [
        "blocks",
        "is_blocked_by",
        "relates_to",
        "duplicates",
      ],
      tms_priority: ["critical", "high", "medium", "low"],
      tms_project_member_role: ["manager", "member", "viewer"],
      tms_project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "archived",
      ],
      tms_project_visibility: ["public", "restricted", "private"],
      tms_task_type: ["task", "bug", "story", "milestone"],
    },
  },
} as const
