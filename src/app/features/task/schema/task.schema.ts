export const TASK_STATUSES = ['draft', 'progress', 'on_hold', 'completed'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskTodoStatus = 'pending' | 'progress' | 'completed' | 'completed_but_overdue';

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
  user_ids?: number[];
  label: string;
  progress?: number;
  status?: TaskTodoStatus;
  estimate_time?: number;
  created_by?: number | string;
  updated_by?: number | string;
  due_date?: string;
  finish_date?: string;
}

export interface TaskAttachmentRecord {
  id?: number | string;
  task_id?: number | string;
  files?: string;
  file_path?: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskCommentRecord {
  id?: number | string;
  task_id?: number | string;
  user_id?: number | string;
  message: string;
  user?: UserOption;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTaskCommentRequest {
  task_id: number;
  message: string;
}

export interface TaskTodoRecord extends Partial<CreateTaskTodoRequest> {
  id?: number | string;
  user?: UserOption;
  users?: UserOption[];
  created_by?: number | string;
  updated_by?: number | string;
  estimate_time_hours?: number;
  estimate_time_minutes?: number;
  estimate_time_label?: string;
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
  attachments?: TaskAttachmentRecord[];
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
  file_path?: string;
  url?: string;
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
  file_path?: string;
  url?: string;
}

export const getTaskUsers = (task: TaskRecord | null | undefined): UserOption[] => {
  if (!task) {
    return [];
  }

  const users = [
    ...(Array.isArray(task.users) ? task.users : []),
    ...(Array.isArray(task.assignee_users) ? task.assignee_users : []),
    ...(Array.isArray(task.user) ? task.user : task.user && typeof task.user === 'object' ? [task.user] : []),
  ].filter(Boolean);
  const userById = new Map<number, UserOption>();

  users.forEach((user) => {
    const id = Number(user.id);
    if (Number.isInteger(id) && id > 0 && !userById.has(id)) {
      userById.set(id, user);
    }
  });

  return Array.from(userById.values());
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

export const parseTaskIdList = (value: Array<number | string> | string | undefined): number[] => {
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
