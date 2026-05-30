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
  progress?: number | string;
}

export interface HomeTodoRecord extends UserRelatedRecord {
  id?: number | string;
  label?: string;
  task_id?: number | string;
  status?: string;
  progress?: number | string;
  due_date?: string;
}

export interface HomeTimelogRecord extends UserRelatedRecord {
  id?: number | string;
  name?: string;
  status?: string;
  start?: string;
  end?: string;
  task_todo_id?: number | string;
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
