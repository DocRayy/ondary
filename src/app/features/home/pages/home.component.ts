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
import { TaskDialogComponent } from '../../task/components/task-dialog/task-dialog.component';
import {
  TaskRecord,
  TaskStatus,
  TaskTodoStatus,
  getTaskUserIds,
  parseTaskIdList,
} from '../../task/schema/task.schema';
import { TaskService } from '../../task/service/task.service';
import { ActiveTimelogService } from '../../timelog/service/active-timelog.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

Chart.register(...registerables);

type ManagerChartRecord =
  | (HomeTaskRecord & { recordType: 'task' })
  | (HomeTodoRecord & { recordType: 'todo' });

type ManagerChartBucket = {
  labels: string[];
  ongoing: number[];
  completed: number[];
  max: number;
  stepSize: number;
};

type HomeWorkItem = {
  recordType: 'task' | 'todo';
  task?: HomeTaskRecord;
  todo?: HomeTodoRecord;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ManagerNotesComponent,
    StickyNotesComponent,
    TaskDialogComponent,
  ],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly homeService = inject(HomeService);
  private readonly taskService = inject(TaskService);
  readonly activeTimelogService = inject(ActiveTimelogService);
  private readonly toastService = inject(ToastService);
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
  readonly userTodos = signal<HomeTodoRecord[]>([]);
  readonly chartTasks = signal<HomeTaskRecord[]>([]);
  readonly chartTodos = signal<HomeTodoRecord[]>([]);
  readonly chartTimelogs = signal<HomeTimelogRecord[]>([]);
  readonly isTaskDialogOpen = signal(false);
  readonly selectedTaskDialogTask = signal<TaskRecord | null>(null);
  readonly selectedTaskDialogStatus = signal<TaskStatus>('draft');
  readonly selectedTaskTodoId = signal<number | string | null>(null);
  readonly isLoadingTaskDetail = signal(false);
  readonly creatingTimelogTodoId = signal<number | string | null>(null);
  readonly summaryErrorMessage = signal('');
  readonly managerFilter = signal<'days' | 'weeks' | 'months'>('days');
  readonly managerDate = signal(new Date());
  readonly isManager = this.permission.isManager();

  readonly ongoingTasks = computed(() =>
    this.userTasks().filter((task) => this.isOngoingTask(this.getTaskStatus(task))),
  );

  readonly completedTasks = computed(() =>
    this.userTasks().filter((task) => this.isCompletedStatus(this.getTaskStatus(task), task.progress)),
  );

  readonly ongoingTodos = computed(() =>
    this.userTodos().filter((todo) => !this.isCompletedStatus(todo.status, todo.progress)),
  );

  readonly completedTodos = computed(() =>
    this.userTodos().filter((todo) => this.isCompletedStatus(todo.status, todo.progress)),
  );

  readonly ongoingWorkItems = computed<HomeWorkItem[]>(() => [
    ...this.ongoingTasks().map((task) => ({ recordType: 'task' as const, task })),
    ...(this.isManager
      ? []
      : this.ongoingTodos().map((todo) => ({ recordType: 'todo' as const, todo }))),
  ]);

  readonly completedWorkItems = computed<HomeWorkItem[]>(() => [
    ...this.completedTasks().map((task) => ({ recordType: 'task' as const, task })),
    ...(this.isManager
      ? []
      : this.completedTodos().map((todo) => ({ recordType: 'todo' as const, todo }))),
  ]);

  readonly visibleTasks = computed(() =>
    this.activeTaskTab() === 'ongoing' ? this.ongoingTasks() : this.completedTasks(),
  );

  readonly visibleWorkItems = computed(() =>
    this.activeTaskTab() === 'ongoing' ? this.ongoingWorkItems() : this.completedWorkItems(),
  );

  readonly managerChartTasks = computed(() => {
    const filter = this.managerFilter();
    const selectedDate = this.managerDate();

    return this.userTasks().filter((task) => {
      const date = this.getManagerRecordDate({ ...task, recordType: 'task' });
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

  readonly managerChartTodos = computed(() => {
    const filter = this.managerFilter();
    const selectedDate = this.managerDate();

    return this.getOverviewTodos().filter((todo) => {
      const date = this.getManagerRecordDate({ ...todo, recordType: 'todo' });
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

  readonly managerChartTotals = computed(() => {
    const bucket = this.getManagerChartBucket();
    return {
      ongoing: this.sumChartCounts(bucket.ongoing),
      completed: this.sumChartCounts(bucket.completed),
    };
  });

  readonly managerOngoingCount = computed(() => this.managerChartTotals().ongoing);

  readonly managerCompletedCount = computed(() => this.managerChartTotals().completed);

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
        const currentUserTasks = this.filterTasksByUserId(tasks, userId);
        const visibleTasks = this.isManager ? tasks : currentUserTasks;
        const visibleTodos = this.isManager ? todos : this.filterTodosByUserId(todos, userId);
        const visibleTimelogs = this.isManager ? timelogs : this.filterByUserId(timelogs, userId);

        this.userTasks.set(visibleTasks);
        this.userTodos.set(visibleTodos);
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
        this.userTasks.set([]);
        this.userTodos.set([]);
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

  getTodoLabel(todo: HomeTodoRecord): string {
    return todo.label || `Task Todo #${todo.id ?? '-'}`;
  }

  getTodoTaskTitle(todo: HomeTodoRecord): string {
    return todo.task ? this.getTaskTitle(todo.task) : `Task #${todo.task_id ?? '-'}`;
  }

  getTodoStatusLabel(todo: HomeTodoRecord): string {
    const statusLabels: Record<TaskTodoStatus, string> = {
      pending: 'Pending',
      progress: 'Progress',
      completed: 'Completed',
      completed_but_overdue: 'Completed but Overdue',
    };
    const status = this.normalizeStatus(todo.status) as TaskTodoStatus;
    return statusLabels[status] || todo.status || 'Pending';
  }

  getTodoAssigneeLabel(todo: HomeTodoRecord): string {
    const assignees = this.getRecordUsers(todo);
    return assignees.length
      ? assignees.map((user) => user.name || user.username || user.email || `User #${user.id}`).join(', ')
      : 'Unassigned';
  }

  getTodoEstimateLabel(todo: HomeTodoRecord): string {
    if (todo.estimate_time_label) {
      return todo.estimate_time_label;
    }

    const estimateHours = Number(todo.estimate_time_hours ?? todo.estimate_time);
    return Number.isFinite(estimateHours) && estimateHours > 0 ? `${estimateHours}h` : '';
  }

  getTodoCreatedTime(todo: HomeTodoRecord): string {
    return this.formatTime(todo.created_at);
  }

  getTodoUpdatedTime(todo: HomeTodoRecord): string {
    return this.formatTime(todo.updated_at);
  }

  getTodoDuration(todo: HomeTodoRecord): string {
    const createdDate = this.parseDate(todo.created_at);
    const updatedDate = this.parseDate(todo.updated_at);

    if (!createdDate || !updatedDate) {
      return '-';
    }

    return this.formatMinutes(
      Math.max(0, Math.round((updatedDate.getTime() - createdDate.getTime()) / 60000)),
    );
  }

  canCreateTimelog(todo: HomeTodoRecord): boolean {
    if (!todo.id || this.creatingTimelogTodoId() || this.activeTimelogService.isFinishedTaskTodo(todo.id)) {
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

  isTodoActiveTimelog(todo: HomeTodoRecord): boolean {
    return this.activeTimelogService.isActiveTaskTodo(todo.id);
  }

  isTodoPausedTimelog(todo: HomeTodoRecord): boolean {
    return this.activeTimelogService.isPausedTaskTodo(todo.id);
  }

  isTodoFinishedTimelog(todo: HomeTodoRecord): boolean {
    return this.activeTimelogService.isFinishedTaskTodo(todo.id);
  }

  createTimelogForTodo(todo: HomeTodoRecord, event?: Event): void {
    event?.stopPropagation();
    this.summaryErrorMessage.set('');

    if (this.isTodoActiveTimelog(todo)) {
      this.activeTimelogService.openEndDialog();
      return;
    }

    if (!todo.id) {
      this.summaryErrorMessage.set('Save task todo before creating timelog.');
      return;
    }

    if (!this.isCurrentUserTodoAssignee(todo)) {
      this.summaryErrorMessage.set('You can only create timelog for your assigned todo.');
      return;
    }

    const pausedTimelog = this.activeTimelogService.getPausedTaskTodoTimelog(todo.id);
    if (pausedTimelog) {
      this.creatingTimelogTodoId.set(todo.id);
      this.activeTimelogService.continueTimelog(pausedTimelog)?.subscribe({
        next: (response) => {
          this.creatingTimelogTodoId.set(null);
          this.toastService.success(response);
        },
        error: (error) => {
          this.creatingTimelogTodoId.set(null);
          this.summaryErrorMessage.set(this.toastService.getErrorMessage(error, ''));
          this.toastService.errorFrom(error);
        },
      });
      return;
    }

    const userId = Number(this.currentUser()?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.summaryErrorMessage.set('User is required to create timelog.');
      return;
    }

    this.creatingTimelogTodoId.set(todo.id);
    this.activeTimelogService
      .createTimelog({
        user_id: userId,
        task_todo_id: Number(todo.id),
        name: this.getTodoLabel(todo),
        start: new Date().toISOString(),
      })
      .subscribe({
        next: (response) => {
          this.creatingTimelogTodoId.set(null);
          this.toastService.success(response);
        },
        error: (error) => {
          this.creatingTimelogTodoId.set(null);
          this.summaryErrorMessage.set(this.toastService.getErrorMessage(error, ''));
          this.toastService.errorFrom(error);
        },
      });
  }

  openTaskFromHome(task: HomeTaskRecord): void {
    if (!task.id) {
      return;
    }

    this.selectedTaskTodoId.set(null);
    this.openTaskDialogById(task.id);
  }

  openTodoTaskDialog(todo: HomeTodoRecord): void {
    const taskId = todo.task_id ?? todo.task?.id;
    if (!taskId) {
      return;
    }

    this.selectedTaskTodoId.set(todo.id ?? null);
    this.openTaskDialogById(taskId);
  }

  onTaskDialogVisibleChange(visible: boolean): void {
    this.isTaskDialogOpen.set(visible);
    if (!visible) {
      this.selectedTaskDialogTask.set(null);
      this.selectedTaskTodoId.set(null);
    }
  }

  onTaskUpdated(task: TaskRecord): void {
    this.selectedTaskDialogTask.set(task);
    this.loadUserSummary();
  }

  onTaskDeleted(): void {
    this.isTaskDialogOpen.set(false);
    this.selectedTaskDialogTask.set(null);
    this.loadUserSummary();
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

  private filterByUserId<T extends UserRelatedRecord>(records: T[], userId: number): T[] {
    return records.filter((record) => this.recordHasUserId(record, userId));
  }

  private filterTasksByUserId(tasks: HomeTaskRecord[], userId: number): HomeTaskRecord[] {
    return tasks.filter((task) => {
      if (this.recordHasUserId(task, userId)) {
        return true;
      }

      return getTaskUserIds(task as TaskRecord).includes(Number(userId));
    });
  }

  private filterTodosByUserId(todos: HomeTodoRecord[], userId: number): HomeTodoRecord[] {
    return todos.filter((todo) => this.recordHasUserId(todo, userId));
  }

  private recordHasUserId(record: UserRelatedRecord, userId: number | string): boolean {
    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return false;
    }

    const userIds = new Set<number>();
    const legacyUserId = Number(record.user_id ?? record.user?.id);
    if (Number.isInteger(legacyUserId) && legacyUserId > 0) {
      userIds.add(legacyUserId);
    }

    this.getRecordUsers(record).forEach((user) => {
      const id = Number(user.id);
      if (Number.isInteger(id) && id > 0) {
        userIds.add(id);
      }
    });

    parseTaskIdList(record.user_ids).forEach((id) => userIds.add(id));

    return userIds.has(targetUserId);
  }

  private getRecordUsers(record: UserRelatedRecord) {
    if (Array.isArray(record.users)) {
      return record.users.filter(Boolean);
    }

    return record.user ? [record.user] : [];
  }

  private getTaskStatus(task: HomeTaskRecord): string | undefined {
    return task.board_column || task.status;
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
      ['completed', 'complete', 'finish', 'finished', 'done', 'completed_but_overdue'].includes(
        normalizedStatus,
      ) ||
      (Number.isFinite(numericProgress) && numericProgress >= 100)
    );
  }

  private isCurrentUserTodoAssignee(todo: HomeTodoRecord): boolean {
    const currentUserId = Number(this.currentUser()?.id);
    return Number.isInteger(currentUserId) && this.recordHasUserId(todo, currentUserId);
  }

  private openTaskDialogById(taskId: number | string): void {
    this.summaryErrorMessage.set('');
    this.isTaskDialogOpen.set(true);
    this.isLoadingTaskDetail.set(true);
    this.taskService.getTask(taskId).subscribe({
      next: (task) => {
        this.selectedTaskDialogTask.set(task);
        this.selectedTaskDialogStatus.set(this.normalizeTaskStatus(task.board_column || task.status));
        this.isLoadingTaskDetail.set(false);
      },
      error: (error) => {
        this.isLoadingTaskDetail.set(false);
        this.isTaskDialogOpen.set(false);
        this.summaryErrorMessage.set(this.toastService.getErrorMessage(error, ''));
        this.toastService.errorFrom(error);
      },
    });
  }

  private normalizeTaskStatus(status: string | undefined): TaskStatus {
    const normalized = this.normalizeStatus(status) as TaskStatus;
    return ['draft', 'progress', 'on_hold', 'completed'].includes(normalized)
      ? normalized
      : 'draft';
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

      if (this.isCompletedStatus(record.status, record.progress)) {
        completed[index] += 1;
        return;
      }

      if (record.recordType === 'todo' || this.isOngoingTask(record.status)) {
        ongoing[index] += 1;
      }
    });

    return { labels, ongoing, completed, max, stepSize };
  }

  private sumChartCounts(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private getFilteredManagerChartRecords(): ManagerChartRecord[] {
    const records: ManagerChartRecord[] = [
      ...this.managerChartTasks().map((record) => ({ ...record, recordType: 'task' as const })),
      ...this.managerChartTodos().map((record) => ({ ...record, recordType: 'todo' as const })),
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
    if (this.isCompletedStatus(record.status, record.progress)) {
      return this.parseDate(
        record.completed_at ||
          record.finish_date ||
          (record.recordType === 'task' ? record.moved_at : undefined) ||
          record.updated_at ||
          record.due_date ||
          record.created_at,
      );
    }

    return this.parseDate(record.due_date || record.created_at || record.updated_at);
  }

  private getOverviewTodos(): HomeTodoRecord[] {
    const todos = new Map<string, HomeTodoRecord>();
    const addTodo = (todo: HomeTodoRecord) => {
      const key = this.getTodoUniqueKey(todo);
      if (!key) {
        return;
      }

      const existing = todos.get(key);
      todos.set(key, {
        ...existing,
        ...todo,
        task: todo.task || existing?.task,
      });
    };

    this.chartTodos().forEach((todo) => addTodo(todo));
    this.chartTasks().forEach((task) => this.getTaskTodos(task).forEach((todo) => addTodo(todo)));

    return Array.from(todos.values());
  }

  private getTaskTodos(task: HomeTaskRecord): HomeTodoRecord[] {
    return task.task_todos || task.taskTodos || task.todos || [];
  }

  private getTodoUniqueKey(todo: HomeTodoRecord): string {
    if (todo.id !== undefined && todo.id !== null && String(todo.id).trim()) {
      return `id:${todo.id}`;
    }

    const taskId = todo.task_id ?? todo.task?.id ?? '';
    const label = todo.label ?? '';
    const createdAt = todo.created_at ?? '';
    return taskId || label || createdAt ? `fallback:${taskId}:${label}:${createdAt}` : '';
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
