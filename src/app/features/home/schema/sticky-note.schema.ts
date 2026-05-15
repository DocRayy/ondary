export interface StickyNoteRecord {
  id?: number | string;
  user_id?: number | string;
  title?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateStickyNoteRequest {
  user_id: number;
  title: string;
  description?: string;
}

export interface UpdateStickyNoteRequest {
  user_id?: number;
  title?: string;
  description?: string;
}

export type ApiCollectionResponse<T> =
  | T[]
  | {
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
