export interface UserRelatedRecord {
  user_id?: number | string;
  user?: { id?: number | string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface HomeTaskRecord extends UserRelatedRecord {
  id?: number | string;
  title?: string;
  task_title?: string;
  name?: string;
  status?: string;
  due_date?: string;
}

export interface HomeTodoRecord extends UserRelatedRecord {
  id?: number | string;
  label?: string;
  task_id?: number | string;
}

export type TaskTab = 'ongoing' | 'completed';

export type ApiCollectionResponse<T extends UserRelatedRecord = UserRelatedRecord> =
  | T[]
  | {
      data?: T[];
      items?: T[];
      results?: T[];
    }
  | null;
