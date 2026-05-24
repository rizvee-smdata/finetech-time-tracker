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
      attendance_records: {
        Row: {
          check_in_address: string | null
          check_in_at: string | null
          check_in_distance_m: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_within_geofence: boolean | null
          check_out_address: string | null
          check_out_at: string | null
          check_out_distance_m: number | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_within_geofence: boolean | null
          company_id: string
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          total_minutes: number | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          check_in_address?: string | null
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_out_address?: string | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          total_minutes?: number | null
          updated_at?: string
          user_id: string
          work_date?: string
        }
        Update: {
          check_in_address?: string | null
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_out_address?: string | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          total_minutes?: number | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_settings: {
        Row: {
          company_id: string
          created_at: string
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius_m: number | null
          geofence_required: boolean
          half_day_after_minutes: number
          late_threshold_minutes: number
          updated_at: string
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          company_id: string
          created_at?: string
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number | null
          geofence_required?: boolean
          half_day_after_minutes?: number
          late_threshold_minutes?: number
          updated_at?: string
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number | null
          geofence_required?: boolean
          half_day_after_minutes?: number
          late_threshold_minutes?: number
          updated_at?: string
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "company_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_accounts: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          phone: string | null
          primary_owner: string | null
          territory_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          primary_owner?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          primary_owner?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "crm_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_call_logs: {
        Row: {
          called_at: string
          channel: string
          created_at: string
          duration_minutes: number | null
          id: string
          lead_id: string
          notes: string | null
          outcome: Database["public"]["Enums"]["crm_call_outcome"] | null
          user_id: string | null
        }
        Insert: {
          called_at?: string
          channel?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["crm_call_outcome"] | null
          user_id?: string | null
        }
        Update: {
          called_at?: string
          channel?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["crm_call_outcome"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      crm_capture_keys: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          default_assignee: string | null
          default_source: string
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          default_assignee?: string | null
          default_source?: string
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          default_assignee?: string | null
          default_source?: string
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_competitors: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      crm_document_templates: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_lead_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["crm_activity_type"]
          body: string | null
          created_at: string
          id: string
          lead_id: string
          metadata: Json
          occurred_at: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["crm_activity_type"]
          body?: string | null
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json
          occurred_at?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["crm_activity_type"]
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
          occurred_at?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          lead_id: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          lead_id: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          lead_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_products: {
        Row: {
          added_at: string
          lead_id: string
          product_id: string
        }
        Insert: {
          added_at?: string
          lead_id: string
          product_id: string
        }
        Update: {
          added_at?: string
          lead_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          duration_seconds: number | null
          from_stage: Database["public"]["Enums"]["crm_lead_stage"] | null
          id: string
          lead_id: string
          to_stage: Database["public"]["Enums"]["crm_lead_stage"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          duration_seconds?: number | null
          from_stage?: Database["public"]["Enums"]["crm_lead_stage"] | null
          id?: string
          lead_id: string
          to_stage: Database["public"]["Enums"]["crm_lead_stage"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          duration_seconds?: number | null
          from_stage?: Database["public"]["Enums"]["crm_lead_stage"] | null
          id?: string
          lead_id?: string
          to_stage?: Database["public"]["Enums"]["crm_lead_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          company_id: string
          company_name: string | null
          competitor_name: string | null
          competitor_notes: string | null
          competitor_price: number | null
          contact_person: string | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string | null
          customer_name: string
          designation: string | null
          email: string | null
          expected_close_date: string | null
          expected_value: number | null
          id: string
          is_renewal: boolean
          last_activity_at: string
          lead_source: Database["public"]["Enums"]["crm_lead_source_v2"]
          location: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          parent_lead_id: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["crm_priority"]
          probability: number
          renewal_date: string | null
          renewal_kind: Database["public"]["Enums"]["crm_renewal_kind"]
          source: Database["public"]["Enums"]["crm_lead_source"]
          source_visit_id: string | null
          stage: Database["public"]["Enums"]["crm_lead_stage"]
          stage_changed_at: string
          territory_id: string | null
          updated_at: string
          won_at: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          company_id: string
          company_name?: string | null
          competitor_name?: string | null
          competitor_notes?: string | null
          competitor_price?: number | null
          contact_person?: string | null
          created_at?: string
          created_by: string
          currency?: string
          customer_id?: string | null
          customer_name: string
          designation?: string | null
          email?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          is_renewal?: boolean
          last_activity_at?: string
          lead_source?: Database["public"]["Enums"]["crm_lead_source_v2"]
          location?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          parent_lead_id?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"]
          probability?: number
          renewal_date?: string | null
          renewal_kind?: Database["public"]["Enums"]["crm_renewal_kind"]
          source?: Database["public"]["Enums"]["crm_lead_source"]
          source_visit_id?: string | null
          stage?: Database["public"]["Enums"]["crm_lead_stage"]
          stage_changed_at?: string
          territory_id?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          company_id?: string
          company_name?: string | null
          competitor_name?: string | null
          competitor_notes?: string | null
          competitor_price?: number | null
          contact_person?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string
          designation?: string | null
          email?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          is_renewal?: boolean
          last_activity_at?: string
          lead_source?: Database["public"]["Enums"]["crm_lead_source_v2"]
          location?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          parent_lead_id?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"]
          probability?: number
          renewal_date?: string | null
          renewal_kind?: Database["public"]["Enums"]["crm_renewal_kind"]
          source?: Database["public"]["Enums"]["crm_lead_source"]
          source_visit_id?: string | null
          stage?: Database["public"]["Enums"]["crm_lead_stage"]
          stage_changed_at?: string
          territory_id?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_parent_lead_id_fkey"
            columns: ["parent_lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "crm_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_message_templates: {
        Row: {
          body: string
          channel: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_products: {
        Row: {
          base_price: number
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_quote_line_items: {
        Row: {
          created_at: string
          discount_pct: number
          id: string
          name: string
          product_id: string | null
          quantity: number
          quote_id: string
          sort_order: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount_pct?: number
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_quote_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "crm_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_quotes: {
        Row: {
          amount: number
          approval_comment: string | null
          approval_requested_at: string | null
          approval_requested_by: string | null
          approval_status: Database["public"]["Enums"]["crm_approval_status"]
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          discount_pct: number
          file_name: string | null
          file_path: string | null
          id: string
          lead_id: string
          notes: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["crm_quote_status"]
          subtotal: number
          tax_pct: number
          title: string
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          amount?: number
          approval_comment?: string | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_status?: Database["public"]["Enums"]["crm_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          discount_pct?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["crm_quote_status"]
          subtotal?: number
          tax_pct?: number
          title: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          amount?: number
          approval_comment?: string | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_status?: Database["public"]["Enums"]["crm_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          discount_pct?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["crm_quote_status"]
          subtotal?: number
          tax_pct?: number
          title?: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_saved_views: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          is_shared: boolean
          name: string
          updated_at: string
          user_id: string
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
        }
        Relationships: []
      }
      crm_sequence_enrollments: {
        Row: {
          completed_at: string | null
          current_step: number
          enrolled_at: string
          enrolled_by: string | null
          id: string
          lead_id: string
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          lead_id: string
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          lead_id?: string
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_steps: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          day_offset: number
          id: string
          sequence_id: string
          step_order: number
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          day_offset?: number
          id?: string
          sequence_id: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          day_offset?: number
          id?: string
          sequence_id?: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequences: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_targets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          period_month: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          period_month: string
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          period_month?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_territories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
      expense_approver_assignments: {
        Row: {
          approver_id: string
          company_id: string
          created_at: string
          id: string
          rep_id: string
        }
        Insert: {
          approver_id: string
          company_id: string
          created_at?: string
          id?: string
          rep_id: string
        }
        Update: {
          approver_id?: string
          company_id?: string
          created_at?: string
          id?: string
          rep_id?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          auto_approve_limit: number | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          auto_approve_limit?: number | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auto_approve_limit?: number | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string
          company_id: string
          created_at: string
          currency: string
          description: string | null
          expense_date: string
          id: string
          lead_id: string | null
          receipt_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_comment: string | null
          status: Database["public"]["Enums"]["expense_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          category_name: string
          company_id: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          lead_id?: string | null
          receipt_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string
          company_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          lead_id?: string | null
          receipt_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
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
      targets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          metric: Database["public"]["Enums"]["target_metric"]
          notes: string | null
          period_end: string
          period_kind: Database["public"]["Enums"]["target_period_kind"]
          period_start: string
          scope: Database["public"]["Enums"]["target_scope"]
          target_value: number
          territory_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          metric: Database["public"]["Enums"]["target_metric"]
          notes?: string | null
          period_end: string
          period_kind?: Database["public"]["Enums"]["target_period_kind"]
          period_start: string
          scope: Database["public"]["Enums"]["target_scope"]
          target_value: number
          territory_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          metric?: Database["public"]["Enums"]["target_metric"]
          notes?: string | null
          period_end?: string
          period_kind?: Database["public"]["Enums"]["target_period_kind"]
          period_start?: string
          scope?: Database["public"]["Enums"]["target_scope"]
          target_value?: number
          territory_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "crm_territories"
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
            foreignKeyName: "tms_checklist_assignee_fk"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_checklist_done_by_fk"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_checklist_items_task_id_fkey"
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
          {
            foreignKeyName: "tms_comment_reactions_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            foreignKeyName: "tms_milestones_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          {
            foreignKeyName: "tms_project_members_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_projects_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_projects_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tms_projects_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          {
            foreignKeyName: "tms_saved_views_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_sprints_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_task_activity_actor_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          {
            foreignKeyName: "tms_task_assignees_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          {
            foreignKeyName: "tms_task_attachments_user_fk"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_task_comments_author_fk"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tms_labels"
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
            foreignKeyName: "tms_task_statuses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          lead_id: string | null
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
          lead_id?: string | null
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
          lead_id?: string | null
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
            foreignKeyName: "tms_tasks_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            foreignKeyName: "tms_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tms_tasks"
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
            foreignKeyName: "tms_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "tms_sprints"
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
          {
            foreignKeyName: "tms_time_logs_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
      profiles_public: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      crm_can_view_lead: {
        Args: { _lead: string; _user: string }
        Returns: boolean
      }
      crm_generate_renewal_leads: { Args: never; Returns: undefined }
      crm_remind_idle_leads: { Args: never; Returns: undefined }
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
      attendance_status: "present" | "late" | "absent" | "half_day" | "leave"
      crm_activity_type:
        | "note"
        | "call"
        | "email"
        | "meeting"
        | "visit"
        | "stage_change"
        | "task"
        | "quote"
        | "attachment"
        | "created"
      crm_approval_status: "not_requested" | "pending" | "approved" | "rejected"
      crm_call_outcome:
        | "interested"
        | "follow_up"
        | "not_interested"
        | "no_answer"
      crm_lead_source: "visit" | "manual"
      crm_lead_source_v2:
        | "visit"
        | "referral"
        | "inbound"
        | "cold_call"
        | "manual"
        | "other"
      crm_lead_stage:
        | "new"
        | "initial_contact"
        | "pricing"
        | "negotiation"
        | "closure"
        | "won"
        | "lost"
      crm_priority: "low" | "medium" | "high"
      crm_quote_status: "draft" | "sent" | "accepted" | "rejected"
      crm_renewal_kind: "one_time" | "amc" | "subscription" | "retainer"
      expense_status: "draft" | "submitted" | "approved" | "rejected"
      target_metric:
        | "revenue"
        | "visits"
        | "new_leads"
        | "won_leads"
        | "quotes_sent"
        | "meetings"
      target_period_kind: "monthly" | "quarterly" | "yearly" | "custom"
      target_scope: "user" | "territory" | "company"
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
      attendance_status: ["present", "late", "absent", "half_day", "leave"],
      crm_activity_type: [
        "note",
        "call",
        "email",
        "meeting",
        "visit",
        "stage_change",
        "task",
        "quote",
        "attachment",
        "created",
      ],
      crm_approval_status: ["not_requested", "pending", "approved", "rejected"],
      crm_call_outcome: [
        "interested",
        "follow_up",
        "not_interested",
        "no_answer",
      ],
      crm_lead_source: ["visit", "manual"],
      crm_lead_source_v2: [
        "visit",
        "referral",
        "inbound",
        "cold_call",
        "manual",
        "other",
      ],
      crm_lead_stage: [
        "new",
        "initial_contact",
        "pricing",
        "negotiation",
        "closure",
        "won",
        "lost",
      ],
      crm_priority: ["low", "medium", "high"],
      crm_quote_status: ["draft", "sent", "accepted", "rejected"],
      crm_renewal_kind: ["one_time", "amc", "subscription", "retainer"],
      expense_status: ["draft", "submitted", "approved", "rejected"],
      target_metric: [
        "revenue",
        "visits",
        "new_leads",
        "won_leads",
        "quotes_sent",
        "meetings",
      ],
      target_period_kind: ["monthly", "quarterly", "yearly", "custom"],
      target_scope: ["user", "territory", "company"],
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
