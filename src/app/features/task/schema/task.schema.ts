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
  user?: UserOption | UserOption[] | null;
  users?: UserOption[];
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
  photo?: string;
  photo_url?: string;
  image?: string;
  avatar?: string;
}

export interface UserOption {
  id: number;
  username: string;
  email: string;
  name?: string;
  photo?: string;
  photo_url?: string;
  avatar?: string;
  image?: string;
}

export const getTaskUsers = (task: TaskRecord | null | undefined): UserOption[] => {
  if (!task) {
    return [];
  }

  if (Array.isArray(task.user)) {
    return task.user.filter(Boolean);
  }

  if (Array.isArray(task.users)) {
    return task.users.filter(Boolean);
  }

  if (Array.isArray(task.assignee_users)) {
    return task.assignee_users.filter(Boolean);
  }

  if (task.user && typeof task.user === 'object') {
    return [task.user];
  }

  return [];
};

export const getTaskUserIds = (task: TaskRecord | null | undefined): number[] => {
  if (!task) {
    return [];
  }

  const assigneeIds = parseTaskIdList(task.assignee_user_ids);
  if (assigneeIds.length) {
    return assigneeIds;
  }

  return getTaskUsers(task)
    .map((user) => Number(user.id))
    .filter((id) => Number.isInteger(id) && id > 0);
};

export const parseTaskIdList = (
  value: Array<number | string> | string | undefined,
): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parseTaskIdList(parsed) : [];
  } catch {
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }
};

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
