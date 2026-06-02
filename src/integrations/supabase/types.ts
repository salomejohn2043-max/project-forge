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
      loyalty_redemptions: {
        Row: {
          created_at: string | null
          discount_amount: number
          id: string
          order_id: string | null
          points_used: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          discount_amount: number
          id?: string
          order_id?: string | null
          points_used: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          discount_amount?: number
          id?: string
          order_id?: string | null
          points_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          name: string
          restaurant_id: string
          total_orders: number | null
          updated_at: string | null
        }
        Insert: {
          base_price: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name: string
          restaurant_id: string
          total_orders?: number | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name?: string
          restaurant_id?: string
          total_orders?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_read: boolean | null
          order_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          order_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          order_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          base_price: number
          created_at: string | null
          id: string
          marked_up_price: number
          menu_item_id: string
          name: string
          order_id: string
          quantity: number
          subtotal: number
        }
        Insert: {
          base_price: number
          created_at?: string | null
          id?: string
          marked_up_price: number
          menu_item_id: string
          name: string
          order_id: string
          quantity?: number
          subtotal: number
        }
        Update: {
          base_price?: number
          created_at?: string | null
          id?: string
          marked_up_price?: number
          menu_item_id?: string
          name?: string
          order_id?: string
          quantity?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid_upfront: number
          amount_remaining: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          customer_confirmed_at: string | null
          customer_confirmed_delivery: boolean | null
          customer_id: string
          delivery_address: string
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_lat: number | null
          delivery_lng: number | null
          disbursed_at: string | null
          id: string
          is_disbursed: boolean | null
          loyalty_points_awarded: number | null
          markup_amount: number | null
          payment_option: Database["public"]["Enums"]["payment_option"]
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          restaurant_commission: number | null
          restaurant_confirmed_at: string | null
          restaurant_confirmed_dispatch: boolean | null
          restaurant_id: string
          restaurant_payout: number | null
          rider_commission: number | null
          rider_confirmed_at: string | null
          rider_confirmed_pickup: boolean | null
          rider_id: string | null
          rider_payout: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount_paid_upfront: number
          amount_remaining: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          customer_confirmed_at?: string | null
          customer_confirmed_delivery?: boolean | null
          customer_id: string
          delivery_address: string
          delivery_distance_km?: number | null
          delivery_fee: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          disbursed_at?: string | null
          id?: string
          is_disbursed?: boolean | null
          loyalty_points_awarded?: number | null
          markup_amount?: number | null
          payment_option: Database["public"]["Enums"]["payment_option"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          restaurant_commission?: number | null
          restaurant_confirmed_at?: string | null
          restaurant_confirmed_dispatch?: boolean | null
          restaurant_id: string
          restaurant_payout?: number | null
          rider_commission?: number | null
          rider_confirmed_at?: string | null
          rider_confirmed_pickup?: boolean | null
          rider_id?: string | null
          rider_payout?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal: number
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          amount_paid_upfront?: number
          amount_remaining?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          customer_confirmed_at?: string | null
          customer_confirmed_delivery?: boolean | null
          customer_id?: string
          delivery_address?: string
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          disbursed_at?: string | null
          id?: string
          is_disbursed?: boolean | null
          loyalty_points_awarded?: number | null
          markup_amount?: number | null
          payment_option?: Database["public"]["Enums"]["payment_option"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          restaurant_commission?: number | null
          restaurant_confirmed_at?: string | null
          restaurant_confirmed_dispatch?: boolean | null
          restaurant_id?: string
          restaurant_payout?: number | null
          rider_commission?: number | null
          rider_confirmed_at?: string | null
          rider_confirmed_pickup?: boolean | null
          rider_id?: string | null
          rider_payout?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          ends_at: string
          id: string
          menu_item_id: string | null
          rejection_reason: string | null
          restaurant_id: string
          starts_at: string
          status: Database["public"]["Enums"]["promotion_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          ends_at: string
          id?: string
          menu_item_id?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["promotion_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          ends_at?: string
          id?: string
          menu_item_id?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["promotion_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          awarded_at: string | null
          bonus_awarded: boolean | null
          created_at: string | null
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          awarded_at?: string | null
          bonus_awarded?: boolean | null
          created_at?: string | null
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          awarded_at?: string | null
          bonus_awarded?: boolean | null
          created_at?: string | null
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string
          average_rating: number | null
          closing_time: string | null
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_open: boolean | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          opening_time: string | null
          owner_id: string
          phone: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["restaurant_status"] | null
          total_orders: number | null
          updated_at: string | null
        }
        Insert: {
          address: string
          average_rating?: number | null
          closing_time?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_open?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          opening_time?: string | null
          owner_id: string
          phone: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"] | null
          total_orders?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          average_rating?: number | null
          closing_time?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_open?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          opening_time?: string | null
          owner_id?: string
          phone?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"] | null
          total_orders?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          order_id: string
          restaurant_id: string
          restaurant_rating: number | null
          restaurant_review: string | null
          rider_id: string | null
          rider_rating: number | null
          rider_review: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          order_id: string
          restaurant_id: string
          restaurant_rating?: number | null
          restaurant_review?: string | null
          rider_id?: string | null
          rider_rating?: number | null
          rider_review?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          order_id?: string
          restaurant_id?: string
          restaurant_rating?: number | null
          restaurant_review?: string | null
          rider_id?: string | null
          rider_rating?: number | null
          rider_review?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          average_rating: number | null
          created_at: string | null
          current_lat: number | null
          current_lng: number | null
          full_body_photo_url: string | null
          id: string
          id_document_url: string | null
          id_number: string
          is_online: boolean | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries: number | null
          updated_at: string | null
          user_id: string
          vehicle_plate: string | null
          vehicle_type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          average_rating?: number | null
          created_at?: string | null
          current_lat?: number | null
          current_lng?: number | null
          full_body_photo_url?: string | null
          id?: string
          id_document_url?: string | null
          id_number: string
          is_online?: boolean | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries?: number | null
          updated_at?: string | null
          user_id: string
          vehicle_plate?: string | null
          vehicle_type: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          average_rating?: number | null
          created_at?: string | null
          current_lat?: number | null
          current_lng?: number | null
          full_body_photo_url?: string | null
          id?: string
          id_document_url?: string | null
          id_number?: string
          is_online?: boolean | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries?: number | null
          updated_at?: string | null
          user_id?: string
          vehicle_plate?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          is_confirmed: boolean | null
          mpesa_phone: string | null
          mpesa_reference: string | null
          order_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_confirmed?: boolean | null
          mpesa_phone?: string | null
          mpesa_reference?: string | null
          order_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_confirmed?: boolean | null
          mpesa_phone?: string | null
          mpesa_reference?: string | null
          order_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          is_email_verified: boolean | null
          is_phone_verified: boolean | null
          last_lat: number | null
          last_lng: number | null
          last_location_name: string | null
          loyalty_points: number | null
          phone: string | null
          profile_photo_url: string | null
          referral_code: string | null
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean | null
          is_email_verified?: boolean | null
          is_phone_verified?: boolean | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_name?: string | null
          loyalty_points?: number | null
          phone?: string | null
          profile_photo_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_email_verified?: boolean | null
          is_phone_verified?: boolean | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_name?: string | null
          loyalty_points?: number | null
          phone?: string | null
          profile_photo_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { uid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      notification_type:
        | "order_placed"
        | "order_confirmed"
        | "order_preparing"
        | "order_ready"
        | "order_picked_up"
        | "order_delivered"
        | "order_cancelled"
        | "payment_received"
        | "payment_remaining_due"
        | "rider_approved"
        | "promotion_approved"
        | "refund_issued"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "cancelled"
      payment_option: "30" | "50" | "100"
      payment_status: "partial" | "complete" | "refunded" | "partially_refunded"
      promotion_status: "pending" | "approved" | "rejected" | "expired"
      restaurant_status: "pending" | "active" | "suspended"
      rider_status: "pending" | "approved" | "suspended"
      transaction_type: "payment" | "refund" | "disbursement" | "commission"
      user_role: "customer" | "rider" | "restaurant_admin" | "admin"
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
      notification_type: [
        "order_placed",
        "order_confirmed",
        "order_preparing",
        "order_ready",
        "order_picked_up",
        "order_delivered",
        "order_cancelled",
        "payment_received",
        "payment_remaining_due",
        "rider_approved",
        "promotion_approved",
        "refund_issued",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      payment_option: ["30", "50", "100"],
      payment_status: ["partial", "complete", "refunded", "partially_refunded"],
      promotion_status: ["pending", "approved", "rejected", "expired"],
      restaurant_status: ["pending", "active", "suspended"],
      rider_status: ["pending", "approved", "suspended"],
      transaction_type: ["payment", "refund", "disbursement", "commission"],
      user_role: ["customer", "rider", "restaurant_admin", "admin"],
    },
  },
} as const
