import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import { TaskRecord, TaskTodoRecord } from '../../task/schema/task.schema';
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
  imports: [CommonModule, FcIconComponent],
  templateUrl: './my-reports.component.html',
})
export class MyReportsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly taskService = inject(TaskService);
  private readonly timelogService = inject(TimelogService);

  readonly selectedMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly tasks = signal<TaskRecord[]>([]);
  readonly taskTodos = signal<TaskTodoRecord[]>([]);
  readonly timelogs = signal<TimelogRecord[]>([]);
  readonly reportRows = signal<ReportRow[]>([]);
  readonly isLoading = signal(false);
  readonly isGeneratingPdf = signal(false);
  readonly errorMessage = signal('');
  readonly selectedUserId = signal<number | null>(
    this.permission.isManager() ? null : this.currentUserId(),
  );

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('en-US', { month: 'long' }).format(this.selectedMonth()),
  );

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
  readonly totalCompleted = computed(
    () => this.reportRows().reduce((sum, row) => sum + Number(row.completed || 0), 0),
  );

  ngOnInit(): void {
    this.loadReportData();
  }

  previousMonth(): void {
    const month = this.selectedMonth();
    this.selectedMonth.set(new Date(month.getFullYear(), month.getMonth() - 1, 1));
    this.loadReportData();
  }

  nextMonth(): void {
    const month = this.selectedMonth();
    this.selectedMonth.set(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    this.loadReportData();
  }

  generatePdf(): void {
    if (this.isGeneratingPdf()) {
      return;
    }

    const selectedMonth = this.selectedMonth();
    const month = selectedMonth.getMonth() + 1;
    const year = selectedMonth.getFullYear();

    this.isGeneratingPdf.set(true);
    this.errorMessage.set('');

    this.taskService.generateTaskReportPdf({ month, year }).subscribe({
      next: (response) => {
        const blob = response.body;

        if (!blob) {
          this.errorMessage.set('Failed to generate PDF.');
          return;
        }

        this.downloadBlob(
          blob,
          this.taskService.getFilenameFromResponse(
            response,
            `task-report-${year}-${String(month).padStart(2, '0')}.pdf`,
          ),
        );
      },
      error: () => {
        this.errorMessage.set('Failed to generate PDF.');
        this.isGeneratingPdf.set(false);
      },
      complete: () => {
        this.isGeneratingPdf.set(false);
      },
    });
  }

  trackRowById(index: number, row: ReportRow): string {
    return `${row.groupWeek}-${row.groupDay}-${row.assignee}-${row.todo}-${index}`;
  }

  shouldShowGroupSeparator(index: number, row: ReportRow): boolean {
    const previousRow = this.reportRows()[index - 1];
    return !previousRow || this.getGroupKey(previousRow) !== this.getGroupKey(row);
  }

  getGroupLabel(row: ReportRow): string {
    return `Week ${row.groupWeek} - ${row.groupDay}`;
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

  private loadReportData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    forkJoin({
      tasks: this.taskService.getTasks(this.selectedUserId() ?? undefined),
      taskTodos: this.taskService.getTaskTodos(),
      timelogs: this.timelogService.getTimelogs(),
    }).subscribe({
      next: ({ tasks, taskTodos, timelogs }) => {
        this.tasks.set(tasks);
        this.taskTodos.set(taskTodos);
        this.timelogs.set(timelogs);
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

  private buildRows(): ReportRow[] {
    const rows = new Map<string, ReportRow>();

    this.filteredTodos().forEach((todo) => {
      const task = todo.task || this.findTask(todo.task_id);
      const key = String(todo.id ?? `${todo.task_id ?? 'task'}-${todo.label ?? 'todo'}`);

      rows.set(key, {
        assignee: this.getUserName(todo.user, todo.user_id ?? task?.user_id),
        todo: todo.label || `Todo #${todo.id ?? '-'}`,
        status: todo.status || 'pending',
        created: 1,
        completed: todo.status === 'completed' || Number(todo.progress || 0) >= 100 ? 1 : 0,
        project: this.getTaskTodoProject(todo, task),
        timeSpendMinutes: this.getReportNumberField(todo, 'timeSpendMinutes'),
        createdAt: this.getReportStringField(todo, 'createdAt') || todo.created_at || '',
        groupWeek: this.getReportGroupWeek(todo),
        groupDay: this.getReportGroupDay(todo),
      });
    });

    this.filteredTimelogs().forEach((timelog) => {
      const taskTodo = timelog.task_todo;
      const task = taskTodo?.task || this.findTask(taskTodo?.task_id);
      const key = String(timelog.task_todo_id ?? taskTodo?.id ?? `timelog-${timelog.id ?? ''}`);
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
          createdAt: this.getReportStringField(taskTodo, 'created_at'),
          groupWeek: this.getReportGroupWeek(taskTodo),
          groupDay: this.getReportGroupDay(taskTodo),
        } as ReportRow);

      rows.set(key, {
        ...current,
        timeSpendMinutes:
          current.timeSpendMinutes +
          Number(timelog.minuted_logged ?? this.calculateMinuteDiff(timelog.start, timelog.end)),
      });
    });

    return Array.from(rows.values());
  }

  private filteredTodos(): TaskTodoRecord[] {
    return this.taskTodos().filter((todo) => {
      const task = todo.task || this.findTask(todo.task_id);
      return (
        this.isInSelectedMonth(todo.created_at || task?.due_date || task?.created_at) &&
        this.matchesSelectedUser(todo.user_id ?? task?.user_id)
      );
    });
  }

  private filteredTimelogs(): TimelogRecord[] {
    return this.timelogs().filter(
      (timelog) =>
        this.isInSelectedMonth(timelog.start || timelog.created_at) &&
        this.matchesSelectedUser(timelog.user_id),
    );
  }

  private findTask(taskId: number | string | undefined): TaskRecord | undefined {
    return this.tasks().find((task) => Number(task.id) === Number(taskId));
  }

  private getTaskTodoProject(
    todo: unknown,
    task: unknown,
  ): string {
    return this.getProjectLabelFromTask(this.getReportField(todo, 'task')) || this.getProjectLabelFromTask(task) || '-';
  }

  private getUserName(
    user: { username?: string; name?: string; email?: string } | null | undefined,
    userId?: number | string,
  ): string {
    return user?.name || user?.username || user?.email || `User #${userId ?? '-'}`;
  }

  private getReportGroupWeek(todo: unknown): number | string {
    const value = this.getReportField(todo, 'groupWeek');
    return value === undefined || value === null || value === '' ? '-' : (value as number | string);
  }

  private getReportGroupDay(todo: unknown): string {
    return this.getReportStringField(todo, 'groupDay') || this.formatGroupDayFromCreatedAt(todo);
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
    const project = this.getReportField(task, 'project');
    const label = this.getReportStringField(project, 'label');
    return label || '';
  }

  private formatGroupDayFromCreatedAt(source: unknown): string {
    const createdAt =
      this.getReportStringField(source, 'createdAt') ||
      this.getReportStringField(source, 'created_at');
    const date = this.parseDate(createdAt);
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private isInSelectedMonth(value?: string): boolean {
    const date = this.parseDate(value);
    const month = this.selectedMonth();
    return Boolean(
      date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(),
    );
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private getGroupKey(row: ReportRow): string {
    return `${row.groupWeek}-${row.groupDay}`;
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

  private downloadBlob(blob: Blob, filename: string): void {
    const fileUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');

    downloadLink.href = fileUrl;
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener';
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }
}
