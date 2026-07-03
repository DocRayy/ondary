export type TimelogStatus = 'active' | 'pause' | 'finish';

export interface CreateTimelogRequest {
  user_id: number;
  task_todo_id?: number;
  name: string;
  time?: string;
  status?: TimelogStatus;
  start?: string;
  end?: string;
  start_note?: string;
  end_note?: string;
  minuted_logged?: number;
}

export interface UpdateTimelogRequest {
  user_id?: number;
  task_todo_id?: number;
  name?: string;
  time?: string;
  status?: TimelogStatus;
  start?: string;
  end?: string;
  start_note?: string;
  end_note?: string;
  minuted_logged?: number;
}

export interface TimelogFileRecord {
  id?: number | string;
  timelog_id?: number | string;
  photo?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TimelogRecord
  extends Partial<CreateTimelogRequest>, Partial<UpdateTimelogRequest> {
  id?: number | string;
  files?: TimelogFileRecord[];
  timelog_file?: TimelogFileRecord[];
  user?: {
    id?: number | string;
    username?: string;
    name?: string;
    email?: string;
    photo?: string;
    photo_url?: string;
    avatar?: string;
    image?: string;
  } | null;
  task_todo?: {
    id?: number | string;
    label?: string;
    task_id?: number | string;
    status?: string;
    estimate_time?: number;
    estimate_time_minutes?: number;
    estimate_time_label?: string;
    task?: {
      id?: number | string;
      title?: string;
      name?: string;
      due_date?: string;
      project?: {
        id?: number | string;
        label?: string;
        name?: string;
      } | null;
    } | null;
  } | null;
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
