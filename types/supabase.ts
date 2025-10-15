export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      pair_values: {
        Row: {
          id: number;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fixed_costs: {
        Row: {
          id: string;
          description: string;
          date: string;
          value: number;
          recurrence: string;
          tag: string;
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          created_by_avatar_url: string | null;
        };
        Insert: {
          id?: string;
          description: string;
          date: string;
          value: number;
          recurrence: string;
          tag: string;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Update: {
          id?: string;
          description?: string;
          date?: string;
          value?: number;
          recurrence?: string;
          tag?: string;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Relationships: [];
      };
      variable_costs: {
        Row: {
          id: string;
          description: string;
          date: string;
          value: number;
          recurrence: string;
          tag: string;
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          created_by_avatar_url: string | null;
        };
        Insert: {
          id?: string;
          description: string;
          date: string;
          value: number;
          recurrence: string;
          tag: string;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Update: {
          id?: string;
          description?: string;
          date?: string;
          value?: number;
          recurrence?: string;
          tag?: string;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Relationships: [];
      };
      direct_costs: {
        Row: {
          id: string;
          name: string;
          value_per_pair: number;
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          created_by_avatar_url: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          value_per_pair: number;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          value_per_pair?: number;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Relationships: [];
      };
      taxes: {
        Row: {
          id: string;
          name: string;
          percentage: number;
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          created_by_avatar_url: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          percentage: number;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          percentage?: number;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          email: string;
          role: "owner" | "admin" | "user" | "manager" | "partners-media";
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          approved: boolean | null;
          assigned_brand: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "owner" | "admin" | "user" | "manager" | "partners-media";
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          approved?: boolean | null;
          assigned_brand?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "owner" | "admin" | "user" | "manager" | "partners-media";
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          approved?: boolean | null;
          assigned_brand?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      designer_mockups_cache: {
        Row: {
          id: string;
          nome_negocio: string;
          etapa_funil: string;
          designer: string;
          atualizado_em_raw: string | null;
          atualizado_em: string | null;
          is_mockup_feito: boolean;
          is_alteracao: boolean;
          last_synced_at: string;
          sync_status: "synced" | "pending" | "error" | "deleted";
          sync_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome_negocio: string;
          etapa_funil: string;
          designer: string;
          atualizado_em_raw?: string | null;
          atualizado_em?: string | null;
          is_mockup_feito?: boolean;
          is_alteracao?: boolean;
          last_synced_at?: string;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome_negocio?: string;
          etapa_funil?: string;
          designer?: string;
          atualizado_em_raw?: string | null;
          atualizado_em?: string | null;
          is_mockup_feito?: boolean;
          is_alteracao?: boolean;
          last_synced_at?: string;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      designer_mockups_sync_log: {
        Row: {
          id: string;
          sync_type: string;
          status: "running" | "completed" | "failed";
          date_range_start: string | null;
          date_range_end: string | null;
          total_records: number;
          processed_records: number;
          new_records: number;
          updated_records: number;
          error_records: number;
          started_at: string;
          completed_at: string | null;
          duration_seconds: number | null;
          error_message: string | null;
          error_details: Json | null;
          triggered_by: string;
          google_sheets_id: string | null;
          google_sheets_range: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_type?: string;
          status: "running" | "completed" | "failed";
          date_range_start?: string | null;
          date_range_end?: string | null;
          total_records?: number;
          processed_records?: number;
          new_records?: number;
          updated_records?: number;
          error_records?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          triggered_by?: string;
          google_sheets_id?: string | null;
          google_sheets_range?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sync_type?: string;
          status?: "running" | "completed" | "failed";
          date_range_start?: string | null;
          date_range_end?: string | null;
          total_records?: number;
          processed_records?: number;
          new_records?: number;
          updated_records?: number;
          error_records?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          triggered_by?: string;
          google_sheets_id?: string | null;
          google_sheets_range?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      deals_cache: {
        Row: {
          id: string;
          deal_id: string;
          title: string;
          value: number;
          currency: string;
          status: string | null;
          stage_id: string | null;
          closing_date: string | null;
          created_date: string | null;
          custom_field_value: string | null;
          custom_field_id: string | null;
          estado: string | null;
          "quantidade-de-pares": string | null;
          vendedor: string | null;
          designer: string | null;
          "utm-source": string | null;
          "utm-medium": string | null;
          contact_id: string | null;
          organization_id: string | null;
          last_synced_at: string;
          api_updated_at: string | null;
          sync_status: "synced" | "pending" | "error" | "deleted";
          sync_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          title: string;
          value: number;
          currency?: string;
          status?: string | null;
          stage_id?: string | null;
          closing_date?: string | null;
          created_date?: string | null;
          custom_field_value?: string | null;
          custom_field_id?: string | null;
          estado?: string | null;
          "quantidade-de-pares"?: string | null;
          vendedor?: string | null;
          designer?: string | null;
          "utm-source"?: string | null;
          "utm-medium"?: string | null;
          contact_id?: string | null;
          organization_id?: string | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          title?: string;
          value?: number;
          currency?: string;
          status?: string | null;
          stage_id?: string | null;
          closing_date?: string | null;
          created_date?: string | null;
          custom_field_value?: string | null;
          custom_field_id?: string | null;
          estado?: string | null;
          "quantidade-de-pares"?: string | null;
          vendedor?: string | null;
          designer?: string | null;
          "utm-source"?: string | null;
          "utm-medium"?: string | null;
          contact_id?: string | null;
          organization_id?: string | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deals_sync_log: {
        Row: {
          id: string;
          sync_started_at: string;
          sync_completed_at: string | null;
          sync_status: "running" | "completed" | "failed";
          deals_processed: number;
          deals_added: number;
          deals_updated: number;
          deals_deleted: number;
          error_message: string | null;
          sync_duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_started_at?: string;
          sync_completed_at?: string | null;
          sync_status?: "running" | "completed" | "failed";
          deals_processed?: number;
          deals_added?: number;
          deals_updated?: number;
          deals_deleted?: number;
          error_message?: string | null;
          sync_duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sync_started_at?: string;
          sync_completed_at?: string | null;
          sync_status?: "running" | "completed" | "failed";
          deals_processed?: number;
          deals_added?: number;
          deals_updated?: number;
          deals_deleted?: number;
          error_message?: string | null;
          sync_duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          title: string;
          description: string;
          created_date: string;
          start_date: string;
          end_date: string;
          general_goal_value: number | null;
          individual_goal_value: number | null;
          goal_type: "total_sales" | "pairs_sold";
          target_type: "sellers" | "designers";
          status: "active" | "archived";
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          created_by_avatar_url: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          created_date?: string;
          start_date: string;
          end_date: string;
          general_goal_value?: number | null;
          individual_goal_value?: number | null;
          goal_type: "total_sales" | "pairs_sold";
          target_type: "sellers" | "designers";
          status?: "active" | "archived";
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          created_date?: string;
          start_date?: string;
          end_date?: string;
          general_goal_value?: number | null;
          individual_goal_value?: number | null;
          goal_type?: "total_sales" | "pairs_sold";
          target_type?: "sellers" | "designers";
          status?: "active" | "archived";
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_by_email?: string | null;
          created_by_avatar_url?: string | null;
        };
        Relationships: [];
      };
      nuvemshop_orders: {
        Row: {
          id: string;
          order_id: string;
          order_number: string | null;
          completed_at: string | null;
          created_at_nuvemshop: string | null;
          contact_name: string | null;
          shipping_address: Json | null;
          province: string | null;
          products: Json | null;
          subtotal: number | null;
          shipping_cost_customer: number | null;
          coupon: string | null;
          promotional_discount: number | null;
          total_discount_amount: number | null;
          discount_coupon: number | null;
          discount_gateway: number | null;
          total: number | null;
          payment_details: Json | null;
          payment_method: string | null;
          payment_status: string | null;
          status: string | null;
          fulfillment_status: string | null;
          last_synced_at: string;
          api_updated_at: string | null;
          sync_status: "synced" | "pending" | "error" | "deleted";
          sync_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_number?: string | null;
          completed_at?: string | null;
          created_at_nuvemshop?: string | null;
          contact_name?: string | null;
          shipping_address?: Json | null;
          province?: string | null;
          products?: Json | null;
          subtotal?: number | null;
          shipping_cost_customer?: number | null;
          coupon?: string | null;
          promotional_discount?: number | null;
          total_discount_amount?: number | null;
          discount_coupon?: number | null;
          discount_gateway?: number | null;
          total?: number | null;
          payment_details?: Json | null;
          payment_method?: string | null;
          payment_status?: string | null;
          status?: string | null;
          fulfillment_status?: string | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_number?: string | null;
          completed_at?: string | null;
          created_at_nuvemshop?: string | null;
          contact_name?: string | null;
          shipping_address?: Json | null;
          province?: string | null;
          products?: Json | null;
          subtotal?: number | null;
          shipping_cost_customer?: number | null;
          coupon?: string | null;
          promotional_discount?: number | null;
          total_discount_amount?: number | null;
          discount_coupon?: number | null;
          discount_gateway?: number | null;
          total?: number | null;
          payment_details?: Json | null;
          payment_method?: string | null;
          payment_status?: string | null;
          status?: string | null;
          fulfillment_status?: string | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      nuvemshop_products: {
        Row: {
          id: string;
          product_id: string;
          name: Json | null;
          name_pt: string | null;
          brand: string | null;
          description: string | null;
          handle: string | null;
          canonical_url: string | null;
          variants: Json | null;
          images: Json | null;
          featured_image_id: string | null;
          featured_image_src: string | null;
          published: boolean | null;
          free_shipping: boolean | null;
          seo_title: string | null;
          seo_description: string | null;
          tags: string[] | null;
          last_synced_at: string;
          api_updated_at: string | null;
          sync_status: "synced" | "pending" | "error" | "deleted";
          sync_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name?: Json | null;
          name_pt?: string | null;
          brand?: string | null;
          description?: string | null;
          handle?: string | null;
          variants?: Json | null;
          images?: Json | null;
          featured_image_id?: string | null;
          featured_image_src?: string | null;
          published?: boolean | null;
          free_shipping?: boolean | null;
          seo_title?: string | null;
          seo_description?: string | null;
          tags?: string[] | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: Json | null;
          name_pt?: string | null;
          brand?: string | null;
          description?: string | null;
          handle?: string | null;
          variants?: Json | null;
          images?: Json | null;
          featured_image_id?: string | null;
          featured_image_src?: string | null;
          published?: boolean | null;
          free_shipping?: boolean | null;
          seo_title?: string | null;
          seo_description?: string | null;
          tags?: string[] | null;
          last_synced_at?: string;
          api_updated_at?: string | null;
          sync_status?: "synced" | "pending" | "error" | "deleted";
          sync_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_payments: {
        Row: {
          id: string;
          brand: string;
          partner_user_id: string | null;
          amount: number;
          payment_date: string;
          description: string | null;
          payment_method: string;
          payment_reference: string | null;
          created_by: string | null;
          updated_by: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand: string;
          partner_user_id?: string | null;
          amount: number;
          payment_date: string;
          description?: string | null;
          payment_method?: string;
          payment_reference?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand?: string;
          partner_user_id?: string | null;
          amount?: number;
          payment_date?: string;
          description?: string | null;
          payment_method?: string;
          payment_reference?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_payments_partner_user_id_fkey";
            columns: ["partner_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_payments_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      partners_commission_settings: {
        Row: {
          id: string;
          percentage: number;
          brand: string;
          updated_by: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          percentage?: number;
          brand: string;
          updated_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          percentage?: number;
          brand?: string;
          updated_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "partners_commission_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      nuvemshop_sync_log: {
        Row: {
          id: string;
          sync_type: "orders" | "products" | "full";
          status: "running" | "completed" | "failed";
          total_records: number | null;
          processed_records: number | null;
          new_records: number | null;
          updated_records: number | null;
          error_records: number | null;
          started_at: string;
          completed_at: string | null;
          duration_seconds: number | null;
          error_message: string | null;
          error_details: Json | null;
          triggered_by: string | null;
          api_rate_limit_remaining: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_type: "orders" | "products" | "full";
          status?: "running" | "completed" | "failed";
          total_records?: number | null;
          processed_records?: number | null;
          new_records?: number | null;
          updated_records?: number | null;
          error_records?: number | null;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          triggered_by?: string | null;
          api_rate_limit_remaining?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sync_type?: "orders" | "products" | "full";
          status?: "running" | "completed" | "failed";
          total_records?: number | null;
          processed_records?: number | null;
          new_records?: number | null;
          updated_records?: number | null;
          error_records?: number | null;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          triggered_by?: string | null;
          api_rate_limit_remaining?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      nuvemshop_webhooks: {
        Row: {
          id: string;
          webhook_id: string | null;
          event: string;
          url: string;
          status: "active" | "inactive" | "error";
          is_registered: boolean;
          description: string | null;
          created_by: string | null;
          last_error: string | null;
          error_count: number;
          last_error_at: string | null;
          created_at: string;
          updated_at: string;
          registered_at: string | null;
          last_received_at: string | null;
        };
        Insert: {
          id?: string;
          webhook_id?: string | null;
          event: string;
          url: string;
          status?: "active" | "inactive" | "error";
          is_registered?: boolean;
          description?: string | null;
          created_by?: string | null;
          last_error?: string | null;
          error_count?: number;
          last_error_at?: string | null;
          created_at?: string;
          updated_at?: string;
          registered_at?: string | null;
          last_received_at?: string | null;
        };
        Update: {
          id?: string;
          webhook_id?: string | null;
          event?: string;
          url?: string;
          status?: "active" | "inactive" | "error";
          is_registered?: boolean;
          description?: string | null;
          created_by?: string | null;
          last_error?: string | null;
          error_count?: number;
          last_error_at?: string | null;
          created_at?: string;
          updated_at?: string;
          registered_at?: string | null;
          last_received_at?: string | null;
        };
        Relationships: [];
      };
      nuvemshop_webhook_logs: {
        Row: {
          id: string;
          event: string;
          webhook_id: string | null;
          store_id: string;
          resource_id: string;
          status:
            | "received"
            | "processing"
            | "processed"
            | "failed"
            | "ignored";
          processing_started_at: string | null;
          processing_completed_at: string | null;
          processing_duration_ms: number | null;
          headers: Json | null;
          payload: Json;
          hmac_signature: string | null;
          hmac_verified: boolean;
          result_data: Json | null;
          error_message: string | null;
          error_details: Json | null;
          retry_count: number;
          received_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event: string;
          webhook_id?: string | null;
          store_id: string;
          resource_id: string;
          status?:
            | "received"
            | "processing"
            | "processed"
            | "failed"
            | "ignored";
          processing_started_at?: string | null;
          processing_completed_at?: string | null;
          processing_duration_ms?: number | null;
          headers?: Json | null;
          payload: Json;
          hmac_signature?: string | null;
          hmac_verified?: boolean;
          result_data?: Json | null;
          error_message?: string | null;
          error_details?: Json | null;
          retry_count?: number;
          received_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event?: string;
          webhook_id?: string | null;
          store_id?: string;
          resource_id?: string;
          status?:
            | "received"
            | "processing"
            | "processed"
            | "failed"
            | "ignored";
          processing_started_at?: string | null;
          processing_completed_at?: string | null;
          processing_duration_ms?: number | null;
          headers?: Json | null;
          payload?: Json;
          hmac_signature?: string | null;
          hmac_verified?: boolean;
          result_data?: Json | null;
          error_message?: string | null;
          error_details?: Json | null;
          retry_count?: number;
          received_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nuvemshop_webhook_logs_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "nuvemshop_webhooks";
            referencedColumns: ["id"];
          }
        ];
      };
      nuvemshop_webhook_stats: {
        Row: {
          id: string;
          date: string;
          event: string;
          total_received: number;
          total_processed: number;
          total_failed: number;
          total_ignored: number;
          avg_processing_time_ms: number | null;
          min_processing_time_ms: number | null;
          max_processing_time_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          event: string;
          total_received?: number;
          total_processed?: number;
          total_failed?: number;
          total_ignored?: number;
          avg_processing_time_ms?: number | null;
          min_processing_time_ms?: number | null;
          max_processing_time_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          event?: string;
          total_received?: number;
          total_processed?: number;
          total_failed?: number;
          total_ignored?: number;
          avg_processing_time_ms?: number | null;
          min_processing_time_ms?: number | null;
          max_processing_time_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      Insert: {
        id?: string;
        sync_type: "orders" | "products" | "full";
        status: "running" | "completed" | "failed";
        total_records?: number | null;
        processed_records?: number | null;
        new_records?: number | null;
        updated_records?: number | null;
        error_records?: number | null;
        started_at?: string;
        completed_at?: string | null;
        duration_seconds?: number | null;
        error_message?: string | null;
        error_details?: Json | null;
        triggered_by?: string | null;
        api_rate_limit_remaining?: number | null;
        created_at?: string;
      };
      Update: {
        id?: string;
        sync_type?: "orders" | "products" | "full";
        status?: "running" | "completed" | "failed";
        total_records?: number | null;
        processed_records?: number | null;
        new_records?: number | null;
        updated_records?: number | null;
        error_records?: number | null;
        started_at?: string;
        completed_at?: string | null;
        duration_seconds?: number | null;
        error_message?: string | null;
        error_details?: Json | null;
        triggered_by?: string | null;
        api_rate_limit_remaining?: number | null;
        created_at?: string;
      };
      Relationships: [];
    };
    notifications: {
      Row: {
        id: string;
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "error" | "sale";
        data: any;
        created_by_user_id: string | null;
        created_by_name: string | null;
        created_by_email: string | null;
        target_type: "role" | "user" | "brand_partners";
        target_roles: string[] | null;
        target_user_ids: string[] | null;
        target_brand: string | null;
        status: "draft" | "sent" | "failed";
        sent_at: string | null;
        send_push: boolean;
        push_sent_count: number;
        push_failed_count: number;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "error" | "sale";
        data?: any;
        created_by_user_id?: string | null;
        created_by_name?: string | null;
        created_by_email?: string | null;
        target_type: "role" | "user" | "brand_partners";
        target_roles?: string[] | null;
        target_user_ids?: string[] | null;
        target_brand?: string | null;
        status?: "draft" | "sent" | "failed";
        sent_at?: string | null;
        send_push?: boolean;
        push_sent_count?: number;
        push_failed_count?: number;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        title?: string;
        message?: string;
        type?: "info" | "success" | "warning" | "error" | "sale";
        data?: any;
        created_by_user_id?: string | null;
        created_by_name?: string | null;
        created_by_email?: string | null;
        target_type?: "role" | "user" | "brand_partners";
        target_roles?: string[] | null;
        target_user_ids?: string[] | null;
        target_brand?: string | null;
        status?: "draft" | "sent" | "failed";
        sent_at?: string | null;
        send_push?: boolean;
        push_sent_count?: number;
        push_failed_count?: number;
        created_at?: string;
        updated_at?: string;
      };
      Relationships: [
        {
          foreignKeyName: "notifications_created_by_user_id_fkey";
          columns: ["created_by_user_id"];
          referencedRelation: "user_profiles";
          referencedColumns: ["id"];
        }
      ];
    };
    user_notifications: {
      Row: {
        id: string;
        notification_id: string;
        user_id: string;
        is_read: boolean;
        read_at: string | null;
        push_sent: boolean;
        push_sent_at: string | null;
        push_error: string | null;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        notification_id: string;
        user_id: string;
        is_read?: boolean;
        read_at?: string | null;
        push_sent?: boolean;
        push_sent_at?: string | null;
        push_error?: string | null;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        notification_id?: string;
        user_id?: string;
        is_read?: boolean;
        read_at?: string | null;
        push_sent?: boolean;
        push_sent_at?: string | null;
        push_error?: string | null;
        created_at?: string;
        updated_at?: string;
      };
      Relationships: [
        {
          foreignKeyName: "user_notifications_notification_id_fkey";
          columns: ["notification_id"];
          referencedRelation: "notifications";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "user_notifications_user_id_fkey";
          columns: ["user_id"];
          referencedRelation: "user_profiles";
          referencedColumns: ["id"];
        }
      ];
    };
    push_subscriptions: {
      Row: {
        id: string;
        user_id: string;
        endpoint: string;
        p256dh_key: string;
        auth_key: string;
        user_agent: string | null;
        device_type: string | null;
        browser_name: string | null;
        is_active: boolean;
        last_used_at: string;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        user_id: string;
        endpoint: string;
        p256dh_key: string;
        auth_key: string;
        user_agent?: string | null;
        device_type?: string | null;
        browser_name?: string | null;
        is_active?: boolean;
        last_used_at?: string;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        user_id?: string;
        endpoint?: string;
        p256dh_key?: string;
        auth_key?: string;
        user_agent?: string | null;
        device_type?: string | null;
        browser_name?: string | null;
        is_active?: boolean;
        last_used_at?: string;
        created_at?: string;
        updated_at?: string;
      };
      Relationships: [
        {
          foreignKeyName: "push_subscriptions_user_id_fkey";
          columns: ["user_id"];
          referencedRelation: "user_profiles";
          referencedColumns: ["id"];
        }
      ];
    };
    notification_settings: {
      Row: {
        id: string;
        user_id: string | null;
        enable_push_notifications: boolean;
        enable_sale_notifications: boolean;
        enable_admin_notifications: boolean;
        enable_system_notifications: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        quiet_hours_timezone: string;
        max_notifications_per_hour: number;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        user_id?: string | null;
        enable_push_notifications?: boolean;
        enable_sale_notifications?: boolean;
        enable_admin_notifications?: boolean;
        enable_system_notifications?: boolean;
        quiet_hours_start?: string | null;
        quiet_hours_end?: string | null;
        quiet_hours_timezone?: string;
        max_notifications_per_hour?: number;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        user_id?: string | null;
        enable_push_notifications?: boolean;
        enable_sale_notifications?: boolean;
        enable_admin_notifications?: boolean;
        enable_system_notifications?: boolean;
        quiet_hours_start?: string | null;
        quiet_hours_end?: string | null;
        quiet_hours_timezone?: string;
        max_notifications_per_hour?: number;
        created_at?: string;
        updated_at?: string;
      };
      Relationships: [
        {
          foreignKeyName: "notification_settings_user_id_fkey";
          columns: ["user_id"];
          referencedRelation: "user_profiles";
          referencedColumns: ["id"];
        }
      ];
    };
  };
  Views: {
    [_ in never]: never;
  };
  Functions: {
    [_ in never]: never;
  };
  Enums: {
    [_ in never]: never;
  };
  CompositeTypes: {
    [_ in never]: never;
  };
}
