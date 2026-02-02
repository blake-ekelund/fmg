export type PhotoAsset = {
  id: string;
  file_path: string;
  title: string;
  description: string | null;
  allow_third_party_use: boolean;
  uploaded_at: string;
};
