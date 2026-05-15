import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FcIconComponent } from '@shared/components/fc-icon/fc-icon.component';
import { TaskDialogComponent } from '../../components/task-dialog/task-dialog.component';
import {
  TASK_STATUSES,
  TaskLabelOption,
  TaskRecord,
  TaskStatus,
  TaskTodoRecord,
  UpdateTaskRequest,
} from '../../schema/task.schema';
import { TaskService } from '../../service/task.service';
import { TimelogRecord } from '../../../timelog/schema/timelog.schema';
import { TimelogService } from '../../../timelog/service/timelog.service';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { RolePermissionService } from '../../../../core/auth/role-permission.service';
import { UserOption } from '../../schema/task.schema';
import { ToastService } from '../../../../shared/components/toast/toast.service';

type ViewType = 'board' | 'timelog' | 'calendar' | 'recap';

interface TaskCard {
  id?: number | string;
  title: string;
  date: string;
  subtask: string;
  progress: number;
  members: string[];
  labels: TaskLabelOption[];
  task: TaskRecord;
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
  photoUrl: string;
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
}

interface TimelogTimelineLog {
  id: number | string;
  label: string;
  left: number;
  width: number;
  lane: number;
  startTime: number;
  endTime: number;
}

interface TimelogTimelineUser {
  id: number | string;
  name: string;
  photoUrl: string;
  logs: TimelogTimelineLog[];
  lanes: number;
}

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, FcIconComponent, TaskDialogComponent],
  templateUrl: './task-list.component.html',
})
export class TaskListComponent implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly timelogService = inject(TimelogService);
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly toastService = inject(ToastService);
  private readonly validStatuses = new Set<TaskStatus>(TASK_STATUSES);
  private readonly apiUrl = environment.API_URL;
  private readonly timelineStartHour = 7;
  private readonly timelineEndHour = 24;
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
    '18:00',
    '19:00',
    '20:00',
    '21:00',
    '22:00',
    '23:00',
    '24:00',
  ];
  get timelineSegments(): number {
    return this.timeSlots.length - 1;
  }
  timelogUsers: TimelogTimelineUser[] = [];
  isLoadingTimelogs = false;
  timelogErrorMessage = '';

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
  readonly currentYear = this.today.getFullYear();
  readonly currentMonth = this.today.getMonth();
  readonly currentMonthLabel = this.monthNames[this.currentMonth];
  readonly calendarWeeks = this.createCalendar(this.currentYear, this.currentMonth);
  upcomingTasks: UpcomingTodo[] = [];
  recapRows: RecapRow[] = [];
  isMyTaskMode = this.permission.isMember();
  users: UserOption[] = [];
  selectedUserId = this.permission.isManager() ? '' : String(this.getCurrentUserId() ?? '');
  readonly isManager = this.permission.isManager();
  readonly isMember = this.permission.isMember();

  ngOnInit(): void {
    this.loadUsers();
    this.loadTasks();
    this.loadTimelogs();
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
    if (this.isMember) {
      return;
    }

    const currentUserId = this.getCurrentUserId();
    if (!this.isMyTaskMode && !currentUserId) {
      this.taskErrorMessage = 'Current user is required to load My Task.';
      return;
    }

    this.isMyTaskMode = !this.isMyTaskMode;
    this.loadTasks();
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
  }

  onTaskCreated(task: TaskRecord) {
    const status = this.getTaskBoardStatus(task);
    const targetColumn = this.columns.find((column) => column.status === status) || this.columns[0];
    targetColumn.cards.push(this.mapTaskToCard(task));
    this.updateColumnCounts();
  }

  onTaskUpdated(task: TaskRecord) {
    const updatedStatus = this.getTaskBoardStatus(task);
    const updatedCard = this.mapTaskToCard(task);

    this.columns.forEach((column) => {
      column.cards = column.cards.filter((card) => String(card.id) !== String(task.id));
    });

    const targetColumn =
      this.columns.find((column) => column.status === updatedStatus) || this.columns[0];
    targetColumn.cards.push(updatedCard);
    this.selectedTaskDialogTask = null;
    this.updateColumnCounts();
  }

  onTaskDeleted(taskId: number | string) {
    this.columns.forEach((column) => {
      column.cards = column.cards.filter((card) => String(card.id) !== String(taskId));
    });
    this.allTasks = this.allTasks.filter((task) => String(task.id) !== String(taskId));
    this.upcomingTasks = this.upcomingTasks.filter(
      (todo) => String(todo.task.id) !== String(taskId),
    );
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

  trackMemberByInitial(_: number, member: string): string {
    return member;
  }

  trackTimelogUserById(index: number, user: TimelogTimelineUser): number | string {
    return user.id ?? index;
  }

  trackTimelogById(index: number, log: TimelogTimelineLog): number | string {
    return log.id ?? index;
  }

  trackCalendarTaskById(index: number, task: TaskRecord): number | string {
    return task.id ?? index;
  }

  trackUpcomingTodoById(index: number, todo: UpcomingTodo): number | string {
    return todo.id ?? index;
  }

  trackRecapRowById(index: number, row: RecapRow): string {
    return `${row.assignee}-${row.todo}-${index}`;
  }

  onSelectedUserChange(userId: string): void {
    this.selectedUserId = userId;
    this.isMyTaskMode = Boolean(userId);
    this.loadTasks();
    this.loadTimelogs();
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

  getCalendarDayTasks(day: CalendarDay): TaskRecord[] {
    if (!day.inMonth) {
      return [];
    }

    return this.allTasks.filter((task) => this.isSameDate(this.parseDate(task.due_date), day.date));
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
      tasks: this.taskService.getTasks(this.getTaskFilterUserId()),
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

  private loadTimelogs(): void {
    this.isLoadingTimelogs = true;
    this.timelogErrorMessage = '';

    this.timelogService.getTimelogs().subscribe({
      next: (timelogs) => {
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
      members: this.getTaskMemberInitials(task),
      labels: this.getTaskLabels(task),
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
    const payload: UpdateTaskRequest = {
      status: targetColumn.status,
      board_column: targetColumn.status,
      order_index: orderIndex,
      moved_at: new Date().toISOString(),
    };

    card.task = {
      ...card.task,
      ...payload,
    };
    card.progress = targetColumn.status === 'completed' ? 100 : 0;

    this.taskService.updateTask(card.id, payload).subscribe({
      next: (updatedTask) => {
        card.task = {
          ...card.task,
          ...updatedTask,
        };
        this.toastService.success(updatedTask);
      },
      error: (error) => {
        card.task = previousTask;
        card.progress = this.getTaskBoardStatus(previousTask) === 'completed' ? 100 : 0;
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

  private getTaskMemberInitials(task: TaskRecord): string[] {
    const assigneeUsers = (task.assignee_users || []).filter(Boolean);
    if (assigneeUsers.length) {
      return assigneeUsers.map((user) =>
        this.getUserInitial(user?.name || user?.username || user?.email || user?.id),
      );
    }

    const assigneeIds = this.parseIdList(task.assignee_user_ids);
    if (assigneeIds.length) {
      return assigneeIds.map((id) => this.getUserInitial(id));
    }

    return [this.getUserInitial(task.user?.name || task.user?.username || task.user_id)];
  }

  private getUserInitial(value: number | string | undefined): string {
    return (
      String(value ?? '?')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?'
    );
  }

  private getTaskTodos(task: TaskRecord): TaskTodoRecord[] {
    return task.task_todos || task.taskTodos || task.todos || [];
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

  private parseIdList(value: Array<number | string> | string | undefined): number[] {
    if (Array.isArray(value)) {
      return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
    }

    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? this.parseIdList(parsed) : [];
    } catch {
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0);
    }
  }

  private isTodoCompleted(todo: TaskTodoRecord): boolean {
    return todo.status === 'completed' || Number(todo.progress || 0) >= 100;
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

    this.upcomingTasks = this.filterRecordsBySelectedUser(this.allTaskTodos)
      .map((todo) => {
        const task =
          todo.task || this.allTasks.find((item) => Number(item.id) === Number(todo.task_id));
        const dueDate = this.parseDate(task?.due_date);

        if (!task || !dueDate || dueDate.getTime() < todayStart.getTime()) {
          return null;
        }

        return {
          id: todo.id ?? `${task.id}-${todo.label}`,
          title: todo.label || task.title || task.name || `Todo #${todo.id ?? '-'}`,
          date: this.formatTaskDate(task.due_date),
          task,
        };
      })
      .filter((todo): todo is UpcomingTodo => Boolean(todo))
      .sort((first, second) => {
        const firstDate = this.parseDate(first.task.due_date)?.getTime() ?? 0;
        const secondDate = this.parseDate(second.task.due_date)?.getTime() ?? 0;
        return firstDate - secondDate;
      });
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
          photoUrl: this.getTimelogUserPhoto(firstRecord),
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

    const fallbackEnd = record.end ? undefined : new Date();
    const endDate = this.parseDate(record.end) || fallbackEnd || startDate;
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
      label: record.name || `Timelog #${record.id ?? '-'}`,
      left: ((startTime - dayStart.getTime()) / totalMs) * 100,
      width,
      lane: 0,
      startTime,
      endTime,
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
          taskTodo?.task ||
          this.allTasks.find((item) => Number(item.id) === Number(taskTodo?.task_id));
        const project = taskTodo?.task?.project;
        const minutes = Number(
          record.minuted_logged ?? this.calculateMinuteDiff(record.start, record.end),
        );

        return {
          assignee: this.getTimelogUserName(record),
          photoUrl: this.getTimelogUserPhoto(record),
          todo: taskTodo?.label || record.name || `Timelog #${record.id ?? '-'}`,
          status: this.getTimelogStatusLabel(record),
          created: record.created_at ? 1 : 0,
          completed: record.status === 'finish' ? 1 : 0,
          project:
            project?.label ||
            project?.name ||
            task?.title ||
            task?.name ||
            (taskTodo?.task_id ? `Task #${taskTodo.task_id}` : '-'),
          timeSpend: this.formatMinutes(minutes),
        };
      });
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

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
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
    const photo = user?.photo_url || user?.photo || user?.avatar || user?.image;

    if (!photo) {
      return 'images/home-user.png';
    }

    if (/^https?:\/\//i.test(photo) || photo.startsWith('/')) {
      return photo;
    }

    return `${this.apiUrl}/${photo.replace(/^\/+/, '')}`;
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
    if (this.isMember) {
      return this.getCurrentUserId();
    }

    return this.selectedUserId || undefined;
  }

  private loadUsers(): void {
    if (!this.isManager) {
      return;
    }

    this.taskService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: () => {
        this.users = [];
      },
    });
  }

  private filterRecordsBySelectedUser<
    T extends {
      user_id?: number | string;
      user?: { id?: number | string } | null;
    },
  >(records: T[]): T[] {
    const selectedUserId = this.getTaskFilterUserId();
    if (!selectedUserId) {
      return records;
    }

    return records.filter(
      (record) => Number(record.user_id ?? record.user?.id) === Number(selectedUserId),
    );
  }

  private getTaskRelatedUserIds(task: TaskRecord): Set<number> {
    const relatedUserIds = new Set<number>();
    const ownerId = Number(task.user_id ?? task.user?.id);
    if (Number.isInteger(ownerId) && ownerId > 0) {
      relatedUserIds.add(ownerId);
    }

    this.parseIdList(task.assignee_user_ids).forEach((id) => relatedUserIds.add(id));
    (task.assignee_users || []).forEach((user) => {
      const userId = Number(user?.id);
      if (Number.isInteger(userId) && userId > 0) {
        relatedUserIds.add(userId);
      }
    });

    return relatedUserIds;
  }
}
