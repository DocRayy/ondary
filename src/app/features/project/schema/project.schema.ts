export interface ProjectRecord {
  id?: number | string;
  user_id?: number | string;
  label?: string;
  name?: string;
  description?: string;
  photo?: string;
  photo_url?: string;
  avatar?: string;
  image?: string;
  file_path?: string;
  url?: string;
  tasks?: unknown[];
  task_id?: Array<number | string>;
  created_at?: string;
  updated_at?: string;
}

export type ApiCollectionResponse<T> =
  | T[]
  | {
      title?: string;
      message?: string;
      data?: T[];
      items?: T[];
      results?: T[];
    }
  | null;

export type ApiItemResponse<T> =
  | T
  | {
      title?: string;
      message?: string;
      data?: T;
      item?: T;
      result?: T;
    }
  | null;
