import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  RealtimeService,
  RealtimeTaskTodoOverduePayload,
} from '../../../core/realtime/realtime.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import {
  CreateTimelogRequest,
  TimelogRecord,
  TimelogStatus,
  UpdateTimelogRequest,
} from '../schema/timelog.schema';
import { TimelogService } from './timelog.service';

export interface ActiveTimelogState {
  record: TimelogRecord;
  elapsed: string;
  isOverdue?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ActiveTimelogService {
  private readonly authService = inject(AuthService);
  private readonly timelogService = inject(TimelogService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);
  private readonly startSoundUrl = new URL('sound/beep-timelog.mp3', document.baseURI).toString();
  private readonly activeTimelogSignal = signal<ActiveTimelogState | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly isCreatingSignal = signal(false);
  private readonly isEndingSignal = signal(false);
  private readonly isEndDialogOpenSignal = signal(false);
  private readonly finishedTaskTodoIdsSignal = signal<Set<number>>(new Set());
  private readonly pausedTaskTodoTimelogsSignal = signal<Map<number, TimelogRecord>>(new Map());
  private readonly overdueTimelogIdsSignal = signal<Set<number>>(new Set());
  private readonly timelogEndedSubject = new Subject<TimelogRecord>();
  private elapsedTimerId?: ReturnType<typeof setInterval>;

  readonly activeTimelog = computed(() => this.activeTimelogSignal());
  readonly isLoading = computed(() => this.isLoadingSignal());
  readonly isCreating = computed(() => this.isCreatingSignal());
  readonly isEnding = computed(() => this.isEndingSignal());
  readonly isEndDialogOpen = computed(() => this.isEndDialogOpenSignal());
  readonly timelogEnded$ = this.timelogEndedSubject.asObservable();

  constructor() {
    this.setupOverdueSubscriptions();
    this.startElapsedTimer();
  }

  loadActiveTimelog(): void {
    this.isLoadingSignal.set(true);
    this.timelogService
      .getTimelogs()
      .pipe(finalize(() => this.isLoadingSignal.set(false)))
      .subscribe({
        next: (timelogs) => this.syncActiveTimelog(timelogs),
        error: () => this.activeTimelogSignal.set(null),
      });
  }

  createTimelog(payload: CreateTimelogRequest) {
    const start = payload.start || new Date().toISOString();

    this.isCreatingSignal.set(true);
    return this.timelogService
      .createTimelog({
        ...payload,
        status: 'active',
        start,
      })
      .pipe(
        tap((timelog) => {
          this.activeTimelogSignal.set({
            record: {
              ...payload,
              ...timelog,
              status: timelog.status || 'active',
              start: timelog.start || start,
            },
            elapsed: '00:00:00',
            isOverdue: false,
          });
          this.playStartSound();
        }),
        finalize(() => this.isCreatingSignal.set(false)),
      );
  }

  continueTimelog(record: TimelogRecord) {
    if (!record.id) {
      return null;
    }

    const payload: UpdateTimelogRequest = {
      status: 'active',
      end: null as unknown as string,
    };

    this.isCreatingSignal.set(true);
    return this.timelogService.updateTimelog(record.id, payload).pipe(
      tap((timelog) => {
        this.activeTimelogSignal.set({
          record: {
            ...record,
            ...timelog,
            status: 'active',
            start: timelog.start || record.start,
            end: undefined,
          },
          elapsed: this.formatElapsed(timelog.start || record.start),
          isOverdue: this.isRecordOverEstimate({
            ...record,
            ...timelog,
            status: 'active',
            start: timelog.start || record.start,
            end: undefined,
          }),
        });
        if (record.task_todo_id) {
          this.pausedTaskTodoTimelogsSignal.update((items) => {
            const nextItems = new Map(items);
            nextItems.delete(Number(record.task_todo_id));
            return nextItems;
          });
        }
        this.playStartSound();
      }),
      finalize(() => this.isCreatingSignal.set(false)),
    );
  }

  getPausedTaskTodoTimelog(taskTodoId: number | string | undefined): TimelogRecord | null {
    if (!taskTodoId) {
      return null;
    }

    return this.pausedTaskTodoTimelogsSignal().get(Number(taskTodoId)) ?? null;
  }

  isPausedTaskTodo(taskTodoId: number | string | undefined): boolean {
    return Boolean(this.getPausedTaskTodoTimelog(taskTodoId));
  }

  openEndDialog(): void {
    if (!this.activeTimelogSignal()) {
      return;
    }

    this.isEndDialogOpenSignal.set(true);
  }

  closeEndDialog(): void {
    if (this.isEndingSignal()) {
      return;
    }

    this.isEndDialogOpenSignal.set(false);
  }

  endActiveTimelog(
    status: Extract<TimelogStatus, 'pause' | 'finish'>,
    endNote = '',
    photoFile: File | null = null,
  ) {
    const activeTimelog = this.activeTimelogSignal();
    if (!activeTimelog?.record.id) {
      this.activeTimelogSignal.set(null);
      return null;
    }

    const end = new Date().toISOString();
    const minutesLogged = this.calculateMinuteDiff(activeTimelog.record.start, end);
    const payload: UpdateTimelogRequest = {
      end,
      status,
      minuted_logged: minutesLogged,
      time: this.formatMinutes(minutesLogged),
    };

    if (endNote.trim()) {
      payload.end_note = endNote.trim();
    }

    this.isEndingSignal.set(true);
    return this.timelogService.updateTimelog(activeTimelog.record.id, payload).pipe(
      switchMap((timelog) => {
        if (!photoFile) {
          return of(timelog);
        }

        return this.timelogService
          .uploadTimelogFile(activeTimelog.record.id!, photoFile, endNote)
          .pipe(map(() => timelog));
      }),
      tap((timelog) => {
        if (status === 'finish' && activeTimelog.record.task_todo_id) {
          this.finishedTaskTodoIdsSignal.update((ids) =>
            new Set(ids).add(Number(activeTimelog.record.task_todo_id)),
          );
          this.pausedTaskTodoTimelogsSignal.update((items) => {
            const nextItems = new Map(items);
            nextItems.delete(Number(activeTimelog.record.task_todo_id));
            return nextItems;
          });
        }

        if (status === 'pause' && activeTimelog.record.task_todo_id) {
          this.pausedTaskTodoTimelogsSignal.update((items) => {
            const nextItems = new Map(items);
            nextItems.set(Number(activeTimelog.record.task_todo_id), {
              ...activeTimelog.record,
              ...timelog,
              status: 'pause',
            });
            return nextItems;
          });
        }

        this.overdueTimelogIdsSignal.update((items) => {
          const nextItems = new Set(items);
          nextItems.delete(Number(activeTimelog.record.id));
          return nextItems;
        });
        this.activeTimelogSignal.set(null);
        this.isEndDialogOpenSignal.set(false);
        this.timelogEndedSubject.next(timelog);
      }),
      finalize(() => this.isEndingSignal.set(false)),
    );
  }

  isActiveTaskTodo(taskTodoId: number | string | undefined): boolean {
    const activeTimelog = this.activeTimelogSignal();
    return Boolean(
      taskTodoId &&
      activeTimelog?.record.task_todo_id &&
      Number(activeTimelog.record.task_todo_id) === Number(taskTodoId),
    );
  }

  hasActiveTimelog(): boolean {
    return Boolean(this.activeTimelogSignal());
  }

  isFinishedTaskTodo(taskTodoId: number | string | undefined): boolean {
    return Boolean(taskTodoId && this.finishedTaskTodoIdsSignal().has(Number(taskTodoId)));
  }

  private syncActiveTimelog(records: TimelogRecord[]): void {
    const currentUserId = this.authService.getUser()?.id;
    const finishedTaskTodoIds = records
      .filter((record) => record.status === 'finish' && record.task_todo_id)
      .map((record) => Number(record.task_todo_id));
    const pausedTaskTodoTimelogs = records
      .filter(
        (record) =>
          this.isPauseStatus(record.status) &&
          record.task_todo_id &&
          (!currentUserId || Number(record.user_id) === Number(currentUserId)),
      )
      .reduce((items, record) => {
        items.set(Number(record.task_todo_id), record);
        return items;
      }, new Map<number, TimelogRecord>());
    const activeRecord = records.find(
      (record) =>
        (record.status || '').toLowerCase().trim() === 'active' &&
        (!currentUserId || Number(record.user_id) === Number(currentUserId)),
    );

    this.finishedTaskTodoIdsSignal.set(new Set(finishedTaskTodoIds));
    this.pausedTaskTodoTimelogsSignal.set(pausedTaskTodoTimelogs);
    this.activeTimelogSignal.set(
      activeRecord
        ? {
            record: activeRecord,
            elapsed: this.formatElapsed(activeRecord.start),
            isOverdue: this.isRecordOverEstimate(activeRecord),
          }
        : null,
    );
  }

  private startElapsedTimer(): void {
    this.elapsedTimerId = setInterval(() => {
      const activeTimelog = this.activeTimelogSignal();
      if (!activeTimelog) {
        return;
      }

      this.activeTimelogSignal.set({
        ...activeTimelog,
        elapsed: this.formatElapsed(activeTimelog.record.start),
        isOverdue:
          activeTimelog.isOverdue ||
          this.overdueTimelogIdsSignal().has(Number(activeTimelog.record.id)) ||
          this.isRecordOverEstimate(activeTimelog.record),
      });
    }, 1000);
  }

  private setupOverdueSubscriptions(): void {
    this.realtimeService.taskTodoOverdueWarning$.subscribe((payload) => {
      if (!this.isPayloadForActiveTaskTodoTimelog(payload)) {
        return;
      }

      const remainingMinutes = Math.max(0, Number(payload.remaining_minutes ?? 0));
      const message =
        payload.message || `Task todo will be overdue in ${remainingMinutes} minutes.`;

      this.toastService.error({
        title: payload.title || 'Task Todo Overdue Warning',
        message,
      });
      void this.notificationService.showDesktopNotification({
        title: payload.title || 'Task Todo Overdue Warning',
        message,
        type: 'task_todo_overdue_warning',
        task_id: payload.task_id,
        task_todo_id: payload.task_todo_id,
      });
    });

    this.realtimeService.taskTodoOverdue$.subscribe((payload) => {
      if (!this.isPayloadForActiveTaskTodoTimelog(payload)) {
        return;
      }

      const message = payload.message || `${payload.todo_label || 'Task todo'} is overdue.`;
      this.markActiveTimelogOverdue(payload);
      this.toastService.error({
        title: 'Task Todo Overdue',
        message,
      });
      void this.notificationService.showDesktopNotification({
        title: 'Task Todo Overdue',
        message,
        type: 'task_todo_overdue',
        task_id: payload.task_id,
        task_todo_id: payload.task_todo_id,
      });
    });
  }

  private isPayloadForActiveTaskTodoTimelog(payload: RealtimeTaskTodoOverduePayload): boolean {
    const activeTimelog = this.activeTimelogSignal();
    const currentUserId = Number(this.authService.getUser()?.id);
    const payloadUserId = Number(payload.user_id);
    const activeTimelogId = Number(activeTimelog?.record.id);
    const payloadTimelogId = Number(payload.timelog_id);
    const activeTaskTodoId = Number(activeTimelog?.record.task_todo_id);
    const payloadTaskTodoId = Number(payload.task_todo_id);
    const estimateMinutes = Number(payload.estimate_time_minutes ?? 0);

    return Boolean(
      activeTimelog?.record.task_todo_id &&
      Number.isInteger(currentUserId) &&
      Number.isInteger(payloadUserId) &&
      currentUserId === payloadUserId &&
      Number.isInteger(activeTimelogId) &&
      Number.isInteger(payloadTimelogId) &&
      activeTimelogId === payloadTimelogId &&
      Number.isInteger(activeTaskTodoId) &&
      Number.isInteger(payloadTaskTodoId) &&
      activeTaskTodoId === payloadTaskTodoId &&
      estimateMinutes > 0,
    );
  }

  private markActiveTimelogOverdue(payload: RealtimeTaskTodoOverduePayload): void {
    const activeTimelog = this.activeTimelogSignal();
    if (!activeTimelog?.record.id) {
      return;
    }

    this.overdueTimelogIdsSignal.update((items) =>
      new Set(items).add(Number(activeTimelog.record.id)),
    );
    this.activeTimelogSignal.set({
      ...activeTimelog,
      record: {
        ...activeTimelog.record,
        task_todo: activeTimelog.record.task_todo
          ? {
              ...activeTimelog.record.task_todo,
              estimate_time: payload.estimate_time ?? activeTimelog.record.task_todo.estimate_time,
              estimate_time_minutes:
                payload.estimate_time_minutes ??
                activeTimelog.record.task_todo.estimate_time_minutes,
              estimate_time_label:
                payload.estimate_time_label ?? activeTimelog.record.task_todo.estimate_time_label,
            }
          : activeTimelog.record.task_todo,
      },
      isOverdue: true,
    });
  }

  private isRecordOverEstimate(record: TimelogRecord): boolean {
    if (!record.task_todo_id) {
      return false;
    }

    const estimateMinutes = Number(record.task_todo?.estimate_time_minutes ?? 0);
    if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) {
      return false;
    }

    return this.calculateMinuteDiff(record.start, new Date().toISOString()) > estimateMinutes;
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;

    if (
      !startDate ||
      !endDate ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private formatElapsed(start?: string): string {
    const startDate = start ? new Date(start) : null;

    if (!startDate || Number.isNaN(startDate.getTime())) {
      return '00:00:00';
    }

    const totalSeconds = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((item) => String(item).padStart(2, '0')).join(':');
  }

  private formatMinutes(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  private isPauseStatus(status: string | undefined): boolean {
    const normalized = (status || '').toLowerCase().trim();
    return normalized === 'pause' || normalized === 'paused';
  }

  private playStartSound(): void {
    const audio = new Audio(this.startSoundUrl);
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Browser/Electron can block audio until the user has interacted with the app.
    });
  }
}
