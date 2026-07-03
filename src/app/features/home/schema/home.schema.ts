export interface UserRelatedRecord {
  user_id?: number | string;
  user_ids?: Array<number | string> | string;
  user?: { id?: number | string; username?: string; name?: string; email?: string } | null;
  users?: Array<{ id?: number | string; username?: string; name?: string; email?: string }> | null;
  created_at?: string;
  updated_at?: string;
}

export interface HomeTaskRecord extends UserRelatedRecord {
  id?: number | string;
  title?: string;
  task_title?: string;
  name?: string;
  status?: string;
  board_column?: string;
  due_date?: string;
  finish_date?: string;
  moved_at?: string;
  completed_at?: string;
  progress?: number | string;
  assignee_user_ids?: Array<number | string> | string;
  assignee_users?: Array<{ id?: number | string; username?: string; name?: string; email?: string }>;
  task_todos?: HomeTodoRecord[];
  taskTodos?: HomeTodoRecord[];
  todos?: HomeTodoRecord[];
}

export interface HomeTodoRecord extends UserRelatedRecord {
  id?: number | string;
  label?: string;
  task_id?: number | string;
  status?: string;
  progress?: number | string;
  due_date?: string;
  finish_date?: string;
  completed_at?: string;
  estimate_time?: number | string;
  estimate_time_hours?: number | string;
  estimate_time_minutes?: number | string;
  estimate_time_label?: string;
  task?: HomeTaskRecord | null;
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
