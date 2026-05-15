import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  readonly isLoading = signal(false);
  readonly isGeneratingPdf = signal(false);
  readonly errorMessage = signal('');
  readonly selectedUserId = signal<number | null>(
    this.permission.isManager() ? null : this.currentUserId(),
  );

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('en-US', { month: 'long' }).format(this.selectedMonth()),
  );

  readonly reportRows = computed(() => this.buildRows());
  readonly totalMinutes = computed(() =>
    this.reportRows().reduce((sum, row) => sum + row.timeSpendMinutes, 0),
  );
  readonly totalTodos = computed(() => this.filteredTodos().length);
  readonly totalProjects = computed(() => {
    const ids = new Set(
      this.filteredTasks()
        .map((task) => task.project_id)
        .filter((id) => id !== undefined && id !== null)
        .map((id) => String(id)),
    );
    return ids.size;
  });
  readonly totalCompleted = computed(
    () =>
      this.filteredTodos().filter(
        (todo) => todo.status === 'completed' || Number(todo.progress || 0) >= 100,
      ).length,
  );

  ngOnInit(): void {
    this.loadReportData();
  }

  previousMonth(): void {
    const month = this.selectedMonth();
    this.selectedMonth.set(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const month = this.selectedMonth();
    this.selectedMonth.set(new Date(month.getFullYear(), month.getMonth() + 1, 1));
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
    return `${row.assignee}-${row.todo}-${row.project}-${index}`;
  }

  formatMinutes(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return '0h 0m';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  private loadReportData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.taskService.getTasks(this.selectedUserId() ?? undefined).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loadTaskTodosAndTimelogs();
      },
      error: () => {
        this.errorMessage.set('Failed to load reports.');
        this.isLoading.set(false);
      },
    });
  }

  private loadTaskTodosAndTimelogs(): void {
    this.taskService.getTaskTodos().subscribe({
      next: (taskTodos) => {
        this.taskTodos.set(taskTodos);
        this.timelogService.getTimelogs().subscribe({
          next: (timelogs) => {
            this.timelogs.set(timelogs);
            this.isLoading.set(false);
          },
          error: () => {
            this.errorMessage.set('Failed to load reports.');
            this.isLoading.set(false);
          },
        });
      },
      error: () => {
        this.errorMessage.set('Failed to load reports.');
        this.isLoading.set(false);
      },
    });
  }

  private buildRows(): ReportRow[] {
    const rows = new Map<string, ReportRow>();

    this.filteredTodos().forEach((todo) => {
      const task = todo.task || this.findTask(todo.task_id);
      const assignee = this.getUserName(todo.user, todo.user_id);
      const project = this.getProjectName(task);
      const key = `${assignee}-${todo.id ?? todo.label}-${project}`;

      rows.set(key, {
        assignee,
        todo: todo.label || `Todo #${todo.id ?? '-'}`,
        status: todo.status || 'pending',
        created: 1,
        completed: todo.status === 'completed' || Number(todo.progress || 0) >= 100 ? 1 : 0,
        project,
        timeSpendMinutes: 0,
      });
    });

    this.filteredTimelogs().forEach((timelog) => {
      const taskTodo = timelog.task_todo;
      const task = taskTodo?.task || this.findTask(taskTodo?.task_id);
      const assignee = this.getUserName(timelog.user, timelog.user_id);
      const todo = taskTodo?.label || timelog.name || `Timelog #${timelog.id ?? '-'}`;
      const project = this.getProjectName(task);
      const key = `${assignee}-${timelog.task_todo_id ?? timelog.id}-${project}`;
      const current = rows.get(key) || {
        assignee,
        todo,
        status: timelog.status || 'active',
        created: 0,
        completed: 0,
        project,
        timeSpendMinutes: 0,
      };

      rows.set(key, {
        ...current,
        status: timelog.status || current.status,
        completed: current.completed + (timelog.status === 'finish' ? 1 : 0),
        timeSpendMinutes:
          current.timeSpendMinutes +
          Number(timelog.minuted_logged ?? this.calculateMinuteDiff(timelog.start, timelog.end)),
      });
    });

    return Array.from(rows.values());
  }

  private filteredTasks(): TaskRecord[] {
    return this.tasks().filter(
      (task) =>
        this.isInSelectedMonth(task.due_date || task.created_at) &&
        this.matchesSelectedUser(task.user_id),
    );
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

  private getProjectName(
    task:
      | TaskRecord
      | {
          title?: string;
          name?: string;
          project_id?: number | string;
          project?: { label?: string; name?: string } | null;
        }
      | undefined
      | null,
  ): string {
    return (
      task?.project?.label ||
      task?.project?.name ||
      task?.title ||
      task?.name ||
      (task?.project_id ? `Project #${task.project_id}` : '-')
    );
  }

  private getUserName(
    user: { username?: string; name?: string; email?: string } | null | undefined,
    userId?: number | string,
  ): string {
    return user?.name || user?.username || user?.email || `User #${userId ?? '-'}`;
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
