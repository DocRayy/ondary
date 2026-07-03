import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin, of, Subscription } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import gsap from 'gsap';

import { AuthService } from '../../../../core/auth/auth.service';
import { RolePermissionService } from '../../../../core/auth/role-permission.service';
import {
  CreateTaskRequest,
  TaskAttachmentRecord,
  TaskCommentRecord,
  CreateTaskTodoRequest,
  ProjectOption,
  TaskLabelOption,
  TaskRecord,
  TaskStatus,
  TaskTodoStatus,
  TaskTodoRecord,
  UserOption,
  getTaskUserIds,
  getTaskUsers,
  parseTaskIdList,
} from '../../schema/task.schema';
import { TaskService } from '../../service/task.service';
import { ActiveTimelogService } from '../../../timelog/service/active-timelog.service';
import { TimelogRecord } from '../../../timelog/schema/timelog.schema';
import { TimelogService } from '../../../timelog/service/timelog.service';
import dayjs from 'dayjs';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FcIconComponent } from '@app/shared/components/fc-icon/fc-icon.component';
import { GsapModalDirective } from '../../../../shared/directives/gsap-modal.directive';
import { getApiMediaUrl, getFirstMediaUrl } from '@app/shared/utils/media';
import {
  RealtimeService,
  RealtimeTaskCommentPayload,
  RealtimeTodoPayload,
} from '../../../../core/realtime/realtime.service';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, FcIconComponent, GsapModalDirective],
  templateUrl: './task-dialog.component.html',
})
export class TaskDialogComponent implements OnInit, OnChanges, OnDestroy {
  private readonly taskService = inject(TaskService);
  readonly activeTimelogService = inject(ActiveTimelogService);
  private readonly timelogService = inject(TimelogService);
  private readonly authService = inject(AuthService);
  private readonly rolePermissionService = inject(RolePermissionService);
  private readonly toastService = inject(ToastService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly realtimeSubscriptions: Subscription[] = [];
  private readonly maxAttachmentSize = 10 * 1024 * 1024;

  @Input() visible = false;
  @Input() defaultStatus: TaskStatus = 'draft';
  @Input() orderIndex = 0;
  @Input() task: TaskRecord | null = null;
  @Input() highlightedTodoId: number | string | null = null;
  @Input() isReadonly = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() taskCreated = new EventEmitter<TaskRecord>();
  @Output() taskUpdated = new EventEmitter<TaskRecord>();
  @Output() taskDeleted = new EventEmitter<number | string>();

  readonly statusOptions: Array<{ label: string; value: TaskStatus }> = [
    { label: 'Draft', value: 'draft' },
    { label: 'Progress', value: 'progress' },
    { label: 'On Hold', value: 'on_hold' },
    { label: 'Completed', value: 'completed' },
  ];

  readonly isManager = this.rolePermissionService.isManager();

  projects: ProjectOption[] = [];
  users: UserOption[] = [];
  taskLabels: TaskLabelOption[] = [];
  selectedProject?: ProjectOption;
  selectedUsers: UserOption[] = [];
  selectedDueDate = dayjs().format('YYYY-MM-DD');
  selectedLabels: TaskLabelOption[] = [];
  isUserDialogOpen = false;
  isTodoDialogOpen = false;
  isTodoUserDialogOpen = false;
  isDeleteDialogOpen = false;
  isAttachmentDialogOpen = false;
  isAttachmentViewerOpen = false;
  isLabelComboboxOpen = false;
  isProjectComboboxOpen = false;
  isUploadingAttachments = false;
  isDragOverAttachmentDropzone = false;
  isLoadingComments = false;
  isSubmittingComment = false;
  isMentionMenuOpen = false;
  activeMentionPopoverKey: string | null = null;
  activeMentionPopover: MentionPopoverState | null = null;
  isSaving = false;
  isAddingTodo = false;
  isDeletingTodo = false;
  isDeleting = false;
  isLoadingTaskTodos = false;
  isLoadingProjects = false;
  isLoadingUsers = false;
  isLoadingTaskLabels = false;
  creatingTimelogTodoId: number | string | null = null;
  editingTodoClientId: number | null = null;
  errorMessage = '';
  todoErrorMessage = '';
  attachmentErrorMessage = '';
  commentErrorMessage = '';
  activeTab: TaskDialogTab = 'todo';
  commentMessage = '';

  form: TaskDialogForm = this.createInitialForm();
  todoForm: TaskTodoDialogForm = this.createInitialTodoForm();
  taskTodos: TaskTodoDraft[] = [];
  todoTimelogs: TimelogRecord[] = [];
  todoClockTick = Date.now();
  attachments: TaskAttachmentView[] = [];
  pendingAttachmentFiles: TaskAttachmentView[] = [];
  selectedAttachment: TaskAttachmentView | null = null;
  selectedAttachmentSafeUrl: SafeResourceUrl | null = null;
  deletedAttachmentIds: Array<number | string> = [];
  taskComments: TaskCommentRecord[] = [];
  private todoClockTimerId?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.loadProjects();
    this.loadTaskLabels();
    this.setupRealtimeSubscriptions();
    this.startTodoClockTimer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.prepareFormForOpen();
    }
  }

  ngOnDestroy(): void {
    this.realtimeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.revokeAttachmentUrls(this.attachments);
    this.revokeAttachmentUrls(this.pendingAttachmentFiles);
    if (this.todoClockTimerId) {
      clearInterval(this.todoClockTimerId);
    }
  }

  onVisibleChange(nextVisible: boolean): void {
    this.visible = nextVisible;
    this.visibleChange.emit(nextVisible);
  }

  openUserDialog(): void {
    if (this.isReadonly) {
      return;
    }

    this.isUserDialogOpen = true;

    if (!this.users.length) {
      this.loadUsers();
    }
  }

  toggleUser(user: UserOption): void {
    if (this.isReadonly) {
      return;
    }

    if (this.isUserSelected(user)) {
      this.selectedUsers = this.selectedUsers.filter((item) => Number(item.id) !== Number(user.id));
      return;
    }

    this.selectedUsers = [...this.selectedUsers, user];
  }

  closeUserDialog(): void {
    this.isUserDialogOpen = false;
  }

  isUserSelected(user: UserOption): boolean {
    return this.selectedUsers.some((item) => Number(item.id) === Number(user.id));
  }

  removeSelectedUser(user: UserOption): void {
    if (this.isReadonly) {
      return;
    }

    this.selectedUsers = this.selectedUsers.filter((item) => Number(item.id) !== Number(user.id));
  }

  toggleLabelCombobox(): void {
    if (this.isReadonly) {
      return;
    }

    this.isLabelComboboxOpen = !this.isLabelComboboxOpen;

    if (!this.taskLabels.length && !this.isLoadingTaskLabels) {
      this.loadTaskLabels();
    }
  }

  closeLabelCombobox(): void {
    this.isLabelComboboxOpen = false;
  }

  toggleProjectCombobox(): void {
    if (this.isReadonly) {
      return;
    }

    this.isProjectComboboxOpen = !this.isProjectComboboxOpen;

    if (!this.projects.length && !this.isLoadingProjects) {
      this.loadProjects();
    }
  }

  closeProjectCombobox(): void {
    this.isProjectComboboxOpen = false;
  }

  selectProject(project: ProjectOption): void {
    if (this.isReadonly) {
      return;
    }

    this.selectedProject = project;
    this.closeProjectCombobox();
  }

  openDeleteDialog(): void {
    if (this.isReadonly || !this.task?.id) {
      return;
    }

    this.isDeleteDialogOpen = true;
  }

  closeDeleteDialog(): void {
    if (this.isDeleting) {
      return;
    }

    this.isDeleteDialogOpen = false;
  }

  setActiveTab(tab: TaskDialogTab): void {
    if (tab === 'comments' && !this.task?.id) {
      return;
    }

    if (this.activeTab === tab) {
      return;
    }

    this.activeTab = tab;

    if (tab === 'comments' && !this.taskComments.length && !this.isLoadingComments) {
      this.loadTaskComments();
    } else if (tab === 'comments') {
      this.scrollCommentsToLatest();
    }

    window.setTimeout(() => {
      const panel = document.querySelector('[data-task-dialog-tab-panel]');
      if (panel) {
        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power2.out' },
        );
      }
    });
  }

  confirmDeleteTask(): void {
    const taskId = this.task?.id;
    if (!taskId || this.isReadonly) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';
    this.taskService.deleteTask(taskId).subscribe({
      next: (response) => {
        this.isDeleting = false;
        this.isDeleteDialogOpen = false;
        this.taskDeleted.emit(taskId);
        this.onVisibleChange(false);
        this.resetForm();
        this.toastService.success(response);
      },
      error: (error) => {
        this.isDeleting = false;
        this.isDeleteDialogOpen = false;
        this.errorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  toggleTaskLabel(label: TaskLabelOption): void {
    if (this.isReadonly) {
      return;
    }

    if (this.isTaskLabelSelected(label)) {
      this.selectedLabels = this.selectedLabels.filter(
        (item) => Number(item.id) !== Number(label.id),
      );
      return;
    }

    this.selectedLabels = [...this.selectedLabels, label];
  }

  isTaskLabelSelected(label: TaskLabelOption): boolean {
    return this.selectedLabels.some((item) => Number(item.id) === Number(label.id));
  }

  getTaskLabelBadgeClass(color: string | undefined): string {
    const colorClasses: Record<string, string> = {
      green: 'bg-green-100 text-green-700 ring-green-200',
      blue: 'bg-blue-100 text-blue-700 ring-blue-200',
      red: 'bg-red-100 text-red-700 ring-red-200',
      amber: 'bg-amber-100 text-amber-700 ring-amber-200',
      yellow: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
    };

    return (
      colorClasses[(color || '').toLowerCase()] ||
      'bg-neutral-100 text-neutral-700 ring-neutral-200'
    );
  }

  openTodoDialog(): void {
    if (this.isReadonly) {
      return;
    }

    this.editingTodoClientId = null;
    this.todoForm = this.createInitialTodoForm();
    this.todoErrorMessage = '';
    this.isTodoDialogOpen = true;
    this.animateTodoDialogIn();

    if (!this.users.length && !this.isLoadingUsers) {
      this.loadUsers();
    }
  }

  closeTodoDialog(): void {
    this.animateTodoDialogOut(() => {
      this.isTodoDialogOpen = false;
      this.isTodoUserDialogOpen = false;
      this.todoErrorMessage = '';
      this.editingTodoClientId = null;
    });
  }

  openEditTodoDialog(todo: TaskTodoDraft, event?: MouseEvent): void {
    event?.stopPropagation();

    if (this.isReadonly || !this.isManager) {
      return;
    }

    this.editingTodoClientId = todo.clientId;
    this.todoForm = {
      label: todo.label,
      user: todo.user,
      users: this.getTodoAssignees(todo),
      estimate_time:
        todo.estimate_time !== undefined && todo.estimate_time !== null
          ? Number(todo.estimate_time)
          : null,
    };
    this.todoErrorMessage = '';
    this.isTodoDialogOpen = true;
    this.animateTodoDialogIn();

    if (!this.users.length && !this.isLoadingUsers) {
      this.loadUsers();
    }
  }

  openTodoUserDialog(): void {
    if (!this.isManager) {
      return;
    }

    this.isTodoUserDialogOpen = true;

    if (!this.users.length) {
      this.loadUsers();
    }
  }

  selectTodoUser(user: UserOption): void {
    this.todoForm.user = user;
    this.todoForm.users = [user];
    this.isTodoUserDialogOpen = false;
  }

  toggleTodoUser(user: UserOption): void {
    if (!this.isManager) {
      return;
    }

    if (this.isTodoUserSelected(user)) {
      this.todoForm.users = this.todoForm.users.filter(
        (item) => Number(item.id) !== Number(user.id),
      );
      this.todoForm.user = this.todoForm.users[0];
      return;
    }

    this.todoForm.users = [...this.todoForm.users, user];
    this.todoForm.user = this.todoForm.users[0];
  }

  isTodoUserSelected(user: UserOption): boolean {
    return this.todoForm.users.some((item) => Number(item.id) === Number(user.id));
  }

  submitTaskTodo(): void {
    if (this.editingTodoClientId !== null) {
      this.updateTaskTodo();
      return;
    }

    this.addTaskTodo();
  }

  addTaskTodo(): void {
    if (this.isReadonly) {
      return;
    }

    const label = this.todoForm.label.trim();

    if (!label) {
      this.todoErrorMessage = 'Todo label is required.';
      return;
    }

    const estimateTime = Number(this.todoForm.estimate_time);
    const currentUserId = this.getCurrentUserId();

    if (!currentUserId) {
      this.todoErrorMessage = 'Login user is required to create task todo.';
      return;
    }

    const assigneeUsers = this.isManager
      ? this.todoForm.users
      : [this.createCurrentTodoUser(currentUserId)];
    const assigneeIds = assigneeUsers
      .map((user) => Number(user.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (this.isManager && !assigneeIds.length) {
      this.todoErrorMessage = 'Todo assignee is required.';
      return;
    }

    if (this.isManager && !assigneeIds.every((id) => this.isAllowedTaskTodoUser(id))) {
      this.todoErrorMessage = 'Todo assignee must be one of this task members.';
      return;
    }

    if (
      this.isManager &&
      this.todoForm.estimate_time !== null &&
      (!Number.isFinite(estimateTime) || estimateTime < 0)
    ) {
      this.todoErrorMessage = 'Estimate time must be a valid number of hours.';
      return;
    }

    const draft: TaskTodoDraft = {
      clientId: Date.now() + Math.random(),
      label,
      progress: 0,
      status: 'pending',
      user: assigneeUsers[0],
      users: assigneeUsers,
      user_ids: assigneeIds,
      created_by: currentUserId,
      estimate_time:
        this.isManager && this.todoForm.estimate_time !== null ? estimateTime : undefined,
    };

    if (!this.task?.id) {
      this.taskTodos.push(draft);
      this.closeTodoDialog();
      return;
    }

    const taskId = Number(this.task.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      this.todoErrorMessage = 'Task is required to create task todo.';
      return;
    }

    const payload: CreateTaskTodoRequest = {
      task_id: taskId,
      label,
      progress: draft.progress,
      status: draft.status,
      created_by: currentUserId,
    };

    if (this.isManager) {
      payload.user_ids = assigneeIds;
      payload.user_id = assigneeIds[0];

      if (draft.estimate_time !== undefined) {
        payload.estimate_time = draft.estimate_time;
      }
    }

    this.isAddingTodo = true;
    this.taskService.createTaskTodo(payload).subscribe({
      next: (createdTodo) => {
        this.isAddingTodo = false;
        this.taskTodos = [
          ...this.taskTodos,
          {
            ...draft,
            id: createdTodo.id,
            progress: Number(createdTodo.progress ?? draft.progress),
            status: createdTodo.status || draft.status,
            user: createdTodo.user || draft.user,
            users: createdTodo.users || draft.users,
            user_ids: createdTodo.user_ids || draft.user_ids,
            user_id: createdTodo.user_id ?? draft.user_id,
            created_by: createdTodo.created_by ?? draft.created_by,
            updated_by: createdTodo.updated_by ?? draft.updated_by,
            estimate_time: createdTodo.estimate_time ?? draft.estimate_time,
            estimate_time_hours: createdTodo.estimate_time_hours,
            estimate_time_minutes: createdTodo.estimate_time_minutes,
            estimate_time_label: createdTodo.estimate_time_label,
            created_at: createdTodo.created_at,
            updated_at: createdTodo.updated_at,
          },
        ];
        this.emitTaskTodoUpdate();
        this.closeTodoDialog();
        this.toastService.success(createdTodo);
      },
      error: (error) => {
        this.isAddingTodo = false;
        this.todoErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  updateTaskTodo(): void {
    if (this.isReadonly || !this.isManager || this.editingTodoClientId === null) {
      return;
    }

    const todo = this.taskTodos.find((item) => item.clientId === this.editingTodoClientId);
    if (!todo) {
      this.todoErrorMessage = 'Task todo is no longer available.';
      return;
    }

    const label = this.todoForm.label.trim();
    const assigneeUsers = this.todoForm.users;
    const assigneeIds = assigneeUsers
      .map((user) => Number(user.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const estimateTime = Number(this.todoForm.estimate_time);
    const currentUserId = this.getCurrentUserId();

    if (!currentUserId) {
      this.todoErrorMessage = 'Login user is required to update task todo.';
      return;
    }

    if (!label) {
      this.todoErrorMessage = 'Todo label is required.';
      return;
    }

    if (!assigneeIds.length) {
      this.todoErrorMessage = 'Todo assignee is required.';
      return;
    }

    if (!assigneeIds.every((id) => this.isAllowedTaskTodoUser(id))) {
      this.todoErrorMessage = 'Todo assignee must be one of this task members.';
      return;
    }

    if (
      this.todoForm.estimate_time !== null &&
      (!Number.isFinite(estimateTime) || estimateTime < 0)
    ) {
      this.todoErrorMessage = 'Estimate time must be a valid number of hours.';
      return;
    }

    const draft: TaskTodoDraft = {
      ...todo,
      label,
      user: assigneeUsers[0],
      users: assigneeUsers,
      user_id: assigneeIds[0],
      user_ids: assigneeIds,
      estimate_time: this.todoForm.estimate_time !== null ? estimateTime : undefined,
      estimate_time_label:
        this.todoForm.estimate_time !== null ? undefined : todo.estimate_time_label,
    };

    if (!todo.id) {
      this.taskTodos = this.taskTodos.map((item) =>
        item.clientId === todo.clientId ? draft : item,
      );
      this.emitTaskTodoUpdate();
      this.closeTodoDialog();
      return;
    }

    const payload: Partial<CreateTaskTodoRequest> = {
      label,
      user_id: assigneeIds[0],
      user_ids: assigneeIds,
      updated_by: currentUserId,
    };

    if (draft.estimate_time !== undefined) {
      payload.estimate_time = draft.estimate_time;
    }

    this.isAddingTodo = true;
    this.taskService.updateTaskTodo(todo.id, payload).subscribe({
      next: (updatedTodo) => {
        this.isAddingTodo = false;
        this.taskTodos = this.taskTodos.map((item) =>
          item.clientId === todo.clientId
            ? this.mapTaskTodoToDraft({
                ...draft,
                ...updatedTodo,
                id: updatedTodo.id ?? todo.id,
                task_id: Number(updatedTodo.task_id ?? todo.task_id),
              })
            : item,
        );
        this.emitTaskTodoUpdate();
        this.closeTodoDialog();
        this.toastService.success(updatedTodo);
      },
      error: (error) => {
        this.isAddingTodo = false;
        this.todoErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  removeTaskTodo(todo: TaskTodoDraft): void {
    if (this.isReadonly) {
      return;
    }

    this.taskTodos = this.taskTodos.filter((item) => item.clientId !== todo.clientId);
  }

  deleteEditingTaskTodo(): void {
    if (this.isReadonly || !this.isManager || this.editingTodoClientId === null) {
      return;
    }

    const todo = this.taskTodos.find((item) => item.clientId === this.editingTodoClientId);
    if (!todo) {
      this.todoErrorMessage = 'Task todo is no longer available.';
      return;
    }

    if (!todo.id) {
      this.taskTodos = this.taskTodos.filter((item) => item.clientId !== todo.clientId);
      this.emitTaskTodoUpdate();
      this.closeTodoDialog();
      return;
    }

    this.isDeletingTodo = true;
    this.taskService.deleteTaskTodo(todo.id).subscribe({
      next: (response) => {
        this.isDeletingTodo = false;
        this.taskTodos = this.taskTodos.filter((item) => item.clientId !== todo.clientId);
        this.todoTimelogs = this.todoTimelogs.filter(
          (timelog) => String(timelog.task_todo_id) !== String(todo.id),
        );
        this.emitTaskTodoUpdate();
        this.closeTodoDialog();
        this.toastService.success(response);
      },
      error: (error) => {
        this.isDeletingTodo = false;
        this.todoErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  getTodoProgress(): number {
    if (!this.taskTodos.length) {
      return 0;
    }

    const total = this.taskTodos.reduce((sum, todo) => sum + Number(todo.progress || 0), 0);
    return Math.round(total / this.taskTodos.length);
  }

  getTaskProgress(): number {
    const progress = Number(this.task?.progress ?? 0);
    if (!Number.isFinite(progress)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  getTodoAssigneeLabel(todo: TaskTodoDraft): string {
    const users = this.getTodoAssignees(todo);
    return users.length ? users.map((user) => this.getUserLabel(user)).join(', ') : 'Unassigned';
  }

  getTodoStatusLabel(todo: TaskTodoDraft): string {
    const statusLabels: Record<TaskTodoStatus, string> = {
      pending: 'Pending',
      progress: 'Progress',
      completed: 'Completed',
      completed_but_overdue: 'Completed but Overdue',
    };

    return statusLabels[todo.status] || todo.status;
  }

  getTodoEstimateLabel(todo: TaskTodoDraft): string {
    if (todo.estimate_time_label) {
      return todo.estimate_time_label;
    }

    const estimateHours = Number(todo.estimate_time_hours ?? todo.estimate_time);
    return Number.isFinite(estimateHours) && estimateHours > 0 ? `${estimateHours}h` : '';
  }

  getTodoAssignees(todo: TaskTodoDraft): UserOption[] {
    if (todo.users?.length) {
      return todo.users.filter(Boolean);
    }

    if (todo.user) {
      return [todo.user];
    }

    const fallbackIds = [
      ...this.parseIdList(todo.user_ids),
      Number(todo.user_id),
      Number(todo.created_by),
    ].filter((id) => Number.isInteger(id) && id > 0);
    const uniqueFallbackIds = Array.from(new Set(fallbackIds));

    const fallbackUsers = uniqueFallbackIds
      .map((id) => this.createSelectedUser(id))
      .filter((user): user is UserOption => Boolean(user));

    if (fallbackUsers.length) {
      return fallbackUsers;
    }

    const currentUserId = this.getCurrentUserId();
    return !this.isManager && currentUserId ? [this.createCurrentTodoUser(currentUserId)] : [];
  }

  getTodoAvatarUsers(todo: TaskTodoDraft): UserOption[] {
    return this.getTodoAssignees(todo).slice(0, 4);
  }

  getTodoAvatarGridClass(todo: TaskTodoDraft): string {
    const count = this.getTodoAvatarUsers(todo).length;
    return count > 1 ? 'grid-cols-2' : 'grid-cols-1';
  }

  getTodoAvatarTileClass(todo: TaskTodoDraft, index: number): string {
    const count = this.getTodoAvatarUsers(todo).length;
    if (count === 3 && index === 0) {
      return 'col-span-2';
    }

    return '';
  }

  getTodoCreatedTime(todo: TaskTodoDraft): string {
    return this.formatTime(this.getTodoTimelogStart(todo));
  }

  getTodoUpdatedTime(todo: TaskTodoDraft): string {
    return this.formatTime(this.getTodoTimelogEnd(todo));
  }

  isHighlightedTodo(todo: TaskTodoDraft): boolean {
    return Boolean(
      this.highlightedTodoId && todo.id && String(todo.id) === String(this.highlightedTodoId),
    );
  }

  getTodoDuration(todo: TaskTodoDraft): string {
    const timelog = this.getPrimaryTodoTimelog(todo);
    if (!timelog) {
      return '-';
    }

    if (this.isActiveTimelogRecord(timelog)) {
      return this.formatElapsed(timelog.start);
    }

    const loggedMinutes = Number(timelog.minuted_logged);
    if (Number.isFinite(loggedMinutes) && loggedMinutes > 0) {
      return this.formatMinutes(Math.round(loggedMinutes));
    }

    return this.formatMinutes(this.calculateMinuteDiff(timelog.start, timelog.end));
  }

  getTodoTimelogStart(todo: TaskTodoDraft): string | undefined {
    return this.getPrimaryTodoTimelog(todo)?.start;
  }

  getTodoTimelogEnd(todo: TaskTodoDraft): string | undefined {
    const timelog = this.getPrimaryTodoTimelog(todo);
    return timelog && !this.isActiveTimelogRecord(timelog) ? timelog.end : undefined;
  }

  private getPrimaryTodoTimelog(todo: TaskTodoDraft): TimelogRecord | null {
    const timelogs = this.getTodoTimelogs(todo);
    if (!timelogs.length) {
      return null;
    }

    const activeTimelog = timelogs.find((timelog) => this.isActiveTimelogRecord(timelog));
    return activeTimelog || timelogs[0];
  }

  private getTodoTimelogs(todo: TaskTodoDraft): TimelogRecord[] {
    if (!todo.id) {
      return [];
    }

    return this.todoTimelogs
      .filter((timelog) => String(timelog.task_todo_id) === String(todo.id))
      .sort((first, second) => this.getTimelogSortTime(second) - this.getTimelogSortTime(first));
  }

  private getTimelogSortTime(timelog: TimelogRecord): number {
    return this.parseDate(timelog.start || timelog.created_at)?.getTime() ?? 0;
  }

  private isActiveTimelogRecord(timelog: TimelogRecord): boolean {
    return (timelog.status || '').toLowerCase().trim() === 'active' || !timelog.end;
  }

  canCreateTimelog(todo: TaskTodoDraft): boolean {
    if (
      !todo.id ||
      this.creatingTimelogTodoId ||
      this.activeTimelogService.isFinishedTaskTodo(todo.id)
    ) {
      return false;
    }

    if (!this.isCurrentUserTodoAssignee(todo)) {
      return false;
    }

    return (
      !this.activeTimelogService.hasActiveTimelog() ||
      this.activeTimelogService.isActiveTaskTodo(todo.id)
    );
  }

  isTodoActiveTimelog(todo: TaskTodoDraft): boolean {
    return this.activeTimelogService.isActiveTaskTodo(todo.id);
  }

  isTodoFinishedTimelog(todo: TaskTodoDraft): boolean {
    return this.activeTimelogService.isFinishedTaskTodo(todo.id);
  }

  isTodoPausedTimelog(todo: TaskTodoDraft): boolean {
    return this.activeTimelogService.isPausedTaskTodo(todo.id);
  }

  createTimelogForTodo(todo: TaskTodoDraft): void {
    if (this.isTodoActiveTimelog(todo)) {
      this.activeTimelogService.openEndDialog();
      return;
    }

    if (!todo.id) {
      this.errorMessage = 'Save task todo before creating timelog.';
      return;
    }

    if (!this.isCurrentUserTodoAssignee(todo)) {
      this.errorMessage = 'You can only create timelog for your assigned todo.';
      return;
    }

    const pausedTimelog = this.activeTimelogService.getPausedTaskTodoTimelog(todo.id);
    if (pausedTimelog) {
      this.errorMessage = '';
      this.creatingTimelogTodoId = todo.id;
      this.activeTimelogService.continueTimelog(pausedTimelog)?.subscribe({
        next: (response) => {
          this.creatingTimelogTodoId = null;
          this.upsertTodoTimelog(response);
          this.toastService.success(response);
        },
        error: (error) => {
          this.creatingTimelogTodoId = null;
          this.errorMessage = this.toastService.getErrorMessage(error, '');
          this.toastService.errorFrom(error);
        },
      });
      return;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      this.errorMessage = 'User is required to create timelog.';
      return;
    }

    this.errorMessage = '';
    this.creatingTimelogTodoId = todo.id;
    this.activeTimelogService
      .createTimelog({
        user_id: userId,
        task_todo_id: Number(todo.id),
        name: todo.label,
        start: new Date().toISOString(),
      })
      .subscribe({
        next: (response) => {
          this.creatingTimelogTodoId = null;
          this.upsertTodoTimelog(response);
          this.toastService.success(response);
        },
        error: (error) => {
          this.creatingTimelogTodoId = null;
          this.errorMessage = this.toastService.getErrorMessage(error, '');
          this.toastService.errorFrom(error);
        },
      });
  }

  saveTask(): void {
    if (this.isReadonly) {
      return;
    }

    this.errorMessage = '';

    const payload = this.createPayload();
    if (!payload) {
      return;
    }

    if (this.task?.id) {
      this.updateTask(payload);
      return;
    }

    this.isSaving = true;
    this.taskService
      .createTask(payload)
      .pipe(switchMap((task) => this.createTaskTodos(task)))
      .pipe(switchMap((task) => this.deleteRemovedAttachments(task)))
      .pipe(switchMap((task) => this.uploadPendingAttachmentsAfterCreate(task)))
      .subscribe({
        next: (task) => {
          this.isSaving = false;
          this.taskCreated.emit({
            ...task,
            assignee_user_ids: this.selectedUsers.map((user) => Number(user.id)),
            user: this.selectedUsers,
            label_ids: this.selectedLabels.map((label) => Number(label.id)),
            labels: this.selectedLabels,
          });
          this.onVisibleChange(false);
          this.resetForm();
          this.toastService.success(task);
        },
        error: (error) => {
          this.isSaving = false;
          this.errorMessage = this.toastService.getErrorMessage(error, '');
          this.toastService.errorFrom(error);
        },
      });
  }

  getProjectName(project: ProjectOption): string {
    return project.name || project.label || `Project #${project.id}`;
  }

  getProjectInitial(project: ProjectOption | undefined): string {
    return (
      String(project ? this.getProjectName(project) : '?')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?'
    );
  }

  getProjectPhoto(project: ProjectOption | undefined): string {
    return getFirstMediaUrl(project) || '';
  }

  getUserLabel(user: UserOption): string {
    return user.username || user.name || user.email;
  }

  getUserInitial(user: UserOption | undefined): string {
    return (
      String(user?.name || user?.username || user?.email || '?')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?'
    );
  }

  getUserPhoto(user: UserOption | undefined): string {
    return getFirstMediaUrl(user) || '';
  }

  openAttachmentDialog(): void {
    if (this.isReadonly) {
      return;
    }

    this.attachmentErrorMessage = '';
    this.revokeAttachmentUrls(this.pendingAttachmentFiles);
    this.pendingAttachmentFiles = [];
    this.isAttachmentDialogOpen = true;
  }

  closeAttachmentDialog(): void {
    if (this.isUploadingAttachments) {
      return;
    }

    this.isAttachmentDialogOpen = false;
    this.attachmentErrorMessage = '';
    this.isDragOverAttachmentDropzone = false;
    this.revokeAttachmentUrls(this.pendingAttachmentFiles);
    this.pendingAttachmentFiles = [];
  }

  onAttachmentInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addPendingAttachmentFiles(input.files);
    input.value = '';
  }

  onAttachmentDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverAttachmentDropzone = true;
  }

  onAttachmentDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverAttachmentDropzone = false;
  }

  onAttachmentDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverAttachmentDropzone = false;
    this.addPendingAttachmentFiles(event.dataTransfer?.files ?? null);
  }

  removePendingAttachmentFile(file: TaskAttachmentView): void {
    this.revokeAttachmentUrls([file]);
    this.pendingAttachmentFiles = this.pendingAttachmentFiles.filter(
      (item) => item.clientId !== file.clientId,
    );
  }

  confirmAttachmentFiles(): void {
    if (!this.pendingAttachmentFiles.length) {
      this.closeAttachmentDialog();
      return;
    }

    this.attachments = [...this.attachments, ...this.pendingAttachmentFiles];
    this.pendingAttachmentFiles = [];
    this.isAttachmentDialogOpen = false;
  }

  openAttachmentViewer(attachment: TaskAttachmentView): void {
    this.selectedAttachment = attachment;
    this.selectedAttachmentSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.getAttachmentUrl(attachment),
    );
    this.isAttachmentViewerOpen = true;
  }

  closeAttachmentViewer(): void {
    this.isAttachmentViewerOpen = false;
    this.selectedAttachment = null;
    this.selectedAttachmentSafeUrl = null;
  }

  removeAttachment(attachment: TaskAttachmentView, event?: Event): void {
    event?.stopPropagation();

    if (this.isReadonly) {
      return;
    }

    if (attachment.id) {
      this.deletedAttachmentIds = [...this.deletedAttachmentIds, attachment.id].filter(
        (id, index, ids) => ids.findIndex((item) => String(item) === String(id)) === index,
      );
    } else {
      this.revokeAttachmentUrls([attachment]);
    }

    if (
      this.selectedAttachment &&
      (this.selectedAttachment.clientId === attachment.clientId ||
        (this.selectedAttachment.id &&
          String(this.selectedAttachment.id) === String(attachment.id)))
    ) {
      this.closeAttachmentViewer();
    }

    this.attachments = this.attachments.filter(
      (item) =>
        item.clientId !== attachment.clientId &&
        (!attachment.id || String(item.id) !== String(attachment.id)),
    );
  }

  getAttachmentIconLabel(attachment: TaskAttachmentView): string {
    const mimeType = attachment.mime_type || attachment.file?.type || '';
    if (mimeType.includes('pdf')) {
      return 'PDF';
    }

    if (mimeType.startsWith('image/')) {
      return 'IMG';
    }

    const extension = this.getAttachmentExtension(attachment);
    return extension || 'FILE';
  }

  getAttachmentName(attachment: TaskAttachmentView): string {
    return attachment.original_name || attachment.files || attachment.file?.name || 'Attachment';
  }

  getAttachmentSizeLabel(attachment: TaskAttachmentView): string {
    const size = Number(attachment.size ?? attachment.file?.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      return '-';
    }

    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  getAttachmentUrl(attachment: TaskAttachmentView | null): string {
    if (!attachment) {
      return '';
    }

    return attachment.previewUrl || getApiMediaUrl(attachment.file_path || attachment.files) || '';
  }

  isImageAttachment(attachment: TaskAttachmentView | null): boolean {
    const mimeType = attachment?.mime_type || attachment?.file?.type || '';
    return mimeType.startsWith('image/');
  }

  isPdfAttachment(attachment: TaskAttachmentView | null): boolean {
    const mimeType = attachment?.mime_type || attachment?.file?.type || '';
    return (
      mimeType.includes('pdf') || this.getAttachmentExtension(attachment).toLowerCase() === 'pdf'
    );
  }

  getCommentUserLabel(comment: TaskCommentRecord): string {
    return comment.user?.name || comment.user?.username || `User #${comment.user_id ?? '-'}`;
  }

  getCommentCreatedAt(comment: TaskCommentRecord): string {
    const date = this.parseDate(comment.created_at);
    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  isOwnComment(comment: TaskCommentRecord): boolean {
    const currentUserId = Number(this.authService.getUser()?.id);
    const commentUserId = Number(comment.user_id ?? comment.user?.id);
    return (
      Number.isInteger(currentUserId) &&
      currentUserId > 0 &&
      Number.isInteger(commentUserId) &&
      currentUserId === commentUserId
    );
  }

  submitComment(): void {
    const taskId = Number(this.task?.id);
    const message = this.commentMessage.trim();

    if (!Number.isInteger(taskId) || taskId <= 0) {
      this.commentErrorMessage = 'Task is required to add comments.';
      return;
    }

    if (!message) {
      this.commentErrorMessage = 'Comment message is required.';
      return;
    }

    this.isSubmittingComment = true;
    this.commentErrorMessage = '';
    this.taskService.createTaskComment({ task_id: taskId, message }).subscribe({
      next: (comment) => {
        this.isSubmittingComment = false;
        this.commentMessage = '';
        this.isMentionMenuOpen = false;
        this.appendTaskComment(comment);
      },
      error: (error) => {
        this.isSubmittingComment = false;
        this.commentErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  onCommentMessageChange(): void {
    const mentionQuery = this.getMentionQuery();

    this.isMentionMenuOpen = mentionQuery !== null && this.getMentionUsers().length > 0;
  }

  onCommentInput(event: Event): void {
    this.commentMessage = (event.target as HTMLTextAreaElement).value;
    this.onCommentMessageChange();
  }

  getMentionUsers(): UserOption[] {
    const query = this.getMentionQuery();
    if (query === null) {
      return [];
    }

    const normalizedQuery = query.toLowerCase();
    return this.selectedUsers
      .filter((user) => this.getUserLabel(user).toLowerCase().includes(normalizedQuery))
      .slice(0, 6);
  }

  getCommentMessageParts(comment: TaskCommentRecord): CommentMessagePart[] {
    const message = comment.message || '';
    const parts: CommentMessagePart[] = [];
    const mentionPattern = /@([a-zA-Z0-9_.-]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionPattern.exec(message)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: message.slice(lastIndex, match.index) });
      }

      const username = match[1];
      const user = this.getMentionedTaskUser(username);
      parts.push({
        type: 'mention',
        value: match[0],
        username,
        user,
        key: `${comment.id ?? comment.created_at ?? match.index}-${username}`,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.length) {
      parts.push({ type: 'text', value: message.slice(lastIndex) });
    }

    return parts.length ? parts : [{ type: 'text', value: message }];
  }

  toggleMentionPopover(part: CommentMessagePart, event: MouseEvent): void {
    event.stopPropagation();

    if (!part.key || !part.user) {
      return;
    }

    if (this.activeMentionPopoverKey === part.key) {
      this.closeMentionPopover();
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const panel = target.closest('[data-task-comments-panel]') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = 86;
    const panelWidth = panelRect?.width ?? window.innerWidth;
    const rawLeft = panelRect ? rect.right - panelRect.left + 8 : rect.right + 8;
    const rawTop = panelRect
      ? rect.top - panelRect.top - popoverHeight - 8
      : rect.top - popoverHeight - 8;

    this.activeMentionPopoverKey = part.key;
    this.activeMentionPopover = {
      key: part.key,
      user: part.user,
      top: Math.max(8, rawTop),
      left: Math.min(panelWidth - popoverWidth - 8, Math.max(8, rawLeft)),
    };
    window.setTimeout(() => {
      const popover = document.querySelector('[data-active-mention-popover]');
      if (popover) {
        gsap.fromTo(
          popover,
          { autoAlpha: 0, y: 6, scale: 0.96 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' },
        );
      }
    });
  }

  closeMentionPopover(): void {
    const popover = document.querySelector('[data-active-mention-popover]');
    if (!popover) {
      this.activeMentionPopoverKey = null;
      this.activeMentionPopover = null;
      return;
    }

    gsap.to(popover, {
      autoAlpha: 0,
      y: 6,
      scale: 0.96,
      duration: 0.14,
      ease: 'power2.in',
      onComplete: () => {
        this.activeMentionPopoverKey = null;
        this.activeMentionPopover = null;
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('[data-comment-mention]') ||
      target?.closest('[data-active-mention-popover]')
    ) {
      return;
    }

    if (this.activeMentionPopover) {
      this.closeMentionPopover();
    }
  }

  getHighlightedCommentMessage(): string {
    return this.escapeHtml(this.commentMessage).replace(
      /(^|\s)(@[a-zA-Z0-9_.-]+)/g,
      '$1<span class="font-bold text-sky-500">$2</span>',
    );
  }

  insertMention(user: UserOption): void {
    const mentionQuery = this.getMentionQuery();
    if (mentionQuery === null) {
      return;
    }

    const mentionStart = this.commentMessage.lastIndexOf(`@${mentionQuery}`);
    if (mentionStart < 0) {
      return;
    }

    this.commentMessage =
      `${this.commentMessage.slice(0, mentionStart)}@${user.username} ` +
      this.commentMessage.slice(mentionStart + mentionQuery.length + 1);
    this.isMentionMenuOpen = false;
  }

  getTodoAssignableUsers(): UserOption[] {
    return this.selectedUsers.length ? this.selectedUsers : this.users;
  }

  private addPendingAttachmentFiles(fileList: FileList | null): void {
    if (!fileList?.length) {
      return;
    }

    this.attachmentErrorMessage = '';
    const validFiles: TaskAttachmentView[] = [];
    const invalidFiles: string[] = [];

    Array.from(fileList).forEach((file) => {
      if (file.size > this.maxAttachmentSize) {
        invalidFiles.push(file.name);
        return;
      }

      validFiles.push({
        clientId: Date.now() + Math.random(),
        original_name: file.name,
        mime_type: file.type,
        size: file.size,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });

    if (invalidFiles.length) {
      this.attachmentErrorMessage = `Max file size is 10MB per file: ${invalidFiles.join(', ')}`;
    }

    this.pendingAttachmentFiles = [...this.pendingAttachmentFiles, ...validFiles];
  }

  private uploadAttachmentsForTask(
    taskId: number | string,
    files: File[],
    closeDialogAfterUpload: boolean,
  ): void {
    this.isUploadingAttachments = true;
    this.attachmentErrorMessage = '';
    this.taskService
      .uploadTaskAttachments(taskId, files)
      .pipe(switchMap(() => this.taskService.getTask(taskId)))
      .subscribe({
        next: (task) => {
          this.isUploadingAttachments = false;
          this.revokeAttachmentUrls(this.pendingAttachmentFiles);
          this.pendingAttachmentFiles = [];
          this.applyTaskRefresh(task);
          this.toastService.success(task);
          if (closeDialogAfterUpload) {
            this.isAttachmentDialogOpen = false;
          }
        },
        error: (error) => {
          this.isUploadingAttachments = false;
          this.attachmentErrorMessage = this.toastService.getErrorMessage(error, '');
          this.toastService.errorFrom(error);
        },
      });
  }

  private loadTaskComments(): void {
    const taskId = Number(this.task?.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return;
    }

    this.isLoadingComments = true;
    this.commentErrorMessage = '';
    this.taskService.getTaskComments(taskId).subscribe({
      next: (comments) => {
        this.taskComments = this.sortTaskComments(comments);
        this.isLoadingComments = false;
        this.scrollCommentsToLatest();
      },
      error: (error) => {
        this.isLoadingComments = false;
        this.commentErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  private setupRealtimeSubscriptions(): void {
    this.realtimeSubscriptions.push(
      this.realtimeService.taskCommentCreated$.subscribe((payload) => {
        const comment = this.extractTaskComment(payload);
        if (!comment || !this.task?.id || String(comment.task_id) !== String(this.task.id)) {
          return;
        }

        this.appendTaskComment(comment);
      }),
      this.realtimeService.todoUpdated$.subscribe((payload) => {
        const todo = this.extractTodo(payload);
        if (!todo || !this.task || !this.isTaskTodoForTask(todo, this.task)) {
          return;
        }

        this.taskTodos = this.mergeTaskTodoDrafts(this.taskTodos, [this.mapTaskTodoToDraft(todo)]);
        this.emitTaskTodoUpdate();
      }),
      this.activeTimelogService.timelogEnded$.subscribe((timelog) => {
        if (!timelog.task_todo_id || !this.task?.id) {
          return;
        }

        this.upsertTodoTimelog(timelog);
        this.loadTimelogsForTask();
        this.loadTaskTodosForTask(this.task);
      }),
      this.realtimeService.notificationCreated$.subscribe((notification) => {
        const notificationPayload = notification as {
          task_id?: number | string | null;
          task?: { id?: number | string } | null;
          data?: { task_id?: number | string | null } | null;
        };
        const notificationTaskId =
          notificationPayload.task_id ??
          notificationPayload.task?.id ??
          notificationPayload.data?.task_id ??
          null;
        if (
          notificationTaskId &&
          this.task?.id &&
          String(notificationTaskId) === String(this.task.id)
        ) {
          this.loadTaskComments();
        }
      }),
    );
  }

  private extractTodo(payload: RealtimeTodoPayload): TaskTodoRecord | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate =
      'todo' in payload
        ? payload.todo
        : 'task_todo' in payload
          ? payload.task_todo
          : 'data' in payload
            ? payload.data
            : 'item' in payload
              ? payload.item
              : 'result' in payload
                ? payload.result
                : payload;

    return candidate && typeof candidate === 'object' ? (candidate as TaskTodoRecord) : null;
  }

  private extractTaskComment(payload: RealtimeTaskCommentPayload): TaskCommentRecord | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate =
      'comment' in payload
        ? payload.comment
        : 'task_comment' in payload
          ? payload.task_comment
          : 'data' in payload
            ? payload.data
            : 'item' in payload
              ? payload.item
              : 'result' in payload
                ? payload.result
                : payload;

    return candidate && typeof candidate === 'object' ? (candidate as TaskCommentRecord) : null;
  }

  private appendTaskComment(comment: TaskCommentRecord): void {
    if (!comment?.message) {
      return;
    }

    const existingIndex = this.taskComments.findIndex(
      (item) => item.id && comment.id && String(item.id) === String(comment.id),
    );

    if (existingIndex >= 0) {
      this.taskComments[existingIndex] = {
        ...this.taskComments[existingIndex],
        ...comment,
      };
      this.taskComments = this.sortTaskComments(this.taskComments);
      this.scrollCommentsToLatest();
      return;
    }

    this.taskComments = this.sortTaskComments([...this.taskComments, comment]);
    this.scrollCommentsToLatest();
  }

  private scrollCommentsToLatest(): void {
    const scrollToBottom = () => {
      const commentsList = document.querySelector<HTMLElement>('[data-task-comments-list]');
      if (!commentsList) {
        return;
      }

      commentsList.scrollTop = commentsList.scrollHeight;
    };

    requestAnimationFrame(scrollToBottom);
    window.setTimeout(scrollToBottom, 0);
    window.setTimeout(scrollToBottom, 80);
    window.setTimeout(scrollToBottom, 180);
  }

  private sortTaskComments(comments: TaskCommentRecord[]): TaskCommentRecord[] {
    return [...comments].sort((first, second) => {
      const firstTime = this.parseDate(first.created_at)?.getTime() ?? 0;
      const secondTime = this.parseDate(second.created_at)?.getTime() ?? 0;

      if (firstTime !== secondTime) {
        return firstTime - secondTime;
      }

      return Number(first.id ?? 0) - Number(second.id ?? 0);
    });
  }

  private getMentionQuery(): string | null {
    const match = this.commentMessage.match(/(^|\s)@([a-zA-Z0-9_.-]*)$/);
    return match ? match[2] : null;
  }

  private getMentionedTaskUser(username: string): UserOption | undefined {
    const normalizedUsername = username.toLowerCase();
    return this.selectedUsers.find(
      (user) =>
        String(user.username || '').toLowerCase() === normalizedUsername ||
        String(user.name || '').toLowerCase() === normalizedUsername ||
        String(user.username || '')
          .toLowerCase()
          .startsWith(normalizedUsername) ||
        String(user.name || '')
          .toLowerCase()
          .startsWith(normalizedUsername),
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private prepareFormForOpen(): void {
    this.resetForm();
    this.populateFormFromTask();
    this.errorMessage = '';

    if (!this.projects.length && !this.isLoadingProjects) {
      this.loadProjects();
    }

    if (!this.taskLabels.length && !this.isLoadingTaskLabels) {
      this.loadTaskLabels();
    }
  }

  private populateFormFromTask(): void {
    if (!this.task) {
      this.form.status = this.defaultStatus;
      this.form.board_column = this.defaultStatus;
      this.form.order_index = this.orderIndex;
      return;
    }

    const status = this.task.status || this.task.board_column || this.defaultStatus;
    this.form = {
      title: this.task.title || this.task.task_title || this.task.name || '',
      description: this.task.description || '',
      status,
      board_column: this.task.board_column || status,
      order_index: Number(this.task.order_index ?? this.orderIndex),
    };
    this.selectedDueDate = this.formatDateInput(this.task.due_date);
    this.selectedProject = this.createSelectedProject(this.task.project_id);
    this.selectedUsers = this.createSelectedUsers(this.task);
    this.selectedLabels = this.getSelectedTaskLabels(this.task);
    this.taskTodos = this.getTaskTodos(this.task).map((todo) => this.mapTaskTodoToDraft(todo));
    this.attachments = this.mapTaskAttachments(this.task.attachments);
    this.loadTaskTodosForTask(this.task);
  }

  private createPayload(): CreateTaskRequest | null {
    const title = this.form.title.trim();

    if (!title) {
      this.errorMessage = 'Title is required.';
      return null;
    }

    if (!this.selectedProject) {
      this.errorMessage = 'Project is required.';
      return null;
    }

    if (!this.selectedUsers.length) {
      this.errorMessage = 'Member is required.';
      return null;
    }

    const assigneeUserIds = this.selectedUsers.map((user) => Number(user.id));
    const taskStatus = this.task?.id ? this.form.status : this.defaultStatus;
    const boardColumn = this.task?.id ? this.form.board_column : this.defaultStatus;
    const payload: CreateTaskRequest = {
      project_id: Number(this.selectedProject.id),
      user_id: assigneeUserIds[0],
      title,
      status: taskStatus,
      board_column: boardColumn,
      order_index: this.form.order_index,
      assignee_user_ids: assigneeUserIds,
      label_ids: this.selectedLabels.map((label) => Number(label.id)),
    };

    const description = this.form.description.trim();
    if (description) {
      payload.description = description;
    }

    if (this.selectedDueDate) {
      payload.due_date = new Date(`${this.selectedDueDate}T00:00:00.000Z`).toISOString();
    }

    return payload;
  }

  private updateTask(payload: CreateTaskRequest): void {
    const taskId = this.task?.id;

    if (!taskId) {
      return;
    }

    this.isSaving = true;
    this.taskService
      .updateTask(taskId, payload)
      .pipe(
        switchMap((updatedTask) =>
          this.deleteRemovedAttachments({
            ...this.task,
            ...updatedTask,
            id: taskId,
          }),
        ),
      )
      .pipe(switchMap((updatedTask) => this.uploadPendingAttachmentsAfterCreate(updatedTask)))
      .subscribe({
        next: (updatedTask) => {
          this.isSaving = false;
          const mergedTask = {
            ...this.task,
            ...updatedTask,
            id: taskId,
            assignee_user_ids: this.selectedUsers.map((user) => Number(user.id)),
            user: this.selectedUsers,
            label_ids: this.selectedLabels.map((label) => Number(label.id)),
            labels: this.selectedLabels,
          };
          this.taskUpdated.emit(mergedTask);
          this.onVisibleChange(false);
          this.toastService.success(updatedTask);
        },
        error: (error) => {
          this.isSaving = false;
          this.errorMessage = this.toastService.getErrorMessage(error, '');
          this.toastService.errorFrom(error);
        },
      });
  }

  private loadProjects(): void {
    this.isLoadingProjects = true;
    this.taskService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects
          .map((project) => ({
            ...project,
            id: Number(project.id),
            name: project.name || project.label || `Project #${project.id}`,
          }))
          .filter((project) => Number.isInteger(project.id) && project.id > 0);
        if (this.task?.project_id) {
          this.selectedProject = this.createSelectedProject(this.task.project_id);
        }
        this.isLoadingProjects = false;
      },
      error: () => {
        this.projects = [];
        this.isLoadingProjects = false;
      },
    });
  }

  private loadUsers(): void {
    this.isLoadingUsers = true;
    this.taskService.getUsers().subscribe({
      next: (users) => {
        this.users = users
          .map((user) => ({
            ...user,
            id: Number(user.id),
            username: user.username || user.name || user.email || `User #${user.id}`,
          }))
          .filter((user) => Number.isInteger(user.id) && user.id > 0);
        if (this.task) {
          this.selectedUsers = this.createSelectedUsers(this.task);
        }
        this.isLoadingUsers = false;
      },
      error: () => {
        this.users = [];
        this.isLoadingUsers = false;
      },
    });
  }

  private loadTaskLabels(): void {
    this.isLoadingTaskLabels = true;
    this.taskService.getTaskLabels().subscribe({
      next: (labels) => {
        this.taskLabels = labels
          .map((label) => ({ ...label, id: Number(label.id) }))
          .filter((label) => Number.isInteger(label.id) && label.id > 0 && Boolean(label.name));
        this.isLoadingTaskLabels = false;
      },
      error: () => {
        this.taskLabels = [];
        this.isLoadingTaskLabels = false;
      },
    });
  }

  private loadTaskTodosForTask(task: TaskRecord): void {
    const taskId = Number(task.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return;
    }

    this.isLoadingTaskTodos = true;
    this.taskService.getTaskTodos().subscribe({
      next: (taskTodos) => {
        const matchingTodos = taskTodos
          .filter((todo) => this.isTaskTodoForTask(todo, task))
          .map((todo) => this.mapTaskTodoToDraft(todo));

        this.taskTodos = this.mergeTaskTodoDrafts(this.taskTodos, matchingTodos);
        this.isLoadingTaskTodos = false;
        this.loadTimelogsForTask();
      },
      error: () => {
        this.isLoadingTaskTodos = false;
      },
    });
  }

  private loadTimelogsForTask(): void {
    const taskId = Number(this.task?.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      this.todoTimelogs = [];
      return;
    }

    const todoIds = new Set(
      this.taskTodos
        .map((todo) => Number(todo.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );

    this.timelogService.getTimelogs().subscribe({
      next: (timelogs) => {
        this.todoTimelogs = timelogs.filter((timelog) => {
          const timelogTodoId = Number(timelog.task_todo_id);
          const timelogTaskId = Number(timelog.task_todo?.task_id);

          return (
            (Number.isInteger(timelogTodoId) && todoIds.has(timelogTodoId)) ||
            (Number.isInteger(timelogTaskId) && timelogTaskId === taskId)
          );
        });
      },
      error: () => {
        this.todoTimelogs = [];
      },
    });
  }

  private resetForm(): void {
    this.revokeAttachmentUrls(this.attachments);
    this.revokeAttachmentUrls(this.pendingAttachmentFiles);
    this.form = this.createInitialForm();
    this.todoForm = this.createInitialTodoForm();
    this.taskTodos = [];
    this.todoTimelogs = [];
    this.attachments = [];
    this.pendingAttachmentFiles = [];
    this.selectedAttachment = null;
    this.selectedAttachmentSafeUrl = null;
    this.deletedAttachmentIds = [];
    this.taskComments = [];
    this.commentMessage = '';
    this.selectedProject = undefined;
    this.selectedUsers = [];
    this.selectedDueDate = dayjs().format('YYYY-MM-DD');
    this.selectedLabels = [];
    this.isLabelComboboxOpen = false;
    this.isProjectComboboxOpen = false;
    this.errorMessage = '';
    this.todoErrorMessage = '';
    this.attachmentErrorMessage = '';
    this.commentErrorMessage = '';
    this.isTodoDialogOpen = false;
    this.isTodoUserDialogOpen = false;
    this.editingTodoClientId = null;
    this.isDeleteDialogOpen = false;
    this.isAttachmentDialogOpen = false;
    this.isAttachmentViewerOpen = false;
    this.isMentionMenuOpen = false;
    this.activeTab = 'todo';
  }

  private createInitialForm(): TaskDialogForm {
    return {
      title: 'Title',
      description: '',
      status: this.defaultStatus,
      board_column: this.defaultStatus,
      order_index: this.orderIndex,
    };
  }

  private createInitialTodoForm(): TaskTodoDialogForm {
    return {
      label: '',
      user: undefined,
      users: [],
      estimate_time: null,
    };
  }

  private animateTodoDialogIn(): void {
    window.setTimeout(() => {
      const popper = document.querySelector('[data-task-todo-popper]');
      if (popper) {
        gsap.fromTo(
          popper,
          { autoAlpha: 0, y: 8, scale: 0.98 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.2, ease: 'power2.out' },
        );
      }
    });
  }

  private animateTodoDialogOut(onComplete: () => void): void {
    const popper = document.querySelector('[data-task-todo-popper]');
    if (!popper) {
      onComplete();
      return;
    }

    gsap.to(popper, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      duration: 0.16,
      ease: 'power2.in',
      onComplete,
    });
  }

  private createTaskTodos(task: TaskRecord) {
    const taskId = Number(task.id);

    if (!this.taskTodos.length || !Number.isInteger(taskId) || taskId <= 0) {
      return of(task);
    }

    const unsavedTodos = this.taskTodos.filter((todo) => !todo.id);
    if (!unsavedTodos.length) {
      return of(task);
    }

    const requests = unsavedTodos.map((todo) => {
      const currentUserId = this.getCurrentUserId();
      const payload: CreateTaskTodoRequest = {
        task_id: taskId,
        label: todo.label,
        progress: todo.progress,
        status: todo.status,
      };

      if (currentUserId) {
        payload.created_by = currentUserId;
      }

      if (this.isManager && todo.user_ids?.length) {
        payload.user_ids = todo.user_ids.map((id) => Number(id));
        payload.user_id = Number(todo.user_ids[0]);
      } else if (this.isManager && todo.user?.id) {
        payload.user_id = Number(todo.user.id);
      }

      if (this.isManager && todo.estimate_time !== undefined) {
        payload.estimate_time = todo.estimate_time;
      }

      return this.taskService.createTaskTodo(payload);
    });

    return forkJoin(requests).pipe(
      map((createdTodos) => ({
        ...task,
        task_todos: [...this.taskTodos.filter((todo) => todo.id), ...createdTodos],
      })),
    );
  }

  private uploadPendingAttachmentsAfterCreate(task: TaskRecord) {
    const taskId = Number(task.id);
    const files = this.attachments
      .map((attachment) => attachment.file)
      .filter((file): file is File => Boolean(file));

    if (!files.length || !Number.isInteger(taskId) || taskId <= 0) {
      return of(task);
    }

    return this.taskService
      .uploadTaskAttachments(taskId, files)
      .pipe(switchMap(() => this.taskService.getTask(taskId)));
  }

  private deleteRemovedAttachments(task: TaskRecord) {
    const taskId = Number(task.id);
    const attachmentIds = this.deletedAttachmentIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!attachmentIds.length || !Number.isInteger(taskId) || taskId <= 0) {
      return of(task);
    }

    return forkJoin(
      attachmentIds.map((attachmentId) => this.taskService.deleteTaskAttachment(attachmentId)),
    ).pipe(
      switchMap(() => this.taskService.getTask(taskId)),
      map((refreshedTask) => {
        this.deletedAttachmentIds = [];
        return refreshedTask;
      }),
    );
  }

  private applyTaskRefresh(task: TaskRecord): void {
    const refreshedTask = {
      ...this.task,
      ...task,
      id: task.id ?? this.task?.id,
      labels: this.getSelectedTaskLabels(task),
    };

    this.task = refreshedTask;
    this.attachments = this.mapTaskAttachments(task.attachments);
    this.deletedAttachmentIds = [];
    this.taskUpdated.emit(refreshedTask);
  }

  private mapTaskAttachments(
    attachments: TaskAttachmentRecord[] | undefined,
  ): TaskAttachmentView[] {
    return (attachments || []).map((attachment) => ({
      ...attachment,
      clientId: Number(attachment.id ?? Date.now() + Math.random()),
    }));
  }

  private revokeAttachmentUrls(attachments: TaskAttachmentView[]): void {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
  }

  private getAttachmentExtension(attachment: TaskAttachmentView | null): string {
    const name = attachment ? this.getAttachmentName(attachment) : '';
    const extension = name.includes('.') ? name.split('.').pop() || '' : '';
    return extension.toUpperCase().slice(0, 4);
  }

  private startTodoClockTimer(): void {
    this.todoClockTimerId = setInterval(() => {
      this.todoClockTick = Date.now();
    }, 1000);
  }

  private upsertTodoTimelog(timelog: TimelogRecord): void {
    if (!timelog?.id) {
      return;
    }

    this.todoTimelogs = [
      timelog,
      ...this.todoTimelogs.filter((item) => String(item.id) !== String(timelog.id)),
    ];
  }

  private emitTaskTodoUpdate(): void {
    if (!this.task) {
      return;
    }

    this.taskUpdated.emit({
      ...this.task,
      task_todos: this.taskTodos.map((todo) => ({
        id: todo.id,
        task_id: Number(this.task?.id),
        user_id: todo.user?.id ? Number(todo.user.id) : todo.user_id,
        user_ids: todo.user_ids,
        label: todo.label,
        progress: todo.progress,
        status: todo.status,
        user: todo.user,
        users: todo.users,
        created_by: todo.created_by,
        updated_by: todo.updated_by,
        estimate_time: todo.estimate_time,
        estimate_time_hours: todo.estimate_time_hours,
        estimate_time_minutes: todo.estimate_time_minutes,
        estimate_time_label: todo.estimate_time_label,
        created_at: todo.created_at,
        updated_at: todo.updated_at,
      })),
    });
  }

  private mapTaskTodoToDraft(todo: TaskTodoRecord): TaskTodoDraft {
    return {
      id: todo.id,
      task_id: todo.task_id,
      clientId: Number(todo.id ?? Date.now() + Math.random()),
      label: todo.label || '',
      progress: Number(todo.progress || 0),
      status: todo.status || 'pending',
      user: todo.user,
      users: todo.users || (todo.user ? [todo.user] : []),
      user_id: todo.user_id,
      user_ids: this.parseIdList(todo.user_ids),
      created_by: todo.created_by,
      updated_by: todo.updated_by,
      estimate_time: todo.estimate_time,
      estimate_time_hours: todo.estimate_time_hours,
      estimate_time_minutes: todo.estimate_time_minutes,
      estimate_time_label: todo.estimate_time_label,
      created_at: todo.created_at,
      updated_at: todo.updated_at,
    };
  }

  private mergeTaskTodoDrafts(
    currentTodos: TaskTodoDraft[],
    nextTodos: TaskTodoDraft[],
  ): TaskTodoDraft[] {
    const mergedTodos = [...currentTodos];

    nextTodos.forEach((nextTodo) => {
      const existingIndex = mergedTodos.findIndex(
        (currentTodo) =>
          currentTodo.id && nextTodo.id && Number(currentTodo.id) === Number(nextTodo.id),
      );

      if (existingIndex >= 0) {
        mergedTodos[existingIndex] = {
          ...mergedTodos[existingIndex],
          ...nextTodo,
        };
        return;
      }

      mergedTodos.push(nextTodo);
    });

    return mergedTodos;
  }

  private isTaskTodoForTask(todo: TaskTodoRecord, task: TaskRecord): boolean {
    const taskId = Number(task.id);
    const todoTaskId = Number(todo.task_id);
    const mainTaskTodoId = Number(task.task_todo_id);
    const todoId = Number(todo.id);

    return (
      (Number.isInteger(taskId) &&
        taskId > 0 &&
        Number.isInteger(todoTaskId) &&
        todoTaskId === taskId) ||
      (Number.isInteger(mainTaskTodoId) &&
        mainTaskTodoId > 0 &&
        Number.isInteger(todoId) &&
        todoId === mainTaskTodoId)
    );
  }

  private parseDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatTime(value?: string): string {
    const date = this.parseDate(value);
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private formatMinutes(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  private formatElapsed(start?: string): string {
    this.todoClockTick;
    const startDate = this.parseDate(start);

    if (!startDate) {
      return '00:00:00';
    }

    const totalSeconds = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((item) => String(item).padStart(2, '0')).join(':');
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private formatDateInput(dateValue: string | undefined): string {
    if (!dateValue) {
      return dayjs().format('YYYY-MM-DD');
    }

    const date = dayjs(dateValue);
    return date.isValid() ? date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
  }

  private createSelectedProject(projectId: number | string | undefined): ProjectOption | undefined {
    const id = Number(projectId);
    if (!Number.isInteger(id) || id <= 0) {
      return undefined;
    }

    return (
      this.projects.find((project) => Number(project.id) === id) || { id, name: `Project #${id}` }
    );
  }

  private createSelectedUsers(task: TaskRecord): UserOption[] {
    const taskUsers = getTaskUsers(task);
    const taskUserById = new Map(
      taskUsers
        .map((user) => [Number(user.id), user] as const)
        .filter(([id]) => Number.isInteger(id) && id > 0),
    );
    const selectedIds = Array.from(
      new Set([
        ...getTaskUserIds(task),
        ...taskUsers
          .map((user) => Number(user.id))
          .filter((id) => Number.isInteger(id) && id > 0),
        ...this.parseIdList(task.user_id ? [task.user_id] : []),
      ]),
    );

    return selectedIds
      .map((id) => this.createSelectedUser(id, taskUserById.get(id)))
      .filter((user): user is UserOption => Boolean(user));
  }

  private createSelectedUser(
    userId: number | string | undefined,
    fallbackUser?: UserOption,
  ): UserOption | undefined {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      return undefined;
    }

    return (
      this.users.find((user) => Number(user.id) === id) ||
      fallbackUser || {
        id,
        username: `User #${id}`,
        email: '',
      }
    );
  }

  private getSelectedTaskLabels(task: TaskRecord): TaskLabelOption[] {
    const embeddedLabels = task.task_labels || task.taskLabels || task.labels;
    if (embeddedLabels?.length) {
      return embeddedLabels;
    }

    const labelIds = this.parseIdList(task.label_ids);
    const selectedIds = new Set(labelIds);
    return this.taskLabels.filter((label) => selectedIds.has(Number(label.id)));
  }

  private parseIdList(value: Array<number | string> | string | undefined): number[] {
    return parseTaskIdList(value);
  }

  private getTaskTodos(task: TaskRecord): TaskTodoRecord[] {
    return task.task_todos || task.taskTodos || task.todos || [];
  }

  private isAllowedTaskTodoUser(userId: number | string | undefined): boolean {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      return false;
    }

    return this.getTaskMemberUserIds().has(id);
  }

  private isCurrentUserTodoAssignee(todo: TaskTodoDraft): boolean {
    const currentUserId = this.getCurrentUserId();
    const todoUserIds = new Set<number>();

    this.getTodoAssignees(todo).forEach((user) => {
      const id = Number(user.id);
      if (Number.isInteger(id) && id > 0) {
        todoUserIds.add(id);
      }
    });

    this.parseIdList(todo.user_ids).forEach((id) => todoUserIds.add(id));

    const legacyTodoUserId = Number(todo.user?.id ?? todo.user_id);
    if (Number.isInteger(legacyTodoUserId) && legacyTodoUserId > 0) {
      todoUserIds.add(legacyTodoUserId);
    }

    return Boolean(currentUserId && todoUserIds.has(currentUserId));
  }

  private getCurrentUserId(): number | null {
    const currentUserId = Number(this.authService.getUser()?.id);
    return Number.isInteger(currentUserId) && currentUserId > 0 ? currentUserId : null;
  }

  private createCurrentTodoUser(currentUserId: number): UserOption {
    const currentUser = this.authService.getUser();

    return {
      id: currentUserId,
      username:
        currentUser?.username ||
        currentUser?.name ||
        currentUser?.email ||
        `User #${currentUserId}`,
      email: currentUser?.email || '',
      name: currentUser?.name,
      photo: currentUser?.photo,
      photo_url: currentUser?.photo_url,
      avatar: currentUser?.avatar,
      image: currentUser?.image,
    };
  }

  private getTaskMemberUserIds(): Set<number> {
    const userIds = new Set<number>();

    this.selectedUsers.forEach((user) => {
      const userId = Number(user.id);
      if (Number.isInteger(userId) && userId > 0) {
        userIds.add(userId);
      }
    });

    if (this.task) {
      const ownerId = Number(this.task.user_id);
      if (Number.isInteger(ownerId) && ownerId > 0) {
        userIds.add(ownerId);
      }

      getTaskUserIds(this.task).forEach((id) => userIds.add(id));
      getTaskUsers(this.task).forEach((user) => {
        const userId = Number(user?.id);
        if (Number.isInteger(userId) && userId > 0) {
          userIds.add(userId);
        }
      });
    }

    return userIds;
  }
}

interface TaskDialogForm {
  title: string;
  description: string;
  status: TaskStatus;
  board_column: TaskStatus;
  order_index: number;
}

interface TaskTodoDialogForm {
  label: string;
  user?: UserOption;
  users: UserOption[];
  estimate_time: number | null;
}

type TaskDialogTab = 'todo' | 'comments';

interface TaskTodoDraft {
  id?: number | string;
  task_id?: number;
  clientId: number;
  label: string;
  progress: number;
  status: TaskTodoStatus;
  user?: UserOption;
  user_id?: number;
  users?: UserOption[];
  user_ids?: number[];
  created_by?: number | string;
  updated_by?: number | string;
  estimate_time?: number;
  estimate_time_hours?: number;
  estimate_time_minutes?: number;
  estimate_time_label?: string;
  created_at?: string;
  updated_at?: string;
}

interface TaskAttachmentView extends TaskAttachmentRecord {
  clientId: number;
  file?: File;
  previewUrl?: string;
}

interface CommentMessagePart {
  type: 'text' | 'mention';
  value: string;
  username?: string;
  user?: UserOption;
  key?: string;
}

interface MentionPopoverState {
  key: string;
  user: UserOption;
  top: number;
  left: number;
}
