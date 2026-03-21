export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      /* ── Profiles ─────────────────────────────────── */
      profiles: {
        Row: {
          id: string;
          first_name: string;
          email: string;
          access: "user" | "admin" | "owner";
        };
        Insert: {
          id: string;
          first_name?: string;
          email?: string;
          access?: "user" | "admin" | "owner";
        };
        Update: {
          first_name?: string;
          email?: string;
          access?: "user" | "admin" | "owner";
        };
      };

      /* ── Photo Share ────────────────────────────── */
      photo_share_assets: {
        Row: {
          id: string;
          file_path: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          title: string;
          description: string | null;
          allow_third_party_use: boolean;
          uploaded_by: string | null;
          uploaded_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          file_path: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          title: string;
          description?: string | null;
          allow_third_party_use: boolean;
          uploaded_by?: string | null;
          uploaded_at?: string;
          is_active?: boolean;
        };
        Update: {
          file_path?: string;
          file_name?: string;
          file_size?: number | null;
          mime_type?: string | null;
          title?: string;
          description?: string | null;
          allow_third_party_use?: boolean;
          uploaded_by?: string | null;
          uploaded_at?: string;
          is_active?: boolean;
        };
      };

      /* ── Products ───────────────────────────────── */
      inventory_products: {
        Row: {
          id: string;
          part: string;
          display_name: string;
          product_type: string;
          fragrance: string | null;
          size: string | null;
          part_type: string;
          brand: "NI" | "Sassy";
          cogs: number;
          min_qty: number;
          max_qty: number;
          is_forecasted: boolean;
          lead_time_months: number;
          avg_monthly_demand: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          part: string;
          display_name: string;
          product_type: string;
          fragrance?: string | null;
          size?: string | null;
          part_type: string;
          brand?: "NI" | "Sassy";
          cogs?: number;
          min_qty?: number;
          max_qty?: number;
          is_forecasted?: boolean;
          lead_time_months?: number;
          avg_monthly_demand?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          part?: string;
          display_name?: string;
          product_type?: string;
          fragrance?: string | null;
          size?: string | null;
          part_type?: string;
          brand?: "NI" | "Sassy";
          cogs?: number;
          min_qty?: number;
          max_qty?: number;
          is_forecasted?: boolean;
          lead_time_months?: number;
          avg_monthly_demand?: number;
          updated_at?: string;
        };
      };

      /* ── Inventory Uploads ──────────────────────── */
      inventory_uploads: {
        Row: {
          id: string;
          warehouse: string;
          pulled_date: string;
          original_filename: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          warehouse: string;
          pulled_date: string;
          original_filename: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          warehouse?: string;
          pulled_date?: string;
          original_filename?: string;
          uploaded_by?: string | null;
        };
      };

      /* ── Inventory Snapshot Items ────────────────── */
      inventory_snapshot_items: {
        Row: {
          id: string;
          upload_id: string;
          warehouse: string;
          part: string;
          description: string | null;
          uom: string | null;
          on_hand: number;
          allocated: number;
          not_available: number;
          drop_ship: number;
          available: number;
          on_order: number;
          committed: number;
          short: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          warehouse: string;
          part: string;
          description?: string | null;
          uom?: string | null;
          on_hand?: number;
          allocated?: number;
          not_available?: number;
          drop_ship?: number;
          available?: number;
          on_order?: number;
          committed?: number;
          short?: number;
          created_at?: string;
        };
        Update: {
          upload_id?: string;
          warehouse?: string;
          part?: string;
          description?: string | null;
          uom?: string | null;
          on_hand?: number;
          allocated?: number;
          not_available?: number;
          drop_ship?: number;
          available?: number;
          on_order?: number;
          committed?: number;
          short?: number;
        };
      };

      /* ── Marketing Content ──────────────────────── */
      marketing_content: {
        Row: {
          id: string;
          publish_date: string;
          brand: "NI" | "Sassy";
          platform: string;
          content_type: string;
          strategy: string;
          description: string;
          status: "Draft" | "Review" | "Published";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          publish_date: string;
          brand: "NI" | "Sassy";
          platform: string;
          content_type: string;
          strategy: string;
          description: string;
          status?: "Draft" | "Review" | "Published";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          publish_date?: string;
          brand?: "NI" | "Sassy";
          platform?: string;
          content_type?: string;
          strategy?: string;
          description?: string;
          status?: "Draft" | "Review" | "Published";
          created_by?: string | null;
          updated_at?: string;
        };
      };

      /* ── Marketing Content Activity ─────────────── */
      marketing_content_activity: {
        Row: {
          id: string;
          content_id: string;
          event_type: "status_changed" | "content_updated";
          event_label: string;
          metadata: Json | null;
          performed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          event_type: "status_changed" | "content_updated";
          event_label: string;
          metadata?: Json | null;
          performed_by?: string | null;
          created_at?: string;
        };
        Update: {
          content_id?: string;
          event_type?: "status_changed" | "content_updated";
          event_label?: string;
          metadata?: Json | null;
          performed_by?: string | null;
        };
      };

      /* ── Marketing Content Media ────────────────── */
      marketing_content_media: {
        Row: {
          id: string;
          content_id: string;
        };
        Insert: {
          id?: string;
          content_id: string;
        };
        Update: {
          content_id?: string;
        };
      };

      /* ── Media Kit Products ─────────────────────── */
      media_kit_products: {
        Row: {
          part: string;
          short_description: string | null;
          long_description: string | null;
          benefits: string | null;
          ingredients_text: string | null;
          retailer_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          part: string;
          short_description?: string | null;
          long_description?: string | null;
          benefits?: string | null;
          ingredients_text?: string | null;
          retailer_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          short_description?: string | null;
          long_description?: string | null;
          benefits?: string | null;
          ingredients_text?: string | null;
          retailer_notes?: string | null;
          updated_at?: string;
        };
      };

      /* ── Media Kit Assets ───────────────────────── */
      media_kit_assets: {
        Row: {
          id: string;
          part: string;
          asset_type: "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";
          storage_path: string;
          file_name: string | null;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          part: string;
          asset_type: "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";
          storage_path: string;
          file_name?: string | null;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          part?: string;
          asset_type?: "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";
          storage_path?: string;
          file_name?: string | null;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          updated_at?: string;
        };
      };

      /* ── Shopify Daily Metrics ──────────────────── */
      shopify_daily_metrics: {
        Row: {
          id: string;
          day: string;
          total_orders: number;
          total_amount_spent: number;
          sessions: number;
          conversion_rate: number;
          avg_order_value: number;
          bounces: number;
          online_store_visitors: number;
        };
        Insert: {
          id?: string;
          day: string;
          total_orders?: number;
          total_amount_spent?: number;
          sessions?: number;
          conversion_rate?: number;
          avg_order_value?: number;
          bounces?: number;
          online_store_visitors?: number;
        };
        Update: {
          day?: string;
          total_orders?: number;
          total_amount_spent?: number;
          sessions?: number;
          conversion_rate?: number;
          avg_order_value?: number;
          bounces?: number;
          online_store_visitors?: number;
        };
      };

      /* ── Sales Orders Raw ────────────────────────── */
      sales_orders_raw: {
        Row: {
          id: number | null;
          billtoname: string | null;
          billtoaddress: string | null;
          billtocity: string | null;
          billtostate: string | null;
          billtozip: string | null;
          billtocountry: string | null;
          customercontact: string | null;
          customerid: string | null;
          customerpo: string | null;
          datecompleted: string | null;
          email: string | null;
          num: string | null;
          phone: string | null;
          shiptoname: string | null;
          shiptoaddress: string | null;
          shiptocity: string | null;
          shiptostate: string | null;
          shiptozip: string | null;
          shiptocountry: string | null;
          status: string | null;
          totalprice: number | null;
          customfields: Json | null;
          channel: string | null;
          created_at: string;
          upload_id: string | null;
        };
        Insert: {
          id?: number | null;
          billtoname?: string | null;
          billtoaddress?: string | null;
          billtocity?: string | null;
          billtostate?: string | null;
          billtozip?: string | null;
          billtocountry?: string | null;
          customercontact?: string | null;
          customerid?: string | null;
          customerpo?: string | null;
          datecompleted?: string | null;
          email?: string | null;
          num?: string | null;
          phone?: string | null;
          shiptoname?: string | null;
          shiptoaddress?: string | null;
          shiptocity?: string | null;
          shiptostate?: string | null;
          shiptozip?: string | null;
          shiptocountry?: string | null;
          status?: string | null;
          totalprice?: number | null;
          customfields?: Json | null;
          channel?: string | null;
          created_at?: string;
          upload_id?: string | null;
        };
        Update: {
          id?: number | null;
          billtoname?: string | null;
          billtoaddress?: string | null;
          billtocity?: string | null;
          billtostate?: string | null;
          billtozip?: string | null;
          billtocountry?: string | null;
          customercontact?: string | null;
          customerid?: string | null;
          customerpo?: string | null;
          datecompleted?: string | null;
          email?: string | null;
          num?: string | null;
          phone?: string | null;
          shiptoname?: string | null;
          shiptoaddress?: string | null;
          shiptocity?: string | null;
          shiptostate?: string | null;
          shiptozip?: string | null;
          shiptocountry?: string | null;
          status?: string | null;
          totalprice?: number | null;
          customfields?: Json | null;
          channel?: string | null;
          upload_id?: string | null;
        };
      };

      /* ── SO Items Raw ─────────────────────────────── */
      so_items_raw: {
        Row: {
          pk: number;
          id: number | null;
          description: string | null;
          productid: number | null;
          productnum: string | null;
          qtyfulfilled: number | null;
          qtyordered: number | null;
          soid: number | null;
          solineitem: number | null;
          statusid: number | null;
          totalcost: number | null;
          totalprice: number | null;
          typename: string | null;
          upload_id: string | null;
        };
        Insert: {
          id?: number | null;
          description?: string | null;
          productid?: number | null;
          productnum?: string | null;
          qtyfulfilled?: number | null;
          qtyordered?: number | null;
          soid?: number | null;
          solineitem?: number | null;
          statusid?: number | null;
          totalcost?: number | null;
          totalprice?: number | null;
          typename?: string | null;
          upload_id?: string | null;
        };
        Update: {
          id?: number | null;
          description?: string | null;
          productid?: number | null;
          productnum?: string | null;
          qtyfulfilled?: number | null;
          qtyordered?: number | null;
          soid?: number | null;
          solineitem?: number | null;
          statusid?: number | null;
          totalcost?: number | null;
          totalprice?: number | null;
          typename?: string | null;
          upload_id?: string | null;
        };
      };

      /* ── Sales Uploads ────────────────────────────── */
      sales_uploads: {
        Row: {
          id: string;
          pulled_date: string;
          original_filename_orders: string;
          original_filename_items: string;
          uploaded_by: string | null;
          created_at: string;
          status: string;
          orders_rows: number | null;
          items_rows: number | null;
          error_text: string | null;
        };
        Insert: {
          id?: string;
          pulled_date: string;
          original_filename_orders: string;
          original_filename_items: string;
          uploaded_by?: string | null;
          created_at?: string;
          status?: string;
          orders_rows?: number | null;
          items_rows?: number | null;
          error_text?: string | null;
        };
        Update: {
          pulled_date?: string;
          original_filename_orders?: string;
          original_filename_items?: string;
          uploaded_by?: string | null;
          status?: string;
          orders_rows?: number | null;
          items_rows?: number | null;
          error_text?: string | null;
        };
      };

      /* ── Tasks ──────────────────────────────────── */
      tasks: {
        Row: {
          id: string;
          name: string;
          completed: boolean;
          priority: string | null;
          owner: string | null;
          status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          completed?: boolean;
          priority?: string | null;
          owner?: string | null;
          status?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          completed?: boolean;
          priority?: string | null;
          owner?: string | null;
          status?: string | null;
        };
      };

      /* ── Social Media Posts ─────────────────────── */
      social_media_posts: {
        Row: {
          id: string;
          brand: "NI" | "Sassy";
          platform: "Instagram" | "Facebook" | "TikTok";
          post_date: string;
          caption: string | null;
          image_url: string | null;
          status: "planned" | "posted";
          post_type: "photo" | "carousel" | "reel" | "story";
          content_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand: "NI" | "Sassy";
          platform: "Instagram" | "Facebook" | "TikTok";
          post_date: string;
          caption?: string | null;
          image_url?: string | null;
          status?: "planned" | "posted";
          post_type?: "photo" | "carousel" | "reel" | "story";
          content_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          brand?: "NI" | "Sassy";
          platform?: "Instagram" | "Facebook" | "TikTok";
          post_date?: string;
          caption?: string | null;
          image_url?: string | null;
          status?: "planned" | "posted";
          post_type?: "photo" | "carousel" | "reel" | "story";
          content_id?: string | null;
          updated_at?: string;
        };
      };
    };

    Views: {
      /* ── Current Sales Upload ───────────────────── */
      current_sales_upload: {
        Row: {
          id: string;
        };
      };

      /* ── Customer Summary ───────────────────────── */
      customer_summary: {
        Row: {
          customerid: string;
          name: string;
          bill_to_state: string;
          channel: string;
          first_order_date: string | null;
          last_order_date: string | null;
          last_order_amount: number | null;
          lifetime_orders: number | null;
          lifetime_revenue: number | null;
          lifetime_aov: number | null;
          sales_2023: number | null;
          sales_2024: number | null;
          sales_2025: number | null;
          sales_2026: number | null;
          brands_purchased: string;
        };
      };

      /* ── Customer Contact Summary ───────────────── */
      customer_contact_summary: {
        Row: {
          customerid: string;
          customer_name: string | null;
          email: string | null;
          phone: string | null;
          billto_city: string | null;
          billto_state: string | null;
          shipto_city: string | null;
          shipto_state: string | null;
          first_order_date: string | null;
          last_order_date: string | null;
          order_count: number | null;
          lifetime_revenue: number | null;
          primary_channel: string | null;
        };
      };

      /* ── Customer Monthly Orders ────────────────── */
      customer_monthly_orders: {
        Row: {
          customerid: string;
          month_date: string;
          month_key: string;
          orders: number;
          revenue: number;
        };
      };

      /* ── Customer Sales Analysis ────────────────── */
      customer_sales_analysis: {
        Row: {
          customerid: string;
          year: number;
          fragrance: string;
          display_name: string;
          quantity: number;
          revenue: number;
        };
      };

      /* ── Sales by Product (Last 90 Days) ────────── */
      sales_by_product_last_90_days: {
        Row: {
          product_code: string;
          display_name: string | null;
          fragrance: string | null;
          units_sold_last_90_days: number | null;
          revenue_last_90_days: number | null;
          active_sale_days: number | null;
        };
      };

      /* ── Sales by Product Month ─────────────────── */
      sales_by_product_month: {
        Row: {
          month: string;
          product_code: string;
          units_sold: number;
          revenue: number;
        };
      };

      /* ── Sales by Product Month (Enriched) ──────── */
      sales_by_product_month_enriched: {
        Row: {
          month: string;
          productnum: string;
          display_name: string | null;
          fragrance: string | null;
          typename: string | null;
          units_fulfilled: number | null;
          revenue: number | null;
        };
      };

      /* ── Sales Orders Current ───────────────────── */
      sales_orders_current: {
        Row: {
          id: number | null;
          billtoname: string | null;
          billtoaddress: string | null;
          billtocity: string | null;
          billtostate: string | null;
          billtozip: string | null;
          billtocountry: string | null;
          customercontact: string | null;
          customerid: string | null;
          customerpo: string | null;
          datecompleted: string | null;
          email: string | null;
          num: string | null;
          phone: string | null;
          shiptoname: string | null;
          shiptoaddress: string | null;
          shiptocity: string | null;
          shiptostate: string | null;
          shiptozip: string | null;
          shiptocountry: string | null;
          status: string | null;
          totalprice: number | null;
          customfields: Json | null;
          channel: string | null;
          created_at: string;
          upload_id: string | null;
        };
      };

      /* ── SO Items Current ───────────────────────── */
      so_items_current: {
        Row: {
          id: number | null;
          description: string | null;
          productid: number | null;
          productnum: string | null;
          qtyfulfilled: number | null;
          qtyordered: number | null;
          soid: number | null;
          solineitem: number | null;
          statusid: number | null;
          totalcost: number | null;
          totalprice: number | null;
          typename: string | null;
          pk: number;
          upload_id: string | null;
        };
      };

      /* ── Units by Product (Last 90 Days) ────────── */
      units_by_product_last_90_days: {
        Row: {
          part: string;
          units_last_90_days: number | null;
        };
      };
    };

    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};

/* ── Helper types ─────────────────────────────────── */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
