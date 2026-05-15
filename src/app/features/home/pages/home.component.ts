import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import { HomeTaskRecord, HomeTodoRecord, TaskTab, UserRelatedRecord } from '../schema/home.schema';
import { HomeService } from '../service/home.service';
import { ManagerNotesComponent } from '../components/manager-notes/manager-notes.component';
import { StickyNotesComponent } from '../components/sticky-notes/sticky-notes.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ManagerNotesComponent, StickyNotesComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly homeService = inject(HomeService);

  readonly currentUser = signal(this.authService.getUser());
  readonly tasksCount = signal(0);
  readonly todosCount = signal(0);
  readonly timelogsCount = signal(0);
  readonly taskDailyComparisonText = signal('No change comparing with last day ago');
  readonly todosLastUpdateText = signal('No todos updated yet');
  readonly loadingSummary = signal(false);
  readonly activeTaskTab = signal<TaskTab>('ongoing');
  readonly userTasks = signal<HomeTaskRecord[]>([]);
  readonly managerFilter = signal<'days' | 'weeks' | 'months'>('days');
  readonly managerDate = signal(new Date());
  readonly isManager = this.permission.isManager();

  readonly ongoingTasks = computed(() =>
    this.userTasks().filter((task) => this.isOngoingTask(task.status)),
  );

  readonly completedTasks = computed(() =>
    this.userTasks().filter((task) => this.normalizeStatus(task.status) === 'completed'),
  );

  readonly visibleTasks = computed(() =>
    this.activeTaskTab() === 'ongoing' ? this.ongoingTasks() : this.completedTasks(),
  );

  readonly managerChartTasks = computed(() => {
    const filter = this.managerFilter();
    const selectedDate = this.managerDate();

    return this.userTasks().filter((task) => {
      const date = this.parseDate(task.due_date || task.created_at);
      if (!date) {
        return false;
      }

      if (filter === 'days') {
        return this.isSameDate(date, selectedDate);
      }

      if (filter === 'weeks') {
        return (
          this.getWeekOfMonth(date) === this.getWeekOfMonth(selectedDate) &&
          this.isSameMonth(date, selectedDate)
        );
      }

      return (
        date.getFullYear() === selectedDate.getFullYear() &&
        date.getMonth() === selectedDate.getMonth()
      );
    });
  });

  readonly managerOngoingCount = computed(
    () => this.managerChartTasks().filter((task) => this.isOngoingTask(task.status)).length,
  );

  readonly managerCompletedCount = computed(
    () =>
      this.managerChartTasks().filter((task) => this.normalizeStatus(task.status) === 'completed')
        .length,
  );

  readonly managerChartMax = computed(() =>
    Math.max(1, this.managerOngoingCount(), this.managerCompletedCount()),
  );

  readonly managerDateCards = computed(() => {
    const selectedDate = this.managerDate();
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    if (this.managerFilter() === 'days') {
      return Array.from(
        { length: new Date(year, month + 1, 0).getDate() },
        (_, index) => new Date(year, month, index + 1),
      );
    }

    if (this.managerFilter() === 'weeks') {
      return Array.from(
        { length: this.getWeekOfMonth(new Date(year, month + 1, 0)) },
        (_, index) => new Date(year, month, index * 7 + 1),
      );
    }

    return Array.from({ length: 12 }, (_, index) => new Date(year, index, 1));
  });

  getGreeting() {
    const hour = dayjs().hour();

    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  readonly greetingName = computed(() => {
    const user = this.currentUser();
    return user?.username || user?.name || 'User';
  });

  ngOnInit(): void {
    this.loadUserSummary();
  }

  private loadUserSummary(): void {
    const userId = this.currentUser()?.id;

    if (!userId) {
      return;
    }

    this.loadingSummary.set(true);

    forkJoin({
      tasks: this.homeService.getCollection<HomeTaskRecord>('/task'),
      todos: this.homeService.getCollection<HomeTodoRecord>('/task-todos'),
      timelogs: this.homeService.getCollection('/timelogs'),
    }).subscribe({
      next: ({ tasks, todos, timelogs }) => {
        const currentUserTasks = this.filterByUserId(tasks, userId);
        const visibleTasks = this.isManager ? tasks : currentUserTasks;
        const visibleTodos = this.isManager ? todos : this.filterByUserId(todos, userId);

        this.userTasks.set(visibleTasks);
        this.tasksCount.set(visibleTasks.length);
        this.todosCount.set(visibleTodos.length);
        this.timelogsCount.set(
          this.isManager ? timelogs.length : this.countByUserId(timelogs, userId),
        );
        this.taskDailyComparisonText.set(this.getTaskDailyComparisonText(visibleTasks));
        this.todosLastUpdateText.set(this.getTodosLastUpdateText(visibleTodos));
        this.loadingSummary.set(false);
      },
      error: () => {
        this.loadingSummary.set(false);
      },
    });
  }

  setActiveTaskTab(tab: TaskTab): void {
    this.activeTaskTab.set(tab);
  }

  getTaskTitle(task: HomeTaskRecord): string {
    return task.title || task.task_title || task.name || `Task #${task.id ?? '-'}`;
  }

  setManagerFilter(filter: 'days' | 'weeks' | 'months'): void {
    this.managerFilter.set(filter);
  }

  selectManagerDate(date: Date): void {
    this.managerDate.set(date);
  }

  getManagerDateLabel(date: Date): string {
    if (this.managerFilter() === 'days') {
      return new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(date);
    }

    if (this.managerFilter() === 'weeks') {
      return `Week ${this.getWeekOfMonth(date)}`;
    }

    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  }

  isSelectedManagerDate(date: Date): boolean {
    const selectedDate = this.managerDate();
    if (this.managerFilter() === 'days') {
      return this.isSameDate(date, selectedDate);
    }

    if (this.managerFilter() === 'weeks') {
      return (
        this.getWeekOfMonth(date) === this.getWeekOfMonth(selectedDate) &&
        this.isSameMonth(date, selectedDate)
      );
    }

    return (
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth()
    );
  }

  private countByUserId(records: UserRelatedRecord[], userId: number): number {
    return this.filterByUserId(records, userId).length;
  }

  private filterByUserId<T extends UserRelatedRecord>(records: T[], userId: number): T[] {
    return records.filter(
      (record) => Number(record.user_id ?? record.user?.id) === Number(userId),
    );
  }

  private isOngoingTask(status: string | undefined): boolean {
    return ['draft', 'progress', 'on_hold'].includes(this.normalizeStatus(status));
  }

  private getTaskDailyComparisonText(tasks: HomeTaskRecord[]): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const todayCount = tasks.filter((task) =>
      this.isSameDate(this.parseDate(task.created_at), today),
    ).length;
    const yesterdayCount = tasks.filter((task) =>
      this.isSameDate(this.parseDate(task.created_at), yesterday),
    ).length;
    const difference = todayCount - yesterdayCount;

    if (difference === 0) {
      return 'No change comparing with last day ago';
    }

    const prefix = difference > 0 ? '+' : '';
    return `${prefix}${difference} comparing with last day ago`;
  }

  private getTodosLastUpdateText(todos: HomeTodoRecord[]): string {
    const latestDate = todos
      .map((todo) => this.parseDate(todo.updated_at || todo.created_at))
      .filter((date): date is Date => Boolean(date))
      .sort((first, second) => second.getTime() - first.getTime())[0];

    if (!latestDate) {
      return 'No todos updated yet';
    }

    const relativeTime = this.formatRelativeTime(latestDate);
    return relativeTime === 'just now' ? 'Last update just now' : `Last update ${relativeTime} ago`;
  }

  private normalizeStatus(status: string | undefined): string {
    return (status ?? '').toLowerCase().trim();
  }

  private parseDate(value?: string | Date | null): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isSameDate(first: Date | null, second: Date): boolean {
    if (!first) {
      return false;
    }

    return this.isSameMonth(first, second) && first.getDate() === second.getDate();
  }

  private isSameMonth(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
  }

  private getWeekOfMonth(date: Date): number {
    return Math.ceil(date.getDate() / 7);
  }

  private formatRelativeTime(date: Date): string {
    const diffInSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

    if (diffInSeconds < 60) {
      return 'just now';
    }

    const units = [
      { limit: 60, seconds: 1, label: 'second' },
      { limit: 60, seconds: 60, label: 'minute' },
      { limit: 24, seconds: 60 * 60, label: 'hour' },
      { limit: 30, seconds: 60 * 60 * 24, label: 'day' },
      { limit: 12, seconds: 60 * 60 * 24 * 30, label: 'month' },
      { limit: Number.POSITIVE_INFINITY, seconds: 60 * 60 * 24 * 365, label: 'year' },
    ];

    let value = diffInSeconds;
    for (const unit of units) {
      const nextValue = Math.floor(diffInSeconds / unit.seconds);
      if (nextValue < unit.limit) {
        value = Math.max(1, nextValue);
        return `${value} ${unit.label}${value === 1 ? '' : 's'}`;
      }
    }

    return 'just now';
  }
}
