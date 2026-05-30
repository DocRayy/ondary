import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';
import gsap from 'gsap';
import {
  HomeTaskRecord,
  HomeTimelogRecord,
  HomeTodoRecord,
  TaskTab,
  UserRelatedRecord,
} from '../schema/home.schema';
import { HomeService } from '../service/home.service';
import { ManagerNotesComponent } from '../components/manager-notes/manager-notes.component';
import { StickyNotesComponent } from '../components/sticky-notes/sticky-notes.component';

Chart.register(...registerables);

type ManagerChartRecord =
  | (HomeTaskRecord & { recordType: 'task' })
  | (HomeTodoRecord & { recordType: 'todo' })
  | (HomeTimelogRecord & { recordType: 'timelog' });

type ManagerChartBucket = {
  labels: string[];
  ongoing: number[];
  completed: number[];
  max: number;
  stepSize: number;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ManagerNotesComponent, StickyNotesComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly homeService = inject(HomeService);
  @ViewChild('managerTaskChart') private managerTaskChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('managerChartPanel') private managerChartPanelRef?: ElementRef<HTMLDivElement>;

  private managerChart?: Chart<'line'>;
  private managerChartReady = false;

  readonly currentUser = signal(this.authService.getUser());
  readonly tasksCount = signal(0);
  readonly todosCount = signal(0);
  readonly timelogsCount = signal(0);
  readonly taskDailyComparisonText = signal('No change comparing with last day ago');
  readonly todosLastUpdateText = signal('No todos updated yet');
  readonly loadingSummary = signal(false);
  readonly activeTaskTab = signal<TaskTab>('ongoing');
  readonly userTasks = signal<HomeTaskRecord[]>([]);
  readonly chartTasks = signal<HomeTaskRecord[]>([]);
  readonly chartTodos = signal<HomeTodoRecord[]>([]);
  readonly chartTimelogs = signal<HomeTimelogRecord[]>([]);
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

  ngAfterViewInit(): void {
    this.managerChartReady = true;
    this.renderManagerChart();
  }

  ngOnDestroy(): void {
    this.managerChart?.destroy();
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
      timelogs: this.homeService.getCollection<HomeTimelogRecord>('/timelogs'),
    }).subscribe({
      next: ({ tasks, todos, timelogs }) => {
        const currentUserTasks = this.filterByUserId(tasks, userId);
        const visibleTasks = this.isManager ? tasks : currentUserTasks;
        const visibleTodos = this.isManager ? todos : this.filterByUserId(todos, userId);
        const visibleTimelogs = this.isManager ? timelogs : this.filterByUserId(timelogs, userId);

        this.userTasks.set(visibleTasks);
        this.chartTasks.set(visibleTasks);
        this.chartTodos.set(visibleTodos);
        this.chartTimelogs.set(visibleTimelogs);
        this.tasksCount.set(visibleTasks.length);
        this.todosCount.set(visibleTodos.length);
        this.timelogsCount.set(visibleTimelogs.length);
        this.taskDailyComparisonText.set(this.getTaskDailyComparisonText(visibleTasks));
        this.todosLastUpdateText.set(this.getTodosLastUpdateText(visibleTodos));
        this.loadingSummary.set(false);
        this.renderManagerChart();
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
    this.renderManagerChart();
  }

  selectManagerDate(date: Date): void {
    this.managerDate.set(date);
    this.renderManagerChart();
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
    return ['draft', 'progress', 'on_hold', 'ongoing', 'on going', 'active', 'pending'].includes(
      this.normalizeStatus(status),
    );
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

  private isCompletedStatus(status: string | undefined, progress?: number | string): boolean {
    const normalizedStatus = this.normalizeStatus(status);
    const numericProgress = Number(progress ?? 0);
    return (
      ['completed', 'finish', 'finished', 'done'].includes(normalizedStatus) ||
      (Number.isFinite(numericProgress) && numericProgress >= 100)
    );
  }

  private renderManagerChart(): void {
    if (!this.isManager || !this.managerChartReady || !this.managerTaskChartRef) {
      return;
    }

    const bucket = this.getManagerChartBucket();
    const canvas = this.managerTaskChartRef.nativeElement;
    const panel = this.managerChartPanelRef?.nativeElement;

    const datasets = [
      {
        label: 'On Going',
        data: bucket.ongoing,
        borderColor: '#FACC15',
        backgroundColor: 'rgba(250, 204, 21, 0.16)',
        pointBackgroundColor: '#FACC15',
        pointBorderColor: '#1E293B',
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        tension: 0.38,
        fill: true,
      },
      {
        label: 'Completed',
        data: bucket.completed,
        borderColor: '#4ADE80',
        backgroundColor: 'rgba(74, 222, 128, 0.14)',
        pointBackgroundColor: '#4ADE80',
        pointBorderColor: '#1E293B',
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        tension: 0.38,
        fill: true,
      },
    ];

    if (!this.managerChart) {
      const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
          labels: bucket.labels,
          datasets,
        },
        options: this.getManagerChartOptions(bucket.max, bucket.stepSize),
      };

      this.managerChart = new Chart(canvas, config);
    } else {
      this.managerChart.data.labels = bucket.labels;
      this.managerChart.data.datasets = datasets;
      this.managerChart.options = this.getManagerChartOptions(bucket.max, bucket.stepSize);
      this.managerChart.update();
    }

    if (panel) {
      gsap.killTweensOf(panel);
      gsap.fromTo(
        panel,
        { autoAlpha: 0.78, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power2.out' },
      );
    }
  }

  private getManagerChartOptions(max: number, stepSize: number): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 650,
        easing: 'easeOutQuart',
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          labels: {
            color: '#F8FAFC',
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            font: {
              family: 'Inter, sans-serif',
              size: 12,
              weight: 'bold',
            },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          borderColor: '#475569',
          borderWidth: 1,
          titleColor: '#F8FAFC',
          bodyColor: '#E2E8F0',
          displayColors: true,
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(148, 163, 184, 0.16)',
          },
          ticks: {
            color: '#CBD5E1',
            font: {
              size: 11,
              weight: 'bold',
            },
          },
        },
        y: {
          min: 0,
          max,
          ticks: {
            stepSize,
            color: '#CBD5E1',
            font: {
              size: 11,
              weight: 'bold',
            },
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.18)',
          },
        },
      },
    };
  }

  private getManagerChartBucket(): ManagerChartBucket {
    const filter = this.managerFilter();

    if (filter === 'days') {
      return this.buildManagerChartBucket(
        Array.from({ length: 11 }, (_, index) => `${String(index + 7).padStart(2, '0')}:00`),
        30,
        5,
        (date) => date.getHours() - 7,
      );
    }

    if (filter === 'weeks') {
      return this.buildManagerChartBucket(
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        200,
        50,
        (date) => (date.getDay() + 6) % 7,
      );
    }

    const weekCount = this.getWeekOfMonth(
      new Date(this.managerDate().getFullYear(), this.managerDate().getMonth() + 1, 0),
    );
    return this.buildManagerChartBucket(
      Array.from({ length: weekCount }, (_, index) => `Week ${index + 1}`),
      500,
      100,
      (date) => this.getWeekOfMonth(date) - 1,
    );
  }

  private buildManagerChartBucket(
    labels: string[],
    max: number,
    stepSize: number,
    getIndex: (date: Date) => number,
  ): ManagerChartBucket {
    const ongoing = Array.from({ length: labels.length }, () => 0);
    const completed = Array.from({ length: labels.length }, () => 0);

    this.getFilteredManagerChartRecords().forEach((record) => {
      const date = this.getManagerRecordDate(record);
      if (!date) {
        return;
      }

      const index = getIndex(date);
      if (index < 0 || index >= labels.length) {
        return;
      }

      const progress = record.recordType === 'timelog' ? undefined : record.progress;
      if (this.isCompletedStatus(record.status, progress)) {
        completed[index] += 1;
        return;
      }

      if (this.isOngoingTask(record.status)) {
        ongoing[index] += 1;
      }
    });

    return { labels, ongoing, completed, max, stepSize };
  }

  private getFilteredManagerChartRecords(): ManagerChartRecord[] {
    const records: ManagerChartRecord[] = [
      ...this.chartTasks().map((record) => ({ ...record, recordType: 'task' as const })),
      ...this.chartTodos().map((record) => ({ ...record, recordType: 'todo' as const })),
      ...this.chartTimelogs().map((record) => ({ ...record, recordType: 'timelog' as const })),
    ];

    return records.filter((record) => {
      const date = this.getManagerRecordDate(record);
      if (!date) {
        return false;
      }

      if (this.managerFilter() === 'days') {
        return this.isSameDate(date, this.managerDate());
      }

      if (this.managerFilter() === 'weeks') {
        return this.isSameWeek(date, this.managerDate());
      }

      return this.isSameMonth(date, this.managerDate());
    });
  }

  private getManagerRecordDate(record: ManagerChartRecord): Date | null {
    if (record.recordType === 'timelog') {
      return this.parseDate(record.start || record.end || record.created_at || record.updated_at);
    }

    return this.parseDate(record.due_date || record.created_at || record.updated_at);
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

  private isSameWeek(first: Date, second: Date): boolean {
    const firstStart = this.getStartOfWeek(first);
    const secondStart = this.getStartOfWeek(second);
    return this.isSameDate(firstStart, secondStart);
  }

  private getStartOfWeek(date: Date): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
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
