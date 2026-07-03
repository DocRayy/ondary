import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
  DropdownSelectValue,
} from '../../../shared/components/dropdown-select/dropdown-select.component';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { getFirstMediaUrl } from '../../../shared/utils/media';
import {
  ProjectOption,
  TaskRecord,
  TaskTodoRecord,
  UserOption,
} from '../../task/schema/task.schema';
import { TaskService } from '../../task/service/task.service';
import { TimelogRecord } from '../../timelog/schema/timelog.schema';
import { TimelogService } from '../../timelog/service/timelog.service';

interface ReportRow {
  assignee: string;
  todo: string;
  status: string;
  created: number;
  completed: number;
  project: string;
  timeSpendMinutes: number;
  createdAt: string;
  groupWeek: number | string;
  groupDay: string;
}

@Component({
  selector: 'app-my-reports',
  standalone: true,
  imports: [CommonModule, FcIconComponent, DropdownSelectComponent],
  templateUrl: './my-reports.component.html',
})
export class MyReportsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly taskService = inject(TaskService);
  private readonly timelogService = inject(TimelogService);
  private readonly toastService = inject(ToastService);
  private readonly currentYear = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  readonly selectedMonth = signal<number | null>(this.currentMonth);
  readonly selectedYear = signal<number | null>(this.currentYear);
  readonly selectedType = signal('');
  readonly selectedProjectId = signal<number | null>(null);
  readonly monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(this.currentYear, index, 1),
    ),
  }));
  readonly yearOptions = signal<number[]>([this.currentYear]);
  readonly isManager = this.permission.isManager() || this.permission.isAdmin();
  readonly users = signal<UserOption[]>([]);
  readonly isLoadingUsers = signal(false);
  readonly tasks = signal<TaskRecord[]>([]);
  readonly taskTodos = signal<TaskTodoRecord[]>([]);
  readonly timelogs = signal<TimelogRecord[]>([]);
  readonly projects = signal<ProjectOption[]>([]);
  readonly reportRows = signal<ReportRow[]>([]);
  readonly isLoading = signal(false);
  readonly isGeneratingPdf = signal(false);
  readonly errorMessage = signal('');
  readonly selectedUserId = signal<number | null>(this.isManager ? null : this.currentUserId());

  readonly totalMinutes = computed(() =>
    this.reportRows().reduce((sum, row) => sum + row.timeSpendMinutes, 0),
  );
  readonly totalTodos = computed(() => this.reportRows().length);
  readonly totalProjects = computed(() => {
    const ids = new Set(
      this.reportRows()
        .map((row) => row.project)
        .filter((project) => project && project !== '-')
        .map((project) => String(project)),
    );
    return ids.size;
  });
  readonly totalCompleted = computed(() =>
    this.reportRows().reduce(
      (sum, row) => sum + (row.completed || this.isCompletedStatus(row.status) ? 1 : 0),
      0,
    ),
  );

  ngOnInit(): void {
    if (this.isManager) {
      this.loadUsers();
    }

    this.loadReportData();
    this.loadAvailableYears();
  }

  previousMonth(): void {
    const month = this.selectedMonth();
    if (!month) {
      return;
    }

    if (month === 1) {
      this.selectedMonth.set(12);
      if (this.selectedYear() !== null) {
        this.selectedYear.update((year) => (year ?? this.currentYear) - 1);
      }
    } else {
      this.selectedMonth.set(month - 1);
    }

    this.loadReportData();
  }

  nextMonth(): void {
    const month = this.selectedMonth();
    if (!month) {
      return;
    }

    if (month === 12) {
      this.selectedMonth.set(1);
      if (this.selectedYear() !== null) {
        this.selectedYear.update((year) => (year ?? this.currentYear) + 1);
      }
    } else {
      this.selectedMonth.set(month + 1);
    }

    this.loadReportData();
  }

  selectMonth(value: DropdownSelectValue): void {
    this.selectedMonth.set(this.normalizeNullableNumber(value));
    this.loadReportData();
  }

  selectYear(value: DropdownSelectValue): void {
    this.selectedYear.set(this.normalizeNullableNumber(value));
    this.loadReportData();
  }

  selectUser(value: DropdownSelectValue): void {
    this.selectedUserId.set(this.normalizeNullableNumber(value));
    this.loadAvailableYears();
    this.loadReportData();
  }

  selectProject(value: DropdownSelectValue): void {
    this.selectedProjectId.set(this.normalizeNullableNumber(value));
    this.loadAvailableYears();
    this.loadReportData();
  }

  selectType(value: DropdownSelectValue): void {
    this.selectedType.set(String(value ?? ''));
    this.reportRows.set(this.buildRows());
  }

  generatePdf(): void {
    const token = this.authService.getToken();
    if (!token) {
      this.handlePdfUnauthorized();
      return;
    }

    const filters = this.getSelectedReportFilters();
    const userId = this.getPdfUserId();
    this.errorMessage.set('');
    this.isGeneratingPdf.set(true);

    this.taskService
      .getTaskReportPdf({
        month: filters.month,
        year: filters.year,
        project_id: filters.projectId,
        type: this.selectedType() || undefined,
        user_id: userId ?? undefined,
      })
      .subscribe({
        next: (blob) => {
          this.isGeneratingPdf.set(false);
          const pdfUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pdfUrl;
          link.download = this.getPdfFileName();
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
        },
        error: (error) => {
          this.isGeneratingPdf.set(false);

          if (this.isUnauthorizedError(error)) {
            this.handlePdfUnauthorized();
            return;
          }

          this.errorMessage.set('Failed to generate PDF.');
          this.toastService.error({ title: 'Error', message: 'Failed to generate PDF.' });
        },
      });
  }

  trackRowById(index: number, row: ReportRow): string {
    return `${this.getGroupKey(row)}-${row.assignee}-${row.todo}-${index}`;
  }

  shouldShowGroupSeparator(index: number, row: ReportRow): boolean {
    const previousRow = this.reportRows()[index - 1];
    return !previousRow || this.getWeekGroupKey(previousRow) !== this.getWeekGroupKey(row);
  }

  shouldShowMonthSeparator(index: number, row: ReportRow): boolean {
    if (this.selectedMonth() !== null) {
      return false;
    }

    const previousRow = this.reportRows()[index - 1];
    return !previousRow || this.getMonthGroupKey(previousRow) !== this.getMonthGroupKey(row);
  }

  getGroupLabel(row: ReportRow): string {
    return this.getWeekGroupLabel(row);
  }

  getMonthGroupLabel(row: ReportRow): string {
    const date = this.parseDate(row.createdAt);
    if (!date) {
      return 'Unknown date';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  getWeekGroupLabel(row: ReportRow): string {
    const date = this.parseDate(row.createdAt);
    if (!date) {
      return 'Unknown date';
    }

    const groupWeek =
      row.groupWeek === undefined || row.groupWeek === null || row.groupWeek === ''
        ? 1
        : row.groupWeek;
    const dayLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: '2-digit',
    }).format(date);
    return `Week ${groupWeek} - ${dayLabel}`;
  }

  formatMinutes(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return '0h 0m';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  formatCreatedAt(value: string): string {
    const date = this.parseDate(value);
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  getSelectedUserLabel(): string {
    const selectedUserId = this.selectedUserId();
    if (selectedUserId === null) {
      return 'All Users';
    }

    const user = this.users().find((item) => Number(item.id) === selectedUserId);
    return this.getUserName(user, selectedUserId);
  }

  getSelectedUser(): UserOption | undefined {
    const selectedUserId = this.selectedUserId();
    return selectedUserId === null
      ? undefined
      : this.users().find((item) => Number(item.id) === selectedUserId);
  }

  getSelectedProjectLabel(): string {
    const selectedProjectId = this.selectedProjectId();
    if (selectedProjectId === null) {
      return 'All Projects';
    }

    return this.getProjectLabelById(selectedProjectId) || `Project #${selectedProjectId}`;
  }

  getSelectedProject(): ProjectOption | undefined {
    const selectedProjectId = this.selectedProjectId();
    return selectedProjectId === null
      ? undefined
      : this.projects().find((item) => Number(item.id) === selectedProjectId);
  }

  getSelectedMonthLabel(): string {
    const selectedMonth = this.selectedMonth();
    return selectedMonth === null
      ? 'All Months'
      : this.monthOptions.find((month) => month.value === selectedMonth)?.label ||
          `Month ${selectedMonth}`;
  }

  getSelectedYearLabel(): string {
    return this.selectedYear() === null ? 'All Years' : String(this.selectedYear());
  }

  getSelectedTypeLabel(): string {
    return this.selectedType() === 'completed' ? 'Completed' : 'All Types';
  }

  getUserPhoto(user: UserOption | undefined): string {
    return getFirstMediaUrl(user) || '';
  }

  getProjectPhoto(project: ProjectOption | undefined): string {
    return getFirstMediaUrl(project) || '';
  }

  getInitial(value: string | number | undefined): string {
    return (
      String(value ?? '?')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?'
    );
  }

  getUserOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Users', initial: 'A' },
      ...this.users().map((user) => ({
        value: user.id,
        label: this.getUserName(user, user.id),
        imageUrl: this.getUserPhoto(user),
        initial: this.getInitial(this.getUserName(user, user.id)),
      })),
    ];
  }

  getProjectOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Projects', initial: 'A' },
      ...this.projects().map((project) => ({
        value: project.id,
        label: project.label || project.name || `Project #${project.id}`,
        imageUrl: this.getProjectPhoto(project),
        initial: this.getInitial(project.label || project.name || project.id),
      })),
    ];
  }

  getMonthOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Months' },
      ...this.monthOptions.map((month) => ({ value: month.value, label: month.label })),
    ];
  }

  getYearOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Years' },
      ...this.yearOptions().map((year) => ({ value: year, label: String(year) })),
    ];
  }

  getTypeOptions(): DropdownSelectOption[] {
    return [
      { value: '', label: 'All Types' },
      { value: 'completed', label: 'Completed' },
    ];
  }

  private loadReportData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    const filters = this.getSelectedReportFilters();

    forkJoin({
      tasks: this.taskService.getTasks(this.selectedUserId() ?? undefined, filters),
      taskTodos: this.taskService.getTaskTodos(filters),
      timelogs: this.timelogService.getTimelogs(filters),
      projects: this.taskService.getProjects(),
    }).subscribe({
      next: ({ tasks, taskTodos, timelogs, projects }) => {
        this.tasks.set(tasks);
        this.taskTodos.set(taskTodos);
        this.timelogs.set(timelogs);
        this.projects.set(projects);
        this.reportRows.set(this.buildRows());
        this.isLoading.set(false);
      },
      error: () => {
        this.reportRows.set([]);
        this.errorMessage.set('Failed to load reports.');
        this.isLoading.set(false);
      },
    });
  }

  private loadUsers(): void {
    this.isLoadingUsers.set(true);

    this.taskService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.users.set([]);
        this.isLoadingUsers.set(false);
      },
    });
  }

  private loadAvailableYears(): void {
    const baseFilters =
      this.selectedProjectId() !== null ? { projectId: this.selectedProjectId()! } : {};

    forkJoin({
      tasks: this.taskService.getTasks(this.selectedUserId() ?? undefined, baseFilters),
      taskTodos: this.taskService.getTaskTodos(baseFilters),
      timelogs: this.timelogService.getTimelogs(),
    }).subscribe({
      next: ({ tasks, taskTodos, timelogs }) => {
        const years = new Set<number>([this.currentYear]);
        const collectYear = (value?: string) => {
          const year = this.parseDate(value)?.getFullYear();
          if (year) {
            years.add(year);
          }
        };

        tasks.forEach((task) => collectYear(this.getReportDateValue(task)));
        taskTodos.forEach((todo) => collectYear(this.getReportDateValue(todo)));
        timelogs
          .filter((timelog) => this.matchesSelectedUser(timelog.user_id))
          .forEach((timelog) => collectYear(this.getReportDateValue(timelog)));

        this.yearOptions.set(Array.from(years).sort((a, b) => b - a));
      },
      error: () => this.yearOptions.set([this.currentYear]),
    });
  }

  private buildRows(): ReportRow[] {
    const rows = new Map<string, ReportRow>();

    this.getAllTodos()
      .filter((todo) => this.shouldIncludeTodo(todo))
      .forEach((todo) => {
        const task = todo.task || this.findTask(todo.task_id);
        const key = String(todo.id ?? `${todo.task_id ?? 'task'}-${todo.label ?? 'todo'}`);
        const createdAt = this.getReportDateValue(todo, task);

        rows.set(key, {
          assignee: this.getTodoAssigneeName(todo, task),
          todo: todo.label || `Todo #${todo.id ?? '-'}`,
          status: todo.status || 'pending',
          created: 1,
          completed: this.isTodoCompleted(todo) ? 1 : 0,
          project: this.getTaskTodoProject(todo, task),
          timeSpendMinutes: this.getReportNumberField(todo, 'timeSpendMinutes'),
          createdAt,
          groupWeek: this.getReportGroupWeek(todo, createdAt),
          groupDay: this.getReportGroupDay(todo, createdAt),
        });
      });

    this.filteredTimelogs().forEach((timelog) => {
      const taskTodo = timelog.task_todo;
      const task = taskTodo?.task || this.findTask(taskTodo?.task_id);
      const key = String(timelog.task_todo_id ?? taskTodo?.id ?? `timelog-${timelog.id ?? ''}`);
      const createdAt = this.getReportDateValue(timelog, taskTodo, task);
      const current =
        rows.get(key) ||
        ({
          assignee: this.getUserName(timelog.user, timelog.user_id),
          todo: taskTodo?.label || timelog.name || `Timelog #${timelog.id ?? '-'}`,
          status: this.getReportStringField(taskTodo, 'status') || timelog.status || 'active',
          created: 0,
          completed: 0,
          project: this.getTaskTodoProject(taskTodo, task),
          timeSpendMinutes: 0,
          createdAt,
          groupWeek: this.getReportGroupWeek(timelog, createdAt),
          groupDay: this.getReportGroupDay(timelog, createdAt),
        } as ReportRow);
      const isTimelogCompleted = this.isCompletedStatus(timelog.status);
      const nextStatus =
        isTimelogCompleted && !this.isCompletedStatus(current.status)
          ? timelog.status || current.status
          : current.status;

      rows.set(key, {
        ...current,
        status: nextStatus,
        completed: current.completed || isTimelogCompleted ? 1 : 0,
        project:
          current.project && current.project !== '-'
            ? current.project
            : this.getTaskTodoProject(taskTodo, task),
        createdAt: current.createdAt || createdAt,
        groupWeek: current.groupWeek || this.getReportGroupWeek(timelog, createdAt),
        groupDay: current.groupDay || this.getReportGroupDay(timelog, createdAt),
        timeSpendMinutes:
          current.timeSpendMinutes +
          Number(timelog.minuted_logged ?? this.calculateMinuteDiff(timelog.start, timelog.end)),
      });
    });

    return Array.from(rows.values()).sort((first, second) => {
      const firstTime = this.parseDate(first.createdAt)?.getTime() ?? 0;
      const secondTime = this.parseDate(second.createdAt)?.getTime() ?? 0;
      return firstTime - secondTime;
    });
  }

  private getAllTodos(): TaskTodoRecord[] {
    const todos = new Map<string, TaskTodoRecord>();

    const addTodo = (todo: TaskTodoRecord, task?: TaskRecord) => {
      const key = String(
        todo.id ?? `${todo.task_id ?? task?.id ?? 'task'}-${todo.label ?? 'todo'}`,
      );
      const taskId = todo.task_id ?? task?.id;
      const normalizedTaskId = Number(taskId);
      todos.set(key, {
        ...todo,
        task: todo.task || task,
        task_id: Number.isFinite(normalizedTaskId) ? normalizedTaskId : undefined,
      });
    };

    this.taskTodos().forEach((todo) => addTodo(todo));
    this.tasks().forEach((task) => {
      const nestedTodos = task.task_todos || task.taskTodos || task.todos || [];
      nestedTodos.forEach((todo) => addTodo(todo, task));
    });

    return Array.from(todos.values());
  }

  private shouldIncludeTodo(todo: TaskTodoRecord): boolean {
    const task = todo.task || this.findTask(todo.task_id);
    return (
      this.isInSelectedPeriod(this.getReportDateValue(todo, task)) &&
      this.matchesSelectedTodoUser(todo, task) &&
      this.matchesSelectedProject(todo, task) &&
      this.matchesSelectedType(todo.status)
    );
  }

  private filteredTimelogs(): TimelogRecord[] {
    return this.timelogs().filter((timelog) => {
      const taskTodo = timelog.task_todo;
      const task = taskTodo?.task || this.findTask(taskTodo?.task_id);

      return (
        this.isInSelectedPeriod(timelog.start || timelog.created_at) &&
        this.matchesSelectedUser(timelog.user_id) &&
        this.matchesSelectedProject(taskTodo, task) &&
        this.matchesSelectedType(taskTodo?.status || timelog.status)
      );
    });
  }

  private findTask(taskId: number | string | undefined): TaskRecord | undefined {
    return this.tasks().find((task) => Number(task.id) === Number(taskId));
  }

  private getTaskTodoProject(todo: unknown, task: unknown): string {
    return (
      this.getProjectLabel(this.getReportField(todo, 'project')) ||
      this.getReportStringField(todo, 'project') ||
      this.getProjectLabelFromTask(this.getReportField(todo, 'task')) ||
      this.getProjectLabelFromTask(task) ||
      this.getProjectLabelById(this.getReportField(todo, 'project_id')) ||
      this.getProjectLabelById(
        this.getReportField(this.getReportField(todo, 'task'), 'project_id'),
      ) ||
      this.getProjectLabelById(this.getReportField(task, 'project_id')) ||
      '-'
    );
  }

  getUserName(
    user: { username?: string; name?: string; email?: string } | null | undefined,
    userId?: number | string,
  ): string {
    return user?.name || user?.username || user?.email || `User #${userId ?? '-'}`;
  }

  private getTodoAssigneeName(todo: TaskTodoRecord, task?: TaskRecord): string {
    if (todo.users?.length) {
      return todo.users.map((user) => this.getUserName(user, user.id)).join(', ');
    }

    return this.getUserName(todo.user, todo.user_id ?? task?.user_id);
  }

  private getReportGroupWeek(source: unknown, fallbackDate?: string): number | string {
    const value = this.getReportField(source, 'groupWeek');
    if (value !== undefined && value !== null && value !== '') {
      return value as number | string;
    }

    const date = this.parseDate(fallbackDate || this.getReportDateValue(source));
    return date ? Math.ceil(date.getDate() / 7) : 1;
  }

  private getReportGroupDay(source: unknown, fallbackDate?: string): string {
    return (
      this.getReportStringField(source, 'groupDay') ||
      this.formatGroupDay(fallbackDate || this.getReportDateValue(source))
    );
  }

  private getReportNumberField(source: unknown, key: string): number {
    const value = this.getReportField(source, key);
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private getReportStringField(source: unknown, key: string): string {
    const value = this.getReportField(source, key);
    return typeof value === 'string' ? value : '';
  }

  private getReportField(source: unknown, key: string): unknown {
    return source && typeof source === 'object' && key in source
      ? (source as Record<string, unknown>)[key]
      : undefined;
  }

  private getProjectLabelFromTask(task: unknown): string {
    return this.getProjectLabel(this.getReportField(task, 'project'));
  }

  private getProjectLabelById(projectId: unknown): string {
    const id = Number(projectId);
    if (!Number.isInteger(id) || id <= 0) {
      return '';
    }

    const project = this.projects().find((item) => Number(item.id) === id);
    return project ? this.getProjectLabel(project) : '';
  }

  private getProjectLabel(project: unknown): string {
    if (typeof project === 'string') {
      return project;
    }

    return (
      this.getReportStringField(project, 'label') ||
      this.getReportStringField(project, 'title') ||
      this.getReportStringField(project, 'name')
    );
  }

  private getReportDateValue(...sources: unknown[]): string {
    for (const source of sources) {
      const value =
        this.getReportStringField(source, 'start') ||
        this.getReportStringField(source, 'end') ||
        this.getReportStringField(source, 'created_at') ||
        this.getReportStringField(source, 'createdAt') ||
        this.getReportStringField(source, 'updated_at') ||
        this.getReportStringField(source, 'updatedAt');

      if (value) {
        return value;
      }
    }

    return '';
  }

  private formatGroupDay(value?: string): string {
    const date = this.parseDate(value);
    if (!date) {
      return 'Unknown date';
    }

    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private isInSelectedPeriod(value?: string): boolean {
    const date = this.parseDate(value);
    if (!date) {
      return false;
    }

    const selectedMonth = this.selectedMonth();
    const selectedYear = this.selectedYear();
    const matchesMonth = selectedMonth === null || date.getMonth() + 1 === selectedMonth;
    const matchesYear = selectedYear === null || date.getFullYear() === selectedYear;
    return matchesMonth && matchesYear;
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  getGroupKey(row: ReportRow): string {
    return this.getWeekGroupKey(row);
  }

  private getMonthGroupKey(row: ReportRow): string {
    const date = this.parseDate(row.createdAt);
    if (!date) {
      return 'unknown';
    }

    return `month-${date.getFullYear()}-${date.getMonth() + 1}`;
  }

  private getWeekGroupKey(row: ReportRow): string {
    const date = this.parseDate(row.createdAt);
    if (!date) {
      return 'unknown';
    }

    const groupWeek =
      row.groupWeek === undefined || row.groupWeek === null || row.groupWeek === ''
        ? 1
        : row.groupWeek;
    return `week-${date.getFullYear()}-${date.getMonth() + 1}-${groupWeek}`;
  }

  private getPdfFileName(): string {
    const parts = ['task-report', this.getSelectedYearLabel(), this.getSelectedMonthLabel()]
      .map((part) =>
        part
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      )
      .filter(Boolean);
    return `${parts.join('-') || 'task-report'}.pdf`;
  }

  private isTodoCompleted(todo: TaskTodoRecord): boolean {
    return this.isCompletedStatus(todo.status) || Number(todo.progress || 0) >= 100;
  }

  private isCompletedStatus(status?: string): boolean {
    const normalizedStatus = String(status || '').toLowerCase();
    return (
      normalizedStatus === 'finish' ||
      normalizedStatus === 'finished' ||
      normalizedStatus === 'completed' ||
      normalizedStatus === 'completed_but_overdue'
    );
  }

  private getSelectedReportFilters(): { month?: number; year?: number; projectId?: number } {
    const filters: { month?: number; year?: number; projectId?: number } = {};
    const month = this.selectedMonth();
    const year = this.selectedYear();
    const projectId = this.selectedProjectId();

    if (month !== null) {
      filters.month = month;
    }

    if (year !== null) {
      filters.year = year;
    }

    if (projectId !== null) {
      filters.projectId = projectId;
    }

    return filters;
  }

  private parseDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private currentUserId(): number | null {
    const id = Number(this.authService.getUser()?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private matchesSelectedUser(userId?: number | string): boolean {
    const selectedUserId = this.selectedUserId();
    return selectedUserId === null || Number(userId) === Number(selectedUserId);
  }

  private matchesSelectedTodoUser(todo: TaskTodoRecord, task?: TaskRecord): boolean {
    const selectedUserId = this.selectedUserId();
    if (selectedUserId === null) {
      return true;
    }

    const userIds = new Set<number>();
    [todo.user_id, todo.user?.id, task?.user_id].forEach((value) => {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) {
        userIds.add(id);
      }
    });

    (todo.users || []).forEach((user) => {
      const id = Number(user?.id);
      if (Number.isInteger(id) && id > 0) {
        userIds.add(id);
      }
    });

    if (Array.isArray(todo.user_ids)) {
      todo.user_ids.forEach((value) => {
        const id = Number(value);
        if (Number.isInteger(id) && id > 0) {
          userIds.add(id);
        }
      });
    }

    return userIds.has(selectedUserId);
  }

  private matchesSelectedProject(...sources: unknown[]): boolean {
    const selectedProjectId = this.selectedProjectId();
    if (selectedProjectId === null) {
      return true;
    }

    return sources.some((source) => {
      const projectId =
        this.getReportField(source, 'project_id') ??
        this.getReportField(this.getReportField(source, 'project'), 'id') ??
        this.getReportField(this.getReportField(source, 'task'), 'project_id') ??
        this.getReportField(
          this.getReportField(this.getReportField(source, 'task'), 'project'),
          'id',
        );

      return Number(projectId) === selectedProjectId;
    });
  }

  private matchesSelectedType(status?: string): boolean {
    const selectedType = this.selectedType();
    return !selectedType || this.normalizeStatus(status) === selectedType;
  }

  private getPdfUserId(): number | null {
    return this.isManager ? this.selectedUserId() : null;
  }

  private isUnauthorizedError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
  }

  private handlePdfUnauthorized(): void {
    this.errorMessage.set('Session expired. Please login again.');
    this.toastService.error({ title: 'Session expired', message: 'Please login again.' });
    this.authService.logout();
  }

  private normalizeStatus(status?: string): string {
    const normalizedStatus = String(status || '').toLowerCase();
    return normalizedStatus === 'finish' ||
      normalizedStatus === 'finished' ||
      normalizedStatus === 'completed_but_overdue'
      ? 'completed'
      : normalizedStatus;
  }

  private normalizeNullableNumber(value: DropdownSelectValue): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numberValue = Number(value);
    return Number.isInteger(numberValue) ? numberValue : null;
  }
}
