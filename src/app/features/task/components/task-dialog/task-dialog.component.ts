import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AuthService } from '../../../../core/auth/auth.service';
import {
  CreateTaskRequest,
  CreateTaskTodoRequest,
  ProjectOption,
  TaskLabelOption,
  TaskRecord,
  TaskStatus,
  TaskTodoRecord,
  UserOption,
  getTaskUserIds,
  getTaskUsers,
  parseTaskIdList,
} from '../../schema/task.schema';
import { TaskService } from '../../service/task.service';
import { ActiveTimelogService } from '../../../timelog/service/active-timelog.service';
import dayjs from 'dayjs';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FcIconComponent } from '@app/shared/components/fc-icon/fc-icon.component';
import { GsapModalDirective } from '../../../../shared/directives/gsap-modal.directive';
import { getApiMediaUrl } from '@app/shared/utils/media';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FcIconComponent,
    GsapModalDirective,
  ],
  templateUrl: './task-dialog.component.html',
})
export class TaskDialogComponent implements OnInit, OnChanges {
  private readonly taskService = inject(TaskService);
  readonly activeTimelogService = inject(ActiveTimelogService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  @Input() visible = false;
  @Input() defaultStatus: TaskStatus = 'draft';
  @Input() orderIndex = 0;
  @Input() task: TaskRecord | null = null;
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
  isLabelComboboxOpen = false;
  isSaving = false;
  isAddingTodo = false;
  isDeleting = false;
  isLoadingTaskTodos = false;
  isLoadingProjects = false;
  isLoadingUsers = false;
  isLoadingTaskLabels = false;
  creatingTimelogTodoId: number | string | null = null;
  errorMessage = '';
  todoErrorMessage = '';

  form: TaskDialogForm = this.createInitialForm();
  todoForm: TaskTodoDialogForm = this.createInitialTodoForm();
  taskTodos: TaskTodoDraft[] = [];

  ngOnInit(): void {
    this.loadProjects();
    this.loadTaskLabels();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.prepareFormForOpen();
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

    this.todoForm = this.createInitialTodoForm();
    this.todoErrorMessage = '';
    this.isTodoDialogOpen = true;

    if (!this.users.length && !this.isLoadingUsers) {
      this.loadUsers();
    }
  }

  closeTodoDialog(): void {
    this.isTodoDialogOpen = false;
    this.isTodoUserDialogOpen = false;
    this.todoErrorMessage = '';
  }

  openTodoUserDialog(): void {
    this.isTodoUserDialogOpen = true;

    if (!this.users.length) {
      this.loadUsers();
    }
  }

  selectTodoUser(user: UserOption): void {
    this.todoForm.user = user;
    this.isTodoUserDialogOpen = false;
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

    if (!this.todoForm.user?.id) {
      this.todoErrorMessage = 'Todo assignee is required.';
      return;
    }

    if (!this.isAllowedTaskTodoUser(this.todoForm.user.id)) {
      this.todoErrorMessage = 'Todo assignee must be one of this task members.';
      return;
    }

    const draft: TaskTodoDraft = {
      clientId: Date.now() + Math.random(),
      label,
      progress: 0,
      status: 'pending',
      user: this.todoForm.user,
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
      user_id: Number(this.todoForm.user.id),
      label,
      progress: draft.progress,
      status: draft.status,
    };

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

  removeTaskTodo(todo: TaskTodoDraft): void {
    if (this.isReadonly) {
      return;
    }

    this.taskTodos = this.taskTodos.filter((item) => item.clientId !== todo.clientId);
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
    return todo.user ? this.getUserLabel(todo.user) : 'Unassigned';
  }

  getTodoStatusLabel(todo: TaskTodoDraft): string {
    const statusLabels: Record<TaskTodoDraft['status'], string> = {
      pending: 'Pending',
      progress: 'Progress',
      completed: 'Completed',
    };

    return statusLabels[todo.status] || todo.status;
  }

  getTodoCreatedTime(todo: TaskTodoDraft): string {
    return this.formatTime(todo.created_at);
  }

  getTodoUpdatedTime(todo: TaskTodoDraft): string {
    return this.formatTime(todo.updated_at);
  }

  getTodoDuration(todo: TaskTodoDraft): string {
    const createdDate = this.parseDate(todo.created_at);
    const updatedDate = this.parseDate(todo.updated_at);

    if (!createdDate || !updatedDate) {
      return '-';
    }

    return this.formatMinutes(
      Math.max(0, Math.round((updatedDate.getTime() - createdDate.getTime()) / 60000)),
    );
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

    const userId = Number(todo.user?.id ?? todo.user_id);
    if (!Number.isInteger(userId) || userId <= 0) {
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
    const photo = user?.photo_url || user?.photo || user?.avatar || user?.image;
    return getApiMediaUrl(photo) || '';
  }

  getTodoAssignableUsers(): UserOption[] {
    return this.selectedUsers.length ? this.selectedUsers : this.users;
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
    this.taskService.updateTask(taskId, payload).subscribe({
      next: (updatedTask) => {
        this.isSaving = false;
        const mergedTask = {
          ...this.task,
          ...updatedTask,
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
      },
      error: () => {
        this.isLoadingTaskTodos = false;
      },
    });
  }

  private resetForm(): void {
    this.form = this.createInitialForm();
    this.todoForm = this.createInitialTodoForm();
    this.taskTodos = [];
    this.selectedProject = undefined;
    this.selectedUsers = [];
    this.selectedDueDate = dayjs().format('YYYY-MM-DD');
    this.selectedLabels = [];
    this.isLabelComboboxOpen = false;
    this.errorMessage = '';
    this.todoErrorMessage = '';
    this.isTodoDialogOpen = false;
    this.isTodoUserDialogOpen = false;
    this.isDeleteDialogOpen = false;
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
    };
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
      const payload: CreateTaskTodoRequest = {
        task_id: taskId,
        label: todo.label,
        progress: todo.progress,
        status: todo.status,
      };

      if (todo.user?.id) {
        payload.user_id = Number(todo.user.id);
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

  private emitTaskTodoUpdate(): void {
    if (!this.task) {
      return;
    }

    this.taskUpdated.emit({
      ...this.task,
      task_todos: this.taskTodos.map((todo) => ({
        id: todo.id,
        task_id: Number(this.task?.id),
        user_id: todo.user?.id ? Number(todo.user.id) : undefined,
        label: todo.label,
        progress: todo.progress,
        status: todo.status,
        user: todo.user,
        created_at: todo.created_at,
        updated_at: todo.updated_at,
      })),
    });
  }

  private mapTaskTodoToDraft(todo: TaskTodoRecord): TaskTodoDraft {
    return {
      id: todo.id,
      clientId: Number(todo.id ?? Date.now() + Math.random()),
      label: todo.label || '',
      progress: Number(todo.progress || 0),
      status: todo.status || 'pending',
      user: todo.user,
      user_id: todo.user_id,
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
    if (taskUsers.length) {
      return taskUsers;
    }

    const assigneeIds = getTaskUserIds(task);
    const selectedIds = assigneeIds.length
      ? assigneeIds
      : this.parseIdList(task.user_id ? [task.user_id] : []);

    return selectedIds
      .map((id) => this.createSelectedUser(id))
      .filter((user): user is UserOption => Boolean(user));
  }

  private createSelectedUser(userId: number | string | undefined): UserOption | undefined {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      return undefined;
    }

    return (
      this.users.find((user) => Number(user.id) === id) || {
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
    const currentUserId = Number(this.authService.getUser()?.id);
    const todoUserId = Number(todo.user?.id ?? todo.user_id);

    return (
      Number.isInteger(currentUserId) &&
      currentUserId > 0 &&
      Number.isInteger(todoUserId) &&
      todoUserId > 0 &&
      currentUserId === todoUserId
    );
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
}

interface TaskTodoDraft {
  id?: number | string;
  clientId: number;
  label: string;
  progress: number;
  status: 'pending' | 'progress' | 'completed';
  user?: UserOption;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
}
