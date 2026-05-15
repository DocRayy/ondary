export const TASK_STATUSES = ['draft', 'progress', 'on_hold', 'completed'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface CreateTaskRequest {
  project_id: number;
  user_id: number;
  task_todo_id?: number | string;
  title: string;
  description?: string;
  due_date?: string;
  estimate_time?: number;
  finish_date?: string;
  progress?: number;
  status?: TaskStatus;
  order_index?: number;
  board_column?: TaskStatus;
  assignee_user_ids?: Array<number | string> | string;
  label_ids?: Array<number | string> | string;
  bookmarks?: unknown[];
  files?: unknown[];
  movement_history?: unknown[];
}

export interface CreateTaskTodoRequest {
  task_id: number;
  user_id?: number;
  label: string;
  progress?: number;
  status?: 'pending' | 'progress' | 'completed';
  estimate_time?: number;
  due_date?: string;
  finish_date?: string;
}

export interface TaskTodoRecord extends Partial<CreateTaskTodoRequest> {
  id?: number | string;
  user?: UserOption;
  task?: TaskRecord;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateTaskRequest {
  project_id?: number;
  user_id?: number;
  task_todo_id?: number | string;
  title?: string;
  description?: string;
  due_date?: string;
  estimate_time?: number;
  finish_date?: string;
  progress?: number;
  status?: TaskStatus;
  order_index?: number;
  moved_at?: string;
  completed_at?: string;
  updated_by?: number;
  board_column?: TaskStatus;
  assignee_user_ids?: Array<number | string> | string;
  label_ids?: Array<number | string> | string;
  bookmarks?: unknown[];
  files?: unknown[];
  movement_history?: unknown[];
}

export interface MoveTaskRequest {
  status: TaskStatus;
  order_index: number;
}

export interface TaskRecord extends Partial<CreateTaskRequest>, Partial<UpdateTaskRequest> {
  id?: number | string;
  task_title?: string;
  name?: string;
  user?: UserOption;
  project?: ProjectOption;
  assignee_users?: UserOption[];
  labels?: TaskLabelOption[];
  task_labels?: TaskLabelOption[];
  taskLabels?: TaskLabelOption[];
  task_todos?: TaskTodoRecord[];
  taskTodos?: TaskTodoRecord[];
  todos?: TaskTodoRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface ProjectOption {
  id: number;
  label?: string;
  name?: string;
  description?: string;
}

export interface UserOption {
  id: number;
  username: string;
  email: string;
  name?: string;
}

export interface TaskLabelOption {
  id: number;
  name: string;
  color: 'green' | 'blue' | 'red' | 'amber' | 'yellow' | string;
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
