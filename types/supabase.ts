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
    };

    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
