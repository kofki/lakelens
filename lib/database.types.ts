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
      accessibility: {
        Row: {
          accessible_restroom: boolean | null
          ada_parking: boolean | null
          depth_at_entry_note: string | null
          entry_type: string
          handrails: boolean | null
          park_id: string
          parking_to_water_m: number | null
          service_animals_note: string | null
          shade: boolean | null
          source: string | null
          surface: string
          updated_at: string
          verified: boolean
          water_access: string
          wheelchair_loaner: boolean | null
        }
        Insert: {
          accessible_restroom?: boolean | null
          ada_parking?: boolean | null
          depth_at_entry_note?: string | null
          entry_type?: string
          handrails?: boolean | null
          park_id: string
          parking_to_water_m?: number | null
          service_animals_note?: string | null
          shade?: boolean | null
          source?: string | null
          surface?: string
          updated_at?: string
          verified?: boolean
          water_access?: string
          wheelchair_loaner?: boolean | null
        }
        Update: {
          accessible_restroom?: boolean | null
          ada_parking?: boolean | null
          depth_at_entry_note?: string | null
          entry_type?: string
          handrails?: boolean | null
          park_id?: string
          parking_to_water_m?: number | null
          service_animals_note?: string | null
          shade?: boolean | null
          source?: string | null
          surface?: string
          updated_at?: string
          verified?: boolean
          water_access?: string
          wheelchair_loaner?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "accessibility_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: true
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          source: string | null
          start_date: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          source?: string | null
          start_date: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          source?: string | null
          start_date?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      conditions_snapshots: {
        Row: {
          fetched_at: string
          id: string
          park_id: string
          payload: Json
          source: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          park_id: string
          payload: Json
          source: string
        }
        Update: {
          fetched_at?: string
          id?: string
          park_id?: string
          payload?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditions_snapshots_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          date: string
          name: string
        }
        Insert: {
          date: string
          name: string
        }
        Update: {
          date?: string
          name?: string
        }
        Relationships: []
      }
      long_weekends: {
        Row: {
          end_date: string
          start_date: string
        }
        Insert: {
          end_date: string
          start_date: string
        }
        Update: {
          end_date?: string
          start_date?: string
        }
        Relationships: []
      }
      park_alerts: {
        Row: {
          active: boolean
          ends_at: string | null
          first_seen: string
          hash: string
          id: string
          kind: string
          last_checked_at: string | null
          last_seen: string
          official_url: string | null
          park_id: string
          severity: string | null
          source: string
          starts_at: string | null
          text: string
        }
        Insert: {
          active?: boolean
          ends_at?: string | null
          first_seen?: string
          hash: string
          id?: string
          kind: string
          last_checked_at?: string | null
          last_seen?: string
          official_url?: string | null
          park_id: string
          severity?: string | null
          source?: string
          starts_at?: string | null
          text: string
        }
        Update: {
          active?: boolean
          ends_at?: string | null
          first_seen?: string
          hash?: string
          id?: string
          kind?: string
          last_checked_at?: string | null
          last_seen?: string
          official_url?: string | null
          park_id?: string
          severity?: string | null
          source?: string
          starts_at?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "park_alerts_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_forecast: {
        Row: {
          daily: Json
          forecast_at: string
          forecast_issued_at: string | null
          hourly: Json | null
          now_feels_like_f: number | null
          now_humidity: number | null
          now_short_forecast: string | null
          now_temp_f: number | null
          now_thunder_prob: number | null
          now_uv: number | null
          now_wind_mph: number | null
          park_id: string
          sources: Json
          uv_peak: number | null
          uv_peak_hour: number | null
          water_quality: Json | null
        }
        Insert: {
          daily?: Json
          forecast_at?: string
          forecast_issued_at?: string | null
          hourly?: Json | null
          now_feels_like_f?: number | null
          now_humidity?: number | null
          now_short_forecast?: string | null
          now_temp_f?: number | null
          now_thunder_prob?: number | null
          now_uv?: number | null
          now_wind_mph?: number | null
          park_id: string
          sources?: Json
          uv_peak?: number | null
          uv_peak_hour?: number | null
          water_quality?: Json | null
        }
        Update: {
          daily?: Json
          forecast_at?: string
          forecast_issued_at?: string | null
          hourly?: Json | null
          now_feels_like_f?: number | null
          now_humidity?: number | null
          now_short_forecast?: string | null
          now_temp_f?: number | null
          now_thunder_prob?: number | null
          now_uv?: number | null
          now_wind_mph?: number | null
          park_id?: string
          sources?: Json
          uv_peak?: number | null
          uv_peak_hour?: number | null
          water_quality?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "park_forecast_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: true
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_lots: {
        Row: {
          ada_spaces: number | null
          capacity: number | null
          fee: string | null
          id: string
          is_overflow: boolean
          lat: number
          lng: number
          name: string
          notes: string | null
          osm_ref: string | null
          park_id: string
          source: string
        }
        Insert: {
          ada_spaces?: number | null
          capacity?: number | null
          fee?: string | null
          id?: string
          is_overflow?: boolean
          lat: number
          lng: number
          name: string
          notes?: string | null
          osm_ref?: string | null
          park_id: string
          source?: string
        }
        Update: {
          ada_spaces?: number | null
          capacity?: number | null
          fee?: string | null
          id?: string
          is_overflow?: boolean
          lat?: number
          lng?: number
          name?: string
          notes?: string | null
          osm_ref?: string | null
          park_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_lots_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      parks: {
        Row: {
          amenities: Json | null
          amenities_checked_at: string | null
          cavern_warning: boolean
          coverage_tier: string
          description: string | null
          entrance_notes: string | null
          fees: string | null
          gauge_distance_km: number | null
          guarded: string
          hours: string | null
          id: string
          lat: number
          lng: number
          name: string
          noaa_distance_km: number | null
          noaa_station_id: string | null
          nws_county: string | null
          nws_grid: Json | null
          nws_zone: string | null
          official_url: string | null
          operator: string
          osm_checked_at: string | null
          photo_url: string | null
          reservation_required: boolean
          reservation_url: string | null
          river_gauge_site_id: string | null
          rules: Json
          safety_notes: string | null
          slug: string
          swim_season: Json | null
          swimming_verified: boolean
          time_zone: string | null
          type: string
          typical_closure_time: string | null
          updated_at: string
          usgs_site_id: string | null
        }
        Insert: {
          amenities?: Json | null
          amenities_checked_at?: string | null
          cavern_warning?: boolean
          coverage_tier?: string
          description?: string | null
          entrance_notes?: string | null
          fees?: string | null
          gauge_distance_km?: number | null
          guarded?: string
          hours?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          noaa_distance_km?: number | null
          noaa_station_id?: string | null
          nws_county?: string | null
          nws_grid?: Json | null
          nws_zone?: string | null
          official_url?: string | null
          operator: string
          osm_checked_at?: string | null
          photo_url?: string | null
          reservation_required?: boolean
          reservation_url?: string | null
          river_gauge_site_id?: string | null
          rules?: Json
          safety_notes?: string | null
          slug: string
          swim_season?: Json | null
          swimming_verified?: boolean
          time_zone?: string | null
          type: string
          typical_closure_time?: string | null
          updated_at?: string
          usgs_site_id?: string | null
        }
        Update: {
          amenities?: Json | null
          amenities_checked_at?: string | null
          cavern_warning?: boolean
          coverage_tier?: string
          description?: string | null
          entrance_notes?: string | null
          fees?: string | null
          gauge_distance_km?: number | null
          guarded?: string
          hours?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          noaa_distance_km?: number | null
          noaa_station_id?: string | null
          nws_county?: string | null
          nws_grid?: Json | null
          nws_zone?: string | null
          official_url?: string | null
          operator?: string
          osm_checked_at?: string | null
          photo_url?: string | null
          reservation_required?: boolean
          reservation_url?: string | null
          river_gauge_site_id?: string | null
          rules?: Json
          safety_notes?: string | null
          slug?: string
          swim_season?: Json | null
          swimming_verified?: boolean
          time_zone?: string | null
          type?: string
          typical_closure_time?: string | null
          updated_at?: string
          usgs_site_id?: string | null
        }
        Relationships: []
      }
      report_confirmations: {
        Row: {
          created_at: string
          device_id: string
          id: string
          report_id: string
          response: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          report_id: string
          response: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          report_id?: string
          response?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_confirmations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string
          created_at: string
          device_id: string
          id: string
          is_sample: boolean
          note: string | null
          park_id: string
          photo_url: string | null
          value: string
        }
        Insert: {
          category: string
          created_at?: string
          device_id: string
          id?: string
          is_sample?: boolean
          note?: string | null
          park_id: string
          photo_url?: string | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string
          device_id?: string
          id?: string
          is_sample?: boolean
          note?: string | null
          park_id?: string
          photo_url?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          device_id: string
          id: string
          is_sample: boolean
          park_id: string
          photo_urls: string[]
          rating: number
          visited_on: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          device_id: string
          id?: string
          is_sample?: boolean
          park_id: string
          photo_urls?: string[]
          rating: number
          visited_on?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          device_id?: string
          id?: string
          is_sample?: boolean
          park_id?: string
          photo_urls?: string[]
          rating?: number
          visited_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      latest_conditions: {
        Row: {
          fetched_at: string | null
          id: string | null
          park_id: string | null
          payload: Json | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conditions_snapshots_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_review_stats: {
        Row: {
          average_rating: number | null
          count_1: number | null
          count_2: number | null
          count_3: number | null
          count_4: number | null
          count_5: number | null
          park_id: string | null
          review_count: number | null
          sample_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      refresh_sample_reports: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
