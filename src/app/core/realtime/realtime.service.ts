import { Injectable, NgZone, inject, isDevMode, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { NotificationItem } from '../notifications/notification.service';
import {
  TaskCommentRecord,
  TaskRecord,
  TaskTodoRecord,
} from '../../features/task/schema/task.schema';

type RealtimeEventName =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'task.comment.created'
  | 'todo.updated'
  | 'task_todo.overdue_warning'
  | 'task_todo.overdue'
  | 'notification.created';

export type RealtimeTaskPayload =
  | TaskRecord
  | {
      task?: TaskRecord;
      data?: TaskRecord;
      item?: TaskRecord;
      result?: TaskRecord;
      task_id?: number | string;
      id?: number | string;
    };

export type RealtimeTodoPayload =
  | TaskTodoRecord
  | {
      todo?: TaskTodoRecord;
      task_todo?: TaskTodoRecord;
      data?: TaskTodoRecord;
      item?: TaskTodoRecord;
      result?: TaskTodoRecord;
    };

export type RealtimeTaskCommentPayload =
  | TaskCommentRecord
  | {
      comment?: TaskCommentRecord;
      task_comment?: TaskCommentRecord;
      data?: TaskCommentRecord;
      item?: TaskCommentRecord;
      result?: TaskCommentRecord;
    };

export interface RealtimeTaskTodoOverduePayload {
  title?: string;
  message?: string;
  timelog_id?: number | string;
  user_id?: number | string;
  task_todo_id?: number | string;
  task_id?: number | string;
  task_title?: string;
  todo_label?: string;
  estimate_time?: number;
  estimate_time_minutes?: number;
  estimate_time_label?: string;
  elapsed_minutes?: number;
  overdue_minutes?: number;
  remaining_minutes?: number;
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private readonly authService = inject(AuthService);
  private readonly ngZone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl;
  private readonly activeProjectIds = new Set<string>();
  private socket: Socket | null = null;
  private activeToken: string | null = null;

  readonly connected = signal(false);

  private readonly taskCreatedSubject = new Subject<RealtimeTaskPayload>();
  private readonly taskUpdatedSubject = new Subject<RealtimeTaskPayload>();
  private readonly taskMovedSubject = new Subject<RealtimeTaskPayload>();
  private readonly taskDeletedSubject = new Subject<RealtimeTaskPayload>();
  private readonly taskCommentCreatedSubject = new Subject<RealtimeTaskCommentPayload>();
  private readonly todoUpdatedSubject = new Subject<RealtimeTodoPayload>();
  private readonly taskTodoOverdueWarningSubject = new Subject<RealtimeTaskTodoOverduePayload>();
  private readonly taskTodoOverdueSubject = new Subject<RealtimeTaskTodoOverduePayload>();
  private readonly notificationCreatedSubject = new Subject<NotificationItem>();

  readonly taskCreated$ = this.taskCreatedSubject.asObservable();
  readonly taskUpdated$ = this.taskUpdatedSubject.asObservable();
  readonly taskMoved$ = this.taskMovedSubject.asObservable();
  readonly taskDeleted$ = this.taskDeletedSubject.asObservable();
  readonly taskCommentCreated$ = this.taskCommentCreatedSubject.asObservable();
  readonly todoUpdated$ = this.todoUpdatedSubject.asObservable();
  readonly taskTodoOverdueWarning$ = this.taskTodoOverdueWarningSubject.asObservable();
  readonly taskTodoOverdue$ = this.taskTodoOverdueSubject.asObservable();
  readonly notificationCreated$ = this.notificationCreatedSubject.asObservable();

  constructor() {
    this.authService.authChanged$.subscribe((token) => {
      if (token) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  connect(): void {
    const token = this.authService.getToken();

    if (!token) {
      this.disconnect();
      return;
    }

    if (this.socket?.connected && this.activeToken === token) {
      return;
    }

    if (this.isProductionLocalhost()) {
      this.debug('connect.skipped', {
        reason: 'Production builds must not connect to localhost.',
        apiUrl: this.apiUrl,
      });
      return;
    }

    this.disconnect();
    this.activeToken = token;

    this.socket = io(this.apiUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        this.connected.set(true);
        this.debug('connect', { id: this.socket?.id });
        this.rejoinRooms();
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.ngZone.run(() => {
        this.connected.set(false);
        this.debug('disconnect', { reason });
      });
    });

    this.socket.on('connect_error', (error) => {
      this.ngZone.run(() => {
        this.connected.set(false);
        this.debug('connect_error', { message: error.message });
      });
    });

    this.on('task.created', this.taskCreatedSubject);
    this.on('task.updated', this.taskUpdatedSubject);
    this.on('task.moved', this.taskMovedSubject);
    this.on('task.deleted', this.taskDeletedSubject);
    this.on('task.comment.created', this.taskCommentCreatedSubject);
    this.on('todo.updated', this.todoUpdatedSubject);
    this.on('task_todo.overdue_warning', this.taskTodoOverdueWarningSubject);
    this.on('task_todo.overdue', this.taskTodoOverdueSubject);
    this.on('notification.created', this.notificationCreatedSubject);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.activeToken = null;
    this.connected.set(false);
  }

  joinProject(projectId: number | string | null | undefined): void {
    if (!projectId) {
      return;
    }

    const normalizedProjectId = String(projectId);
    this.activeProjectIds.add(normalizedProjectId);
    this.emit('project.join', { project_id: normalizedProjectId });
  }

  joinWorkspace(workspaceId: number | string | null | undefined): void {
    if (!workspaceId) {
      return;
    }

    this.emit('workspace.join', { workspace_id: workspaceId });
  }

  joinTeam(teamId: number | string | null | undefined): void {
    if (!teamId) {
      return;
    }

    this.emit('team.join', { team_id: teamId });
  }

  private emit(eventName: string, payload: unknown): void {
    this.connect();
    this.socket?.emit(eventName, payload);
    this.debug(eventName, payload);
  }

  private on<T>(eventName: RealtimeEventName, subject: Subject<T>): void {
    this.socket?.on(eventName, (payload: T) => {
      this.ngZone.run(() => {
        this.debug(eventName, payload);
        subject.next(payload);
      });
    });
  }

  private rejoinRooms(): void {
    this.activeProjectIds.forEach((projectId) => {
      this.emit('project.join', { project_id: projectId });
    });
  }

  private isProductionLocalhost(): boolean {
    if (isDevMode()) {
      return false;
    }

    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(this.apiUrl);
  }

  private debug(eventName: string, payload: unknown): void {
    if (isDevMode()) {
      console.debug('[socket]', eventName, payload);
    }
  }
}
