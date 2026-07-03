import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin, Subscription } from 'rxjs';
import { FcIconComponent } from '@shared/components/fc-icon/fc-icon.component';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
  DropdownSelectValue,
} from '@shared/components/dropdown-select/dropdown-select.component';
import { TaskDialogComponent } from '../../components/task-dialog/task-dialog.component';
import {
  TASK_STATUSES,
  ProjectOption,
  TaskLabelOption,
  TaskRecord,
  TaskStatus,
  TaskTodoRecord,
  UpdateTaskRequest,
  getTaskUserIds,
  getTaskUsers,
  parseTaskIdList,
} from '../../schema/task.schema';
import { TaskService } from '../../service/task.service';
import { TimelogFileRecord, TimelogRecord } from '../../../timelog/schema/timelog.schema';
import { TimelogService } from '../../../timelog/service/timelog.service';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  RealtimeService,
  RealtimeTaskPayload,
  RealtimeTodoPayload,
} from '../../../../core/realtime/realtime.service';
import { RolePermissionService } from '../../../../core/auth/role-permission.service';
import { UserOption } from '../../schema/task.schema';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { getApiMediaUrl, getFirstMediaUrl } from '@app/shared/utils/media';
import { GsapModalDirective } from '../../../../shared/directives/gsap-modal.directive';
import { UpcomingUserSeparatorComponent } from '../../../../shared/components/upcoming-user-separator/upcoming-user-separator.component';
import gsap from 'gsap';

type ViewType = 'board' | 'timelog' | 'calendar' | 'recap';

interface TaskCard {
  id?: number | string;
  title: string;
  date: string;
  subtask: string;
  progress: number;
  members: TaskCardMember[];
  labels: TaskLabelOption[];
  project?: ProjectOption;
  task: TaskRecord;
}

interface TaskCardMember {
  id: number | string;
  name: string;
  photo: string;
  initial: string;
}

interface TaskColumn {
  title: string;
  status: TaskStatus;
  count: number;
  cards: TaskCard[];
  emptyText?: string;
}

interface CalendarDay {
  day: number;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
}

interface RecapRow {
  assignee: string;
  photo: string;
  todo: string;
  status: string;
  created: number;
  completed: number;
  project: string;
  timeSpend: string;
}

interface UpcomingTodo {
  id: number | string;
  title: string;
  date: string;
  task: TaskRecord;
  todo: TaskTodoRecord;
  assignees: UserOption[];
  project: string;
}

interface UpcomingTodoGroup {
  user: UserOption;
  todos: UpcomingTodo[];
  expanded: boolean;
}

interface TimelogTimelineLog {
  id: number | string;
  label: string;
  left: number;
  width: number;
  lane: number;
  startTime: number;
  endTime: number;
  files: TimelogFileRecord[];
  record: TimelogRecord;
}

interface TimelogPopoverState {
  log: TimelogTimelineLog;
  top: number;
  left: number;
}

interface TimelogTimelineUser {
  id: number | string;
  name: string;
  photo: string;
  logs: TimelogTimelineLog[];
  lanes: number;
}

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    FcIconComponent,
    DropdownSelectComponent,
    TaskDialogComponent,
    GsapModalDirective,
    UpcomingUserSeparatorComponent,
  ],
  templateUrl: './task-list.component.html',
})
export class TaskListComponent implements OnInit, OnDestroy {
  private readonly taskService = inject(TaskService);
  private readonly timelogService = inject(TimelogService);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly permission = inject(RolePermissionService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private notificationRouteSubscription: Subscription | null = null;
  private readonly realtimeSubscriptions: Subscription[] = [];
  private readonly pendingRealtimeTaskFetches = new Set<string>();
  private readonly validStatuses = new Set<TaskStatus>(TASK_STATUSES);
  private readonly timelineStartHour = 7;
  private readonly timelineEndHour = 17;
  private suppressBoardCardClick = false;

  readonly viewTabs = [
    { label: 'Board', value: 'board' },
    { label: 'Timelog', value: 'timelog' },
    { label: 'Calendar', value: 'calendar' },
    { label: 'Recap', value: 'recap' },
  ] as const satisfies ReadonlyArray<{ label: string; value: ViewType }>;

  activeView: ViewType = 'board';
  isTaskDialogOpen = false;
  isLoadingTasks = false;
  isLoadingTaskDetail = false;
  taskErrorMessage = '';
  taskLabels: TaskLabelOption[] = [];
  allTasks: TaskRecord[] = [];
  allTaskTodos: TaskTodoRecord[] = [];
  selectedTaskDialogStatus: TaskStatus = 'draft';
  selectedTaskDialogOrderIndex = 0;
  selectedTaskDialogTask: TaskRecord | null = null;
  selectedTaskTodoId: number | string | null = null;

  readonly columns: TaskColumn[] = [
    {
      title: 'Draft',
      status: 'draft',
      count: 0,
      cards: [],
      emptyText: 'No Task',
    },
    {
      title: 'Progress',
      status: 'progress',
      count: 0,
      cards: [],
      emptyText: 'No Task',
    },
    {
      title: 'On Hold',
      status: 'on_hold',
      count: 0,
      cards: [],
      emptyText: 'No Task',
    },
    {
      title: 'Completed',
      status: 'completed',
      count: 0,
      cards: [],
      emptyText: 'No Task',
    },
  ];
  readonly boardDropListIds = this.columns.map((_, index) => this.getBoardDropListId(index));
  readonly boardConnectedDropListIds = this.boardDropListIds.map((_, index) =>
    this.boardDropListIds.filter((__, connectedIndex) => connectedIndex !== index),
  );

  readonly timeSlots = [
    '07:00',
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
  ];
  get timelineSegments(): number {
    return this.timeSlots.length - 1;
  }
  timelogUsers: TimelogTimelineUser[] = [];
  isLoadingTimelogs = false;
  timelogErrorMessage = '';
  activeTimelogPopover: TimelogPopoverState | null = null;
  previewImage: { src: string; alt: string } | null = null;

  readonly calendarWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  readonly today = new Date();
  selectedCalendarYear = this.today.getFullYear();
  selectedCalendarMonth = this.today.getMonth();
  currentMonthLabel = this.getCalendarMonthLabel();
  calendarWeeks = this.createCalendar(this.selectedCalendarYear, this.selectedCalendarMonth);
  calendarTasks: TaskRecord[] = [];
  upcomingTasks: UpcomingTodo[] = [];
  upcomingTodoGroups: UpcomingTodoGroup[] = [];
  recapRows: RecapRow[] = [];
  private recapTimerId?: ReturnType<typeof setInterval>;
  private latestTimelogs: TimelogRecord[] = [];
  private timelineClockTick = Date.now();
  isMyTaskMode = this.permission.isMember();
  users: UserOption[] = [];
  selectedUserId = this.permission.isManager() ? '' : String(this.getCurrentUserId() ?? '');
  projects: ProjectOption[] = [];
  selectedProjectId = '';
  selectedProject: ProjectOption | null = null;
  isProjectComboboxOpen = false;
  isUserComboboxOpen = false;
  isLoadingProjects = false;
  isRecentlyUpdatedMode = false;
  readonly isManager = this.permission.isManager();
  readonly isMember = this.permission.isMember();

  ngOnInit(): void {
    this.setupRealtimeSubscriptions();
    this.loadUsers();
    this.loadProjects();
    this.loadTasks();
    this.loadCalendarTasks();
    this.loadTimelogs();
    this.startRecapTimer();
    this.joinSelectedProject();
    this.notificationRouteSubscription = this.route.queryParamMap.subscribe((params) => {
      const taskId = params.get('task_id');
      const taskTodoId = params.get('task_todo_id');

      if (!taskId) {
        return;
      }

      this.openNotificationTask(taskId, taskTodoId);
    });
  }

  ngOnDestroy(): void {
    this.notificationRouteSubscription?.unsubscribe();
    this.realtimeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    if (this.recapTimerId) {
      clearInterval(this.recapTimerId);
    }
  }

  private createCalendar(year: number, month: number): CalendarDay[][] {
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const weeks: CalendarDay[][] = [];
    let dayCounter = 1;
    let nextMonthDay = 1;

    for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
      const week: CalendarDay[] = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const cellIndex = weekIndex * 7 + dayIndex;
        if (cellIndex < startDay) {
          const day = daysInPrevMonth - (startDay - cellIndex - 1);
          week.push({
            day,
            date: new Date(year, month - 1, day),
            inMonth: false,
            isToday: false,
          });
        } else if (dayCounter <= daysInMonth) {
          const isToday =
            year === this.today.getFullYear() &&
            month === this.today.getMonth() &&
            dayCounter === this.today.getDate();
          week.push({
            day: dayCounter,
            date: new Date(year, month, dayCounter),
            inMonth: true,
            isToday,
          });
          dayCounter += 1;
        } else {
          week.push({
            day: nextMonthDay,
            date: new Date(year, month + 1, nextMonthDay),
            inMonth: false,
            isToday: false,
          });
          nextMonthDay += 1;
        }
      }
      weeks.push(week);
      if (dayCounter > daysInMonth && nextMonthDay > 7) {
        break;
      }
    }

    return weeks;
  }

  setActiveView(view: ViewType) {
    this.activeView = view;
  }

  toggleMyTaskMode(): void {
    if (this.isManager) {
      return;
    }

    const currentUserId = this.getCurrentUserId();
    if (!this.isMyTaskMode && !currentUserId) {
      this.taskErrorMessage = 'Current user is required to load My Task.';
      return;
    }

    this.isMyTaskMode = !this.isMyTaskMode;
    this.selectedUserId = this.isMyTaskMode ? String(currentUserId ?? '') : '';
    this.loadTasks();
    this.loadCalendarTasks();
  }

  openTaskDialog(column: TaskColumn) {
    if (!this.isManager) {
      return;
    }

    this.selectedTaskDialogTask = null;
    this.selectedTaskDialogStatus = column.status;
    this.selectedTaskDialogOrderIndex = column.cards.length;
    this.isTaskDialogOpen = true;
  }

  openTaskDetailDialog(card: TaskCard) {
    this.selectedTaskDialogTask = {
      ...card.task,
      labels: card.labels,
    };
    this.selectedTaskDialogStatus = this.getTaskBoardStatus(card.task);
    this.selectedTaskDialogOrderIndex = Number(card.task.order_index ?? 0);
    this.isTaskDialogOpen = true;
    this.loadTaskDetail(card.task.id);
  }

  onBoardCardClick(event: Event, card: TaskCard) {
    if (this.suppressBoardCardClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.openTaskDetailDialog(card);
  }

  onBoardCardDragStarted() {
    this.suppressBoardCardClick = true;
  }

  onBoardCardDragEnded() {
    window.setTimeout(() => {
      this.suppressBoardCardClick = false;
    });
  }

  onTaskDialogVisibleChange(visible: boolean) {
    this.isTaskDialogOpen = visible;
    if (!visible) {
      this.selectedTaskTodoId = null;
      this.selectedTaskDialogTask = null;
    }
  }

  onTaskCreated(task: TaskRecord) {
    this.upsertTaskRecord(task);
    this.populateBoard(this.allTasks);
    this.populateUpcomingTodos();
    this.loadCalendarTasks();
  }

  onTaskUpdated(task: TaskRecord) {
    this.upsertTaskRecord(task);
    this.selectedTaskDialogTask = {
      ...task,
      labels: this.getTaskLabels(task),
    };
    this.selectedTaskDialogStatus = this.getTaskBoardStatus(task);
    this.selectedTaskDialogOrderIndex = Number(task.order_index ?? 0);
    this.populateBoard(this.allTasks);
    this.populateUpcomingTodos();
    this.loadCalendarTasks();
  }

  onTaskDeleted(taskId: number | string) {
    this.columns.forEach((column) => {
      column.cards = column.cards.filter((card) => String(card.id) !== String(taskId));
    });
    this.allTasks = this.allTasks.filter((task) => String(task.id) !== String(taskId));
    this.upcomingTasks = this.upcomingTasks.filter(
      (todo) => String(todo.task.id) !== String(taskId),
    );
    this.calendarTasks = this.calendarTasks.filter((task) => String(task.id) !== String(taskId));
    this.selectedTaskDialogTask = null;
    this.updateColumnCounts();
  }

  onBoardCardDrop(event: CdkDragDrop<TaskCard[]>) {
    const previousColumn = this.getColumnByDropListId(event.previousContainer.id);
    const targetColumn = this.getColumnByDropListId(event.container.id);

    if (!previousColumn || !targetColumn) {
      return;
    }

    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      this.updateColumnCounts();
      this.updateMovedTask(
        event.container.data[event.currentIndex],
        targetColumn,
        event.currentIndex,
      );
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    this.updateColumnCounts();
    this.updateMovedTask(
      event.container.data[event.currentIndex],
      targetColumn,
      event.currentIndex,
    );
  }

  canEditTask(task: TaskRecord | undefined): boolean {
    if (this.isManager) {
      return true;
    }

    const currentUserId = this.getCurrentUserId();
    if (!task || !currentUserId) {
      return false;
    }

    return this.getTaskRelatedUserIds(task).has(currentUserId);
  }

  getBoardDropListId(index: number) {
    return `board-column-${index}`;
  }

  trackColumnByStatus(_: number, column: TaskColumn): TaskStatus {
    return column.status;
  }

  trackCardById(index: number, card: TaskCard): number | string {
    return card.id ?? index;
  }

  trackLabelById(index: number, label: TaskLabelOption): number | string {
    return label.id ?? label.name ?? index;
  }

  trackMemberById(_: number, member: TaskCardMember): number | string {
    return member.id;
  }

  trackProjectById(index: number, project: ProjectOption): number | string {
    return project.id ?? index;
  }

  trackTimelogUserById(index: number, user: TimelogTimelineUser): number | string {
    return user.id ?? index;
  }

  trackTimelogById(index: number, log: TimelogTimelineLog): number | string {
    return log.id ?? index;
  }

  openTimelogPopover(log: TimelogTimelineLog, user: TimelogTimelineUser, event: MouseEvent): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    const container = target.closest('[data-timelog-container]') as HTMLElement | null;
    const scroller = target.closest('[data-timelog-scroll]') as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const width = 220;
    const rawLeft = containerRect
      ? rect.left - containerRect.left + (scroller?.scrollLeft ?? 0)
      : rect.left;
    const maxLeft = Math.max(8, (scroller?.scrollWidth ?? window.innerWidth) - width - 8);

    this.activeTimelogPopover = {
      log,
      top: containerRect ? rect.bottom - containerRect.top + 8 : rect.bottom + 8,
      left: Math.min(maxLeft, Math.max(8, rawLeft)),
    };

    window.setTimeout(() => {
      const popper = document.querySelector('[data-timelog-popover]');
      if (popper) {
        gsap.fromTo(
          popper,
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power2.out' },
        );
      }
    });
  }

  closeTimelogPopover(): void {
    const popper = document.querySelector('[data-timelog-popover]');
    if (!popper) {
      this.activeTimelogPopover = null;
      return;
    }

    gsap.to(popper, {
      autoAlpha: 0,
      y: 6,
      duration: 0.14,
      ease: 'power2.inOut',
      onComplete: () => {
        this.activeTimelogPopover = null;
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('[data-timelog-popover]') ||
      target?.closest('[data-timelog-bar]')
    ) {
      return;
    }

    if (this.activeTimelogPopover) {
      this.closeTimelogPopover();
    }
  }

  trackTimeSlotByValue(_: number, time: string): string {
    return time;
  }

  trackTimelogFileById(index: number, file: TimelogFileRecord): number | string {
    return file.id ?? file.photo ?? index;
  }

  getTimelogFilePhoto(file: TimelogFileRecord): string | null {
    return getApiMediaUrl(file.photo);
  }

  getTimelogPopoverStart(log: TimelogTimelineLog): string {
    return this.formatTime(log.record.start);
  }

  getTimelogPopoverEnd(log: TimelogTimelineLog): string {
    return this.isActiveTimelogRecord(log.record) ? '-' : this.formatTime(log.record.end);
  }

  getTimelogPopoverDuration(log: TimelogTimelineLog): string {
    if (this.isActiveTimelogRecord(log.record)) {
      return this.formatElapsed(log.record.start);
    }

    const loggedMinutes = Number(log.record.minuted_logged);
    return this.formatMinutes(
      Number.isFinite(loggedMinutes) && loggedMinutes > 0
        ? Math.round(loggedMinutes)
        : this.calculateMinuteDiff(log.record.start, log.record.end),
    );
  }

  getTimelogPopoverStatus(log: TimelogTimelineLog): string {
    return this.getTimelogStatusLabel(log.record);
  }

  openImagePreview(src: string | null, alt = 'Timelog attachment'): void {
    if (!src) {
      return;
    }

    this.previewImage = { src, alt };
  }

  closeImagePreview(): void {
    this.previewImage = null;
  }

  getTimelinePosition(index: number): number {
    return (index / this.timelineSegments) * 100;
  }

  getTimeSlotTransform(index: number): string {
    if (index === 0) {
      return 'translateX(0)';
    }

    if (index === this.timeSlots.length - 1) {
      return 'translateX(-100%)';
    }

    return 'translateX(-50%)';
  }

  trackCalendarTaskById(index: number, task: TaskRecord): number | string {
    return task.id ?? index;
  }

  trackUpcomingTodoById(index: number, todo: UpcomingTodo): number | string {
    return todo.id ?? index;
  }

  trackUpcomingGroupByUser(index: number, group: UpcomingTodoGroup): number | string {
    return group.user.id ?? index;
  }

  trackRecapRowById(index: number, row: RecapRow): string {
    return `${row.assignee}-${row.todo}-${index}`;
  }

  toggleUpcomingGroup(group: UpcomingTodoGroup): void {
    group.expanded = !group.expanded;
  }

  openUpcomingTodo(todo: UpcomingTodo): void {
    this.selectedTaskTodoId = todo.todo.id ?? null;
    this.openCalendarTask(todo.task);
  }

  onSelectedUserChange(userId: string): void {
    this.selectedUserId = userId;
    this.isUserComboboxOpen = false;
    this.isMyTaskMode = Boolean(userId);
    this.loadTasks();
    this.loadCalendarTasks();
    this.loadTimelogs();
  }

  onSelectedUserDropdownChange(value: DropdownSelectValue): void {
    this.onSelectedUserChange(value === null || value === undefined ? '' : String(value));
  }

  toggleUserCombobox(): void {
    this.isUserComboboxOpen = !this.isUserComboboxOpen;
  }

  toggleProjectCombobox(): void {
    this.isProjectComboboxOpen = !this.isProjectComboboxOpen;
    this.isUserComboboxOpen = false;

    if (!this.projects.length && !this.isLoadingProjects) {
      this.loadProjects();
    }
  }

  selectProject(project: ProjectOption | null): void {
    this.selectedProject = project;
    this.selectedProjectId = project?.id ? String(project.id) : '';
    this.isProjectComboboxOpen = false;
    this.joinSelectedProject();
    this.loadTasks();
    this.loadCalendarTasks();
  }

  onSelectedProjectDropdownChange(value: DropdownSelectValue): void {
    const selectedId = value === null || value === undefined ? '' : String(value);
    const project = selectedId
      ? this.projects.find((item) => String(item.id) === selectedId) || null
      : null;
    this.selectProject(project);
  }

  previousCalendarMonth(): void {
    this.setCalendarMonth(this.selectedCalendarYear, this.selectedCalendarMonth - 1);
  }

  nextCalendarMonth(): void {
    this.setCalendarMonth(this.selectedCalendarYear, this.selectedCalendarMonth + 1);
  }

  getTimelogRowHeight(user: TimelogTimelineUser): number {
    return Math.max(48, user.lanes * 42);
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

  getProjectName(project: ProjectOption | null | undefined): string {
    if (!project) {
      return 'All Projects';
    }

    return project.label || project.name || `Project #${project.id}`;
  }

  getProjectInitial(project: ProjectOption | null | undefined): string {
    return this.getProjectName(project).trim().slice(0, 1).toUpperCase() || '?';
  }

  getProjectPhoto(project: ProjectOption | null | undefined): string {
    return getFirstMediaUrl(project) || '';
  }

  getSelectedUser(): UserOption | undefined {
    return this.users.find((user) => String(user.id) === String(this.selectedUserId));
  }

  getSelectedUserLabel(): string {
    return this.selectedUserId
      ? this.getUserLabel(this.getSelectedUser(), this.selectedUserId)
      : 'All Users';
  }

  getUserLabel(user: UserOption | undefined, fallback?: number | string): string {
    return user?.name || user?.username || user?.email || `User #${fallback ?? '-'}`;
  }

  getUserInitialOption(user: UserOption | undefined, fallback?: number | string): string {
    return this.getUserLabel(user, fallback).trim().slice(0, 1).toUpperCase() || '?';
  }

  getProjectSelectOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Projects', initial: 'A' },
      ...this.projects.map((project) => ({
        value: project.id,
        label: this.getProjectName(project),
        imageUrl: this.getProjectPhoto(project),
        initial: this.getProjectInitial(project),
      })),
    ];
  }

  getUserSelectOptions(): DropdownSelectOption[] {
    return [
      { value: null, label: 'All Users', initial: 'A' },
      ...this.users.map((user) => ({
        value: user.id,
        label: this.getUserLabel(user, user.id),
        imageUrl: this.getUserPhoto(user),
        initial: this.getUserInitialOption(user),
      })),
    ];
  }

  getCalendarDayTasks(day: CalendarDay): TaskRecord[] {
    if (!day.inMonth) {
      return [];
    }

    return this.calendarTasks.filter((task) =>
      this.isSameDate(this.parseDate(task.due_date), day.date),
    );
  }

  getVisibleCalendarTasks(day: CalendarDay): TaskRecord[] {
    return this.getCalendarDayTasks(day).slice(0, 2);
  }

  getHiddenCalendarTaskCount(day: CalendarDay): number {
    return Math.max(0, this.getCalendarDayTasks(day).length - 2);
  }

  openCalendarTask(task: TaskRecord): void {
    this.selectedTaskDialogTask = {
      ...task,
      labels: this.getTaskLabels(task),
    };
    this.selectedTaskDialogStatus = this.getTaskBoardStatus(task);
    this.selectedTaskDialogOrderIndex = Number(task.order_index ?? 0);
    this.isTaskDialogOpen = true;
    this.loadTaskDetail(task.id);
  }

  private updateColumnCounts() {
    this.columns.forEach((column) => {
      column.count = column.cards.length;
    });
  }

  private loadTasks(): void {
    this.isLoadingTasks = true;
    this.taskErrorMessage = '';

    forkJoin({
      tasks: this.taskService.getTasks(this.getTaskFilterUserId(), {
        projectId: this.selectedProjectId || undefined,
        recentlyUpdatedDays: this.isRecentlyUpdatedMode ? 5 : undefined,
      }),
      taskTodos: this.taskService.getTaskTodos(),
      labels: this.taskService.getTaskLabels(),
    }).subscribe({
      next: ({ tasks, taskTodos, labels }) => {
        this.allTasks = tasks;
        this.allTaskTodos = taskTodos;
        this.taskLabels = labels
          .map((label) => ({ ...label, id: Number(label.id) }))
          .filter((label) => Number.isInteger(label.id) && label.id > 0 && Boolean(label.name));
        this.populateBoard(tasks);
        this.populateUpcomingTodos();
        this.isLoadingTasks = false;
      },
      error: () => {
        this.clearBoard();
        this.taskErrorMessage = 'Failed to load tasks.';
        this.isLoadingTasks = false;
      },
    });
  }

  toggleRecentlyUpdatedMode(): void {
    this.isRecentlyUpdatedMode = !this.isRecentlyUpdatedMode;
    this.loadTasks();
  }

  reloadTasks(): void {
    this.loadTasks();
  }

  getBoardEmptyText(column: TaskColumn): string {
    if (this.isRecentlyUpdatedMode) {
      return 'No tasks updated in the last 5 days.';
    }

    return column.emptyText || 'No Task';
  }

  private loadCalendarTasks(): void {
    this.taskService
      .getTasks(this.getTaskFilterUserId(), {
        month: this.selectedCalendarMonth + 1,
        year: this.selectedCalendarYear,
        projectId: this.selectedProjectId || undefined,
      })
      .subscribe({
        next: (tasks) => {
          this.calendarTasks = tasks;
        },
        error: () => {
          this.calendarTasks = [];
        },
      });
  }

  private setCalendarMonth(year: number, month: number): void {
    const selectedMonth = new Date(year, month, 1);

    this.selectedCalendarYear = selectedMonth.getFullYear();
    this.selectedCalendarMonth = selectedMonth.getMonth();
    this.currentMonthLabel = this.getCalendarMonthLabel();
    this.calendarWeeks = this.createCalendar(this.selectedCalendarYear, this.selectedCalendarMonth);
    this.loadCalendarTasks();
  }

  private getCalendarMonthLabel(): string {
    return `${this.monthNames[this.selectedCalendarMonth]} ${this.selectedCalendarYear}`;
  }

  private loadTimelogs(): void {
    this.isLoadingTimelogs = true;
    this.timelogErrorMessage = '';

    this.timelogService.getTimelogs().subscribe({
      next: (timelogs) => {
        this.latestTimelogs = timelogs;
        const filteredTimelogs = this.filterRecordsBySelectedUser(timelogs);
        this.timelogUsers = this.mapTimelogsToTimeline(filteredTimelogs);
        this.recapRows = this.mapTimelogsToRecapRows(filteredTimelogs);
        this.isLoadingTimelogs = false;
      },
      error: () => {
        this.timelogUsers = [];
        this.timelogErrorMessage = 'Failed to load timelogs.';
        this.isLoadingTimelogs = false;
      },
    });
  }

  private setupRealtimeSubscriptions(): void {
    this.realtimeSubscriptions.push(
      this.realtimeService.taskCreated$.subscribe((payload) => {
        const task = this.extractTask(payload);
        if (task) {
          this.applyRealtimeTask(task);
        }
      }),
      this.realtimeService.taskUpdated$.subscribe((payload) => {
        const task = this.extractTask(payload);
        if (task) {
          this.applyRealtimeTask(task);
        }
      }),
      this.realtimeService.taskMoved$.subscribe((payload) => {
        const task = this.extractTask(payload);
        if (task) {
          this.applyRealtimeTask(task);
        }
      }),
      this.realtimeService.taskDeleted$.subscribe((payload) => {
        const taskId = this.extractTaskId(payload);
        if (taskId) {
          this.onTaskDeleted(taskId);
        }
      }),
      this.realtimeService.todoUpdated$.subscribe((payload) => {
        const todo = this.extractTodo(payload);
        if (todo) {
          this.applyRealtimeTodo(todo);
        }
      }),
      this.realtimeService.notificationCreated$.subscribe((notification) => {
        const taskId = this.extractNotificationTaskId(notification);
        if (taskId) {
          this.refreshRealtimeTask(taskId);
        }
      }),
    );
  }

  private joinSelectedProject(): void {
    if (!this.selectedProjectId) {
      return;
    }

    this.realtimeService.joinProject(this.selectedProjectId);
  }

  private joinProjectRooms(): void {
    if (this.selectedProjectId) {
      this.joinSelectedProject();
      return;
    }

    this.projects.forEach((project) => this.realtimeService.joinProject(project.id));
  }

  private applyRealtimeTask(task: TaskRecord): void {
    if (!this.isTaskInSelectedProject(task)) {
      if (task.id) {
        this.onTaskDeleted(task.id);
      }
      return;
    }

    const existingTask = this.allTasks.find((item) => String(item.id) === String(task.id));
    this.upsertTaskRecord({
      ...existingTask,
      ...task,
    });
    this.populateBoard(this.allTasks);
    this.populateUpcomingTodos();
  }

  private applyRealtimeTodo(todo: TaskTodoRecord): void {
    if (!todo.id) {
      return;
    }

    const existingTodo = this.allTaskTodos.find((item) => String(item.id) === String(todo.id));
    const updatedTodo = {
      ...existingTodo,
      ...todo,
    };

    this.allTaskTodos = [
      updatedTodo,
      ...this.allTaskTodos.filter((item) => String(item.id) !== String(todo.id)),
    ];
    this.allTasks = this.allTasks.map((task) => this.updateTaskEmbeddedTodo(task, updatedTodo));
    this.populateBoard(this.allTasks);
    this.populateUpcomingTodos();
  }

  private refreshRealtimeTask(taskId: number | string): void {
    const normalizedTaskId = String(taskId);
    if (this.pendingRealtimeTaskFetches.has(normalizedTaskId)) {
      return;
    }

    this.pendingRealtimeTaskFetches.add(normalizedTaskId);
    this.taskService
      .getTask(taskId)
      .pipe(finalize(() => this.pendingRealtimeTaskFetches.delete(normalizedTaskId)))
      .subscribe({
        next: (task) => this.applyRealtimeTask(task),
        error: () => {
          this.onTaskDeleted(taskId);
        },
      });
  }

  private upsertTaskRecord(task: TaskRecord): void {
    if (!task.id) {
      return;
    }

    this.allTasks = [task, ...this.allTasks.filter((item) => String(item.id) !== String(task.id))];
  }

  private updateTaskEmbeddedTodo(task: TaskRecord, todo: TaskTodoRecord): TaskRecord {
    if (String(task.id) !== String(todo.task_id)) {
      return task;
    }

    return {
      ...task,
      task_todos: this.upsertTodoCollection(task.task_todos, todo),
      taskTodos: this.upsertTodoCollection(task.taskTodos, todo),
      todos: this.upsertTodoCollection(task.todos, todo),
    };
  }

  private upsertTodoCollection(
    todos: TaskTodoRecord[] | undefined,
    todo: TaskTodoRecord,
  ): TaskTodoRecord[] | undefined {
    if (!todos?.length) {
      return todos;
    }

    return [todo, ...todos.filter((item) => String(item.id) !== String(todo.id))];
  }

  private isTaskInSelectedProject(task: TaskRecord): boolean {
    if (!this.selectedProjectId) {
      return true;
    }

    return String(task.project_id) === this.selectedProjectId;
  }

  private extractTask(payload: RealtimeTaskPayload): TaskRecord | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate =
      'task' in payload
        ? payload.task
        : 'data' in payload
          ? payload.data
          : 'item' in payload
            ? payload.item
            : 'result' in payload
              ? payload.result
              : payload;

    return candidate && typeof candidate === 'object' ? (candidate as TaskRecord) : null;
  }

  private extractTaskId(payload: RealtimeTaskPayload): number | string | null {
    const task = this.extractTask(payload);
    return task?.id ?? ('task_id' in payload ? payload.task_id : null) ?? null;
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

  private extractNotificationTaskId(notification: {
    task_id?: number | string | null;
    task?: { id?: number | string } | null;
    data?: { task_id?: number | string | null; task?: { id?: number | string } | null };
  }): number | string | null {
    return (
      notification.task_id ??
      notification.task?.id ??
      notification.data?.task_id ??
      notification.data?.task?.id ??
      null
    );
  }

  private populateBoard(tasks: TaskRecord[]): void {
    this.clearBoard();

    this.filterRecordsBySelectedUser(tasks)
      .slice()
      .sort((first, second) => Number(first.order_index ?? 0) - Number(second.order_index ?? 0))
      .forEach((task) => {
        const status = this.getTaskBoardStatus(task);
        const column = this.columns.find((item) => item.status === status) || this.columns[0];
        column.cards.push(this.mapTaskToCard(task));
      });

    this.updateColumnCounts();
  }

  private clearBoard(): void {
    this.columns.forEach((column) => {
      column.cards = [];
    });
    this.updateColumnCounts();
  }

  private mapTaskToCard(task: TaskRecord): TaskCard {
    const status = this.getTaskBoardStatus(task);
    const todos = this.getTaskTodos(task);
    const completedTodos = todos.filter((todo) => this.isTodoCompleted(todo)).length;
    const progress = this.normalizeProgress(task.progress);

    return {
      id: task.id,
      title: task.title || task.task_title || task.name || `Task #${task.id ?? '-'}`,
      date: this.formatTaskDate(task.due_date),
      subtask: `${completedTodos}/${todos.length}`,
      progress,
      members: this.getTaskMembers(task),
      labels: this.getTaskLabels(task),
      project: this.getTaskProject(task),
      task,
    };
  }

  private updateMovedTask(
    card: TaskCard | undefined,
    targetColumn: TaskColumn,
    orderIndex: number,
  ): void {
    if (!card?.id) {
      return;
    }

    if (!this.canEditTask(card.task)) {
      this.taskErrorMessage = 'You can only update assigned tasks.';
      this.loadTasks();
      return;
    }

    const previousTask = { ...card.task };
    const movedAt = new Date().toISOString();
    const payload: UpdateTaskRequest = {
      status: targetColumn.status,
      board_column: targetColumn.status,
      order_index: orderIndex,
      moved_at: movedAt,
      ...(targetColumn.status === 'completed' ? { completed_at: movedAt } : {}),
    };

    card.task = {
      ...card.task,
      ...payload,
    };
    card.progress =
      targetColumn.status === 'completed' ? 100 : this.normalizeProgress(card.task.progress);

    this.taskService.updateTask(card.id, payload).subscribe({
      next: (updatedTask) => {
        card.task = {
          ...card.task,
          ...updatedTask,
        };
        card.progress =
          this.getTaskBoardStatus(card.task) === 'completed'
            ? 100
            : this.normalizeProgress(card.task.progress);
        this.toastService.success(updatedTask);
      },
      error: (error) => {
        card.task = previousTask;
        card.progress =
          this.getTaskBoardStatus(previousTask) === 'completed'
            ? 100
            : this.normalizeProgress(previousTask.progress);
        this.taskErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
        this.loadTasks();
      },
    });
  }

  private loadTaskDetail(taskId: number | string | undefined): void {
    if (!taskId) {
      return;
    }

    this.isLoadingTaskDetail = true;
    this.taskService.getTask(taskId).subscribe({
      next: (task) => {
        this.selectedTaskDialogTask = {
          ...task,
          labels: this.getTaskLabels(task),
        };
        this.selectedTaskDialogStatus = this.getTaskBoardStatus(task);
        this.selectedTaskDialogOrderIndex = Number(task.order_index ?? 0);
        this.isLoadingTaskDetail = false;
      },
      error: (error) => {
        this.taskErrorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
        this.isLoadingTaskDetail = false;
      },
    });
  }

  private openNotificationTask(taskId: number | string, taskTodoId: number | string | null): void {
    this.activeView = 'board';
    this.selectedTaskTodoId = taskTodoId;
    this.isTaskDialogOpen = true;
    this.loadTaskDetail(taskId);
  }

  private getColumnByDropListId(dropListId: string): TaskColumn | undefined {
    const columnIndex = this.columns.findIndex(
      (_, index) => this.getBoardDropListId(index) === dropListId,
    );
    return columnIndex >= 0 ? this.columns[columnIndex] : undefined;
  }

  private getTaskBoardStatus(task: TaskRecord): TaskStatus {
    return this.normalizeTaskStatus(task.board_column || task.status);
  }

  private normalizeTaskStatus(status: string | undefined): TaskStatus {
    const normalized = (status ?? '').toLowerCase().trim() as TaskStatus;
    return this.validStatuses.has(normalized) ? normalized : 'draft';
  }

  private getTaskMembers(task: TaskRecord): TaskCardMember[] {
    const taskUsers = getTaskUsers(task);
    if (taskUsers.length) {
      return taskUsers.map((user) => this.mapUserToTaskMember(user));
    }

    const assigneeIds = getTaskUserIds(task);
    if (assigneeIds.length) {
      return assigneeIds.map((id) => this.createFallbackTaskMember(id));
    }

    return [this.createFallbackTaskMember(task.user_id)];
  }

  private mapUserToTaskMember(user: UserOption): TaskCardMember {
    const name = user.name || user.username || user.email || `User #${user.id}`;

    return {
      id: user.id,
      name,
      photo: this.getUserPhoto(user),
      initial: this.getInitial(name),
    };
  }

  private createFallbackTaskMember(value: number | string | undefined): TaskCardMember {
    const matchedUser = this.users.find((user) => String(user.id) === String(value));
    if (matchedUser) {
      return this.mapUserToTaskMember(matchedUser);
    }

    const label = `User #${value ?? '-'}`;

    return {
      id: value ?? label,
      name: label,
      photo: '',
      initial: this.getInitial(value),
    };
  }

  private getInitial(value: number | string | undefined): string {
    return (
      String(value ?? '?')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?'
    );
  }

  getUserPhoto(user: UserOption | undefined): string {
    return getFirstMediaUrl(user) || '';
  }

  private getTaskTodos(task: TaskRecord): TaskTodoRecord[] {
    const embeddedTodos = task.task_todos || task.taskTodos || task.todos;
    if (embeddedTodos?.length) {
      return embeddedTodos;
    }

    const taskId = Number(task.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return [];
    }

    return this.allTaskTodos.filter((todo) => Number(todo.task_id) === taskId);
  }

  private getTaskLabels(task: TaskRecord): TaskLabelOption[] {
    const embeddedLabels = task.task_labels || task.taskLabels || task.labels;
    if (embeddedLabels?.length) {
      return embeddedLabels;
    }

    const labelIds = this.parseIdList(task.label_ids);
    if (!labelIds.length) {
      return [];
    }

    const selectedIds = new Set(labelIds);
    return this.taskLabels.filter((label) => selectedIds.has(Number(label.id)));
  }

  private getTaskProject(task: TaskRecord): ProjectOption | undefined {
    if (task.project) {
      return task.project;
    }

    const projectId = Number(task.project_id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return undefined;
    }

    return (
      this.projects.find((project) => Number(project.id) === projectId) || {
        id: projectId,
        label: `Project #${projectId}`,
      }
    );
  }

  private getTaskProjectName(task: TaskRecord): string {
    const project = this.getTaskProject(task);
    return project ? this.getProjectName(project) : '-';
  }

  private getTodoAssignees(todo: TaskTodoRecord): UserOption[] {
    const users = todo.users?.length ? todo.users : todo.user ? [todo.user] : [];
    const userById = new Map<number, UserOption>();

    users.forEach((user) => {
      const id = Number(user.id);
      if (Number.isInteger(id) && id > 0) {
        userById.set(id, user);
      }
    });

    const ids = [
      ...this.parseIdList(todo.user_ids),
      Number(todo.user_id),
      Number(todo.created_by),
    ].filter((id) => Number.isInteger(id) && id > 0);

    ids.forEach((id) => {
      if (userById.has(id)) {
        return;
      }

      userById.set(
        id,
        this.users.find((user) => Number(user.id) === id) || {
          id,
          username: `User #${id}`,
          email: '',
        },
      );
    });

    return Array.from(userById.values());
  }

  private parseIdList(value: Array<number | string> | string | undefined): number[] {
    return parseTaskIdList(value);
  }

  private isTodoCompleted(todo: TaskTodoRecord): boolean {
    return (
      todo.status === 'completed' ||
      todo.status === 'completed_but_overdue' ||
      Number(todo.progress || 0) >= 100
    );
  }

  private formatTaskDate(dateValue?: string): string {
    if (!dateValue) {
      return '-';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private formatTime(dateValue?: string): string {
    const date = this.parseDate(dateValue);
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private normalizeProgress(value: number | string | undefined): number {
    const progress = Number(value ?? 0);
    if (!Number.isFinite(progress)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  private populateUpcomingTodos(): void {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    this.upcomingTasks = this.allTaskTodos
      .filter((todo) => !this.isTodoCompleted(todo))
      .map((todo) => this.mapTodoToUpcoming(todo))
      .filter((todo): todo is UpcomingTodo => Boolean(todo))
      .filter((todo) => {
        const dueDate = this.parseDate(todo.task.due_date);
        return !dueDate || dueDate.getTime() >= todayStart.getTime();
      })
      .filter((todo) => {
        if (this.isManager) {
          return true;
        }

        const currentUserId = this.getCurrentUserId();
        return Boolean(
          currentUserId &&
            todo.assignees.some((user) => Number(user.id) === Number(currentUserId)),
        );
      })
      .sort((first, second) => {
        const firstDate = this.parseDate(first.task.due_date)?.getTime() ?? 0;
        const secondDate = this.parseDate(second.task.due_date)?.getTime() ?? 0;
        return firstDate - secondDate;
      });

    this.upcomingTodoGroups = this.groupUpcomingTodosByUser(this.upcomingTasks);
  }

  private mapTodoToUpcoming(todo: TaskTodoRecord): UpcomingTodo | null {
    const task = todo.task || this.allTasks.find((item) => Number(item.id) === Number(todo.task_id));
    if (!task) {
      return null;
    }

    return {
      id: todo.id ?? `${task.id}-${todo.label}`,
      title: todo.label || task.title || task.name || `Todo #${todo.id ?? '-'}`,
      date: this.formatTaskDate(task.due_date),
      task,
      todo,
      assignees: this.getTodoAssignees(todo),
      project: this.getTaskProjectName(task),
    };
  }

  private groupUpcomingTodosByUser(todos: UpcomingTodo[]): UpcomingTodoGroup[] {
    const expandedUserIds = new Set(
      this.upcomingTodoGroups.filter((group) => group.expanded).map((group) => Number(group.user.id)),
    );
    const grouped = new Map<number, UpcomingTodoGroup>();

    todos.forEach((todo) => {
      todo.assignees.forEach((user) => {
        const userId = Number(user.id);
        if (!Number.isInteger(userId) || userId <= 0) {
          return;
        }

        const group =
          grouped.get(userId) ||
          ({
            user,
            todos: [],
            expanded: expandedUserIds.has(userId),
          } satisfies UpcomingTodoGroup);

        group.todos.push(todo);
        grouped.set(userId, group);
      });
    });

    return Array.from(grouped.values()).sort((first, second) =>
      this.getUserLabel(first.user, first.user.id).localeCompare(
        this.getUserLabel(second.user, second.user.id),
      ),
    );
  }

  private mapTimelogsToTimeline(records: TimelogRecord[]): TimelogTimelineUser[] {
    const grouped = new Map<number | string, TimelogRecord[]>();

    records
      .filter((record) => this.isTimelogInTodayTimeline(record))
      .forEach((record) => {
        if (!this.parseDate(record.start)) {
          return;
        }

        const userId = record.user?.id ?? record.user_id ?? 'unknown';
        grouped.set(userId, [...(grouped.get(userId) || []), record]);
      });

    return Array.from(grouped.entries())
      .map(([userId, userRecords]) => {
        const firstRecord = userRecords[0];
        const logs = userRecords
          .map((record) => this.mapTimelogToTimelineLog(record))
          .filter((log): log is TimelogTimelineLog => Boolean(log))
          .sort(
            (first, second) => first.startTime - second.startTime || first.endTime - second.endTime,
          );
        const logsWithLanes = this.assignTimelogLanes(logs);

        return {
          id: userId,
          name: this.getTimelogUserName(firstRecord),
          photo: this.getTimelogUserPhoto(firstRecord),
          logs: logsWithLanes,
          lanes: Math.max(1, ...logsWithLanes.map((log) => log.lane + 1)),
        };
      })
      .filter((user) => user.logs.length)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  private mapTimelogToTimelineLog(record: TimelogRecord): TimelogTimelineLog | null {
    const startDate = this.parseDate(record.start);

    if (!startDate) {
      return null;
    }

    const loggedMinutes = Number(record.minuted_logged);
    const durationEnd =
      !record.end && Number.isFinite(loggedMinutes) && loggedMinutes > 0
        ? new Date(startDate.getTime() + loggedMinutes * 60000)
        : null;
    const fallbackEnd = record.end || durationEnd ? undefined : new Date();
    const endDate = this.parseDate(record.end) || durationEnd || fallbackEnd || startDate;
    const dayStart = new Date(startDate);
    dayStart.setHours(this.timelineStartHour, 0, 0, 0);
    const dayEnd = new Date(startDate);
    dayEnd.setHours(this.timelineEndHour, 0, 0, 0);
    const totalMs = dayEnd.getTime() - dayStart.getTime();
    if (totalMs <= 0) {
      return null;
    }

    const startTime = Math.max(dayStart.getTime(), Math.min(dayEnd.getTime(), startDate.getTime()));
    const endTime = Math.max(startTime, Math.min(dayEnd.getTime(), endDate.getTime()));
    const width = Math.max(2, ((endTime - startTime) / totalMs) * 100);

    return {
      id: record.id ?? `${record.user_id ?? 'user'}-${record.start}`,
      label:
        record.name ||
        record.task_todo?.label ||
        record.task_todo?.task?.title ||
        record.task_todo?.task?.name ||
        `Timelog #${record.id ?? '-'}`,
      left: ((startTime - dayStart.getTime()) / totalMs) * 100,
      width,
      lane: 0,
      startTime,
      endTime,
      files: this.getTimelogFiles(record),
      record,
    };
  }

  private assignTimelogLanes(logs: TimelogTimelineLog[]): TimelogTimelineLog[] {
    const laneEndTimes: number[] = [];

    return logs.map((log) => {
      const availableLane = laneEndTimes.findIndex((endTime) => endTime <= log.startTime);
      const lane = availableLane >= 0 ? availableLane : laneEndTimes.length;
      laneEndTimes[lane] = log.endTime;

      return {
        ...log,
        lane,
      };
    });
  }

  private mapTimelogsToRecapRows(records: TimelogRecord[]): RecapRow[] {
    return records
      .filter((record) => this.isTimelogInTodayTimeline(record))
      .map((record) => {
        const taskTodo = record.task_todo;
        const task =
          (taskTodo?.task as TaskRecord | undefined) ||
          this.allTasks.find((item) => Number(item.id) === Number(taskTodo?.task_id));
        const minutes = Number(record.minuted_logged);

        return {
          assignee: this.getTimelogUserName(record),
          photo: this.getTimelogUserPhoto(record),
          todo: taskTodo?.label || record.name || `Timelog #${record.id ?? '-'}`,
          status: this.getTimelogStatusLabel(record),
          created: record.created_at ? 1 : 0,
          completed: record.status === 'finish' ? 1 : 0,
          project: task ? this.getTaskProjectName(task) : '-',
          timeSpend: this.isActiveTimelogRecord(record)
            ? this.formatElapsed(record.start)
            : this.formatMinutes(
                Number.isFinite(minutes)
                  ? Math.round(minutes)
                  : this.calculateMinuteDiff(record.start, record.end),
              ),
        };
      });
  }

  private startRecapTimer(): void {
    this.recapTimerId = setInterval(() => {
      this.timelineClockTick = Date.now();
      if (this.activeView !== 'recap' || !this.latestTimelogs.length) {
        return;
      }

      this.recapRows = this.mapTimelogsToRecapRows(
        this.filterRecordsBySelectedUser(this.latestTimelogs),
      );
    }, 1000);
  }

  private isTimelogToday(record: TimelogRecord): boolean {
    return this.isSameDate(this.parseDate(record.start || record.created_at), new Date());
  }

  private isTimelogInTodayTimeline(record: TimelogRecord): boolean {
    const startDate = this.parseDate(record.start || record.created_at);
    if (!this.isSameDate(startDate, new Date()) || !startDate) {
      return false;
    }

    const dayStart = new Date(startDate);
    dayStart.setHours(this.timelineStartHour, 0, 0, 0);
    const dayEnd = new Date(startDate);
    dayEnd.setHours(this.timelineEndHour, 0, 0, 0);

    return startDate.getTime() >= dayStart.getTime() && startDate.getTime() < dayEnd.getTime();
  }

  private getTimelogStatusLabel(record: TimelogRecord): string {
    const status = (record.status || '').toLowerCase();
    if (status === 'finish') {
      return 'Finish';
    }

    if (status === 'pause') {
      return 'Pause';
    }

    return status === 'active' || !record.end ? 'Active' : 'Completed';
  }

  private getTimelogFiles(record: TimelogRecord): TimelogFileRecord[] {
    if (Array.isArray(record.files)) {
      return record.files;
    }

    if (Array.isArray(record.timelog_file)) {
      return record.timelog_file;
    }

    return [];
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private isActiveTimelogRecord(record: TimelogRecord): boolean {
    return (record.status || '').toLowerCase().trim() === 'active' || !record.end;
  }

  private formatElapsed(start?: string): string {
    this.timelineClockTick;
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

  private formatMinutes(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return '0 min';
    }

    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  private getTimelogUserName(record: TimelogRecord): string {
    return record.user?.name || record.user?.username || `User #${record.user_id ?? '-'}`;
  }

  private getTimelogUserPhoto(record: TimelogRecord): string {
    const user = record.user as
      | {
          photo_url?: string;
          photo?: string;
          avatar?: string;
          image?: string;
        }
      | undefined;
    return getFirstMediaUrl(user) || 'images/home-user.png';
  }

  private parseDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isSameDate(first: Date | null, second: Date): boolean {
    return Boolean(
      first &&
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate(),
    );
  }

  private getCurrentUserId(): number | undefined {
    const id = Number(this.authService.getUser()?.id);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  }

  private getTaskFilterUserId(): number | string | undefined {
    if (this.isManager) {
      return this.selectedUserId || undefined;
    }

    if (this.isMyTaskMode) {
      return this.getCurrentUserId();
    }

    return undefined;
  }

  private loadUsers(): void {
    if (!this.isManager) {
      return;
    }

    this.taskService.getUsers().subscribe({
      next: (users) => {
        this.users = users
          .map((user) => ({
            ...user,
            id: Number(user.id),
            username: user.username || user.name || user.email || `User #${user.id}`,
          }))
          .filter((user) => Number.isInteger(user.id) && user.id > 0);

        if (this.allTasks.length) {
          this.populateBoard(this.allTasks);
          this.populateUpcomingTodos();
        }
      },
      error: () => {
        this.users = [];
      },
    });
  }

  private loadProjects(): void {
    this.isLoadingProjects = true;

    this.taskService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects.map((project) => ({
          ...project,
          label: project.label || project.name || `Project #${project.id}`,
        }));

        if (this.selectedProjectId) {
          this.selectedProject =
            this.projects.find((project) => String(project.id) === this.selectedProjectId) ||
            this.selectedProject;
        }

        this.joinProjectRooms();

        if (this.allTasks.length) {
          this.populateBoard(this.allTasks);
          this.populateUpcomingTodos();
        }

        this.isLoadingProjects = false;
      },
      error: () => {
        this.projects = [];
        this.isLoadingProjects = false;
      },
    });
  }

  private filterRecordsBySelectedUser<
    T extends {
      user_id?: number | string;
      user?: { id?: number | string } | Array<{ id?: number | string }> | null;
      users?: Array<{ id?: number | string }>;
      assignee_user_ids?: Array<number | string> | string;
      assignee_users?: Array<{ id?: number | string }>;
    },
  >(records: T[]): T[] {
    const selectedUserId = this.getTaskFilterUserId();
    if (!selectedUserId) {
      return records;
    }

    return records.filter((record) => this.getRecordUserIds(record).has(Number(selectedUserId)));
  }

  private getRecordUserIds(record: {
    user_id?: number | string;
    user?: { id?: number | string } | Array<{ id?: number | string }> | null;
    users?: Array<{ id?: number | string }>;
    assignee_user_ids?: Array<number | string> | string;
    assignee_users?: Array<{ id?: number | string }>;
  }): Set<number> {
    const userIds = new Set<number>();
    const addUserId = (value: number | string | undefined) => {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) {
        userIds.add(id);
      }
    };

    addUserId(record.user_id);

    const users = Array.isArray(record.user) ? record.user : record.user ? [record.user] : [];
    users.forEach((user) => addUserId(user?.id));
    (record.users || []).forEach((user) => addUserId(user?.id));
    (record.assignee_users || []).forEach((user) => addUserId(user?.id));
    this.parseIdList(record.assignee_user_ids).forEach((id) => userIds.add(id));

    return userIds;
  }

  private getTaskRelatedUserIds(task: TaskRecord): Set<number> {
    const relatedUserIds = new Set<number>();
    const ownerId = Number(task.user_id);
    if (Number.isInteger(ownerId) && ownerId > 0) {
      relatedUserIds.add(ownerId);
    }

    getTaskUserIds(task).forEach((id) => relatedUserIds.add(id));
    getTaskUsers(task).forEach((user) => {
      const userId = Number(user?.id);
      if (Number.isInteger(userId) && userId > 0) {
        relatedUserIds.add(userId);
      }
    });

    return relatedUserIds;
  }
}
