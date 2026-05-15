import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService, AuthUser } from '../../../../core/auth/auth.service';
import { FcIconComponent } from '../../../../shared/components/fc-icon/fc-icon.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { getApiMediaUrl } from '../../../../shared/utils/media';
import {
  CreateTimelogRequest,
  TimelogFileRecord,
  TimelogRecord,
  UpdateTimelogRequest,
} from '../../schema/timelog.schema';
import { ActiveTimelogService } from '../../service/active-timelog.service';
import { TimelogService } from '../../service/timelog.service';

interface TimelogItem {
  record: TimelogRecord;
  title: string;
  user: string;
  startTime: string;
  endTime: string;
  duration: string;
  status: string;
  attachments: number;
  files: TimelogFileRecord[];
}

interface ActiveTimelog {
  record: TimelogRecord;
  elapsed: string;
}

@Component({
  selector: 'app-timelog-list',
  standalone: true,
  imports: [CommonModule, FormsModule, FcIconComponent],
  templateUrl: './timelog-list.component.html',
})
export class TimelogListComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly timelogService = inject(TimelogService);
  private readonly activeTimelogService = inject(ActiveTimelogService);
  private readonly toastService = inject(ToastService);
  readonly user = signal<AuthUser | null>(this.authService.getUser());

  timelogs: TimelogItem[] = [];
  activeTimelog: ActiveTimelog | null = null;
  isLoading = false;
  isCreating = false;
  isEnding = false;
  errorMessage = '';
  createForm = {
    name: '',
    start_note: '',
  };

  private elapsedTimerId?: ReturnType<typeof setInterval>;
  private timelogEndedSubscription?: Subscription;

  readonly userPhoto = computed(() => {
    const user = this.user();
    const photo = user?.photo_url || user?.photo || user?.avatar || user?.image;

    return getApiMediaUrl(photo) || 'images/home-user.png';
  });

  ngOnInit(): void {
    this.loadTimelogs();
    this.startElapsedTimer();
    this.timelogEndedSubscription = this.activeTimelogService.timelogEnded$.subscribe(() => {
      this.loadTimelogs();
    });
  }

  ngOnDestroy(): void {
    if (this.elapsedTimerId) {
      clearInterval(this.elapsedTimerId);
    }

    this.timelogEndedSubscription?.unsubscribe();
  }

  createTimelog(): void {
    this.errorMessage = '';

    const currentUser = this.authService.getUser();
    const name = this.createForm.name.trim();

    if (!currentUser?.id) {
      this.errorMessage = 'User is required to create timelog.';
      return;
    }

    if (!name) {
      this.errorMessage = 'Description is required.';
      return;
    }

    const start = new Date().toISOString();
    const payload: CreateTimelogRequest = {
      user_id: Number(currentUser.id),
      name,
      status: 'active',
      start,
      start_note: this.createForm.start_note.trim() || undefined,
    };

    this.isCreating = true;
    this.activeTimelogService.createTimelog(payload).subscribe({
      next: (response) => {
        this.isCreating = false;
        this.resetCreateForm();
        this.loadTimelogs();
        this.toastService.success(response);
      },
      error: (error) => {
        this.isCreating = false;
        this.errorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  endTimelog(): void {
    if (!this.activeTimelog?.record.id) {
      this.activeTimelog = null;
      return;
    }

    const end = new Date().toISOString();
    const start = this.activeTimelog.record.start;
    const minutedLogged = this.calculateMinuteDiff(start, end);
    const payload: UpdateTimelogRequest = {
      end,
      minuted_logged: minutedLogged,
      time: this.formatMinutes(minutedLogged),
    };

    this.isEnding = true;
    this.timelogService.updateTimelog(this.activeTimelog.record.id, payload).subscribe({
      next: (response) => {
        this.isEnding = false;
        this.activeTimelog = null;
        this.loadTimelogs();
        this.toastService.success(response);
      },
      error: (error) => {
        this.isEnding = false;
        this.errorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
      },
    });
  }

  private loadTimelogs(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.timelogService.getTimelogs().subscribe({
      next: (timelogs) => {
        const records = timelogs.sort(
          (first, second) => this.getSortTime(second) - this.getSortTime(first),
        );
        this.timelogs = records.map((record) => this.mapTimelog(record));
        this.syncActiveTimelog(records);
        this.isLoading = false;
      },
      error: () => {
        this.timelogs = [];
        this.errorMessage = 'Failed to load timelogs.';
        this.isLoading = false;
      },
    });
  }

  private syncActiveTimelog(records: TimelogRecord[]): void {
    if (this.activeTimelog) {
      return;
    }

    const currentUserId = this.authService.getUser()?.id;
    const activeRecord = records.find(
      (record) =>
        !record.end && (!currentUserId || Number(record.user_id) === Number(currentUserId)),
    );

    if (!activeRecord) {
      return;
    }

    this.activeTimelog = {
      record: activeRecord,
      elapsed: this.formatElapsed(activeRecord.start),
    };
  }

  private mapTimelog(record: TimelogRecord): TimelogItem {
    const durationMinutes =
      record.minuted_logged ??
      (record.end ? this.calculateMinuteDiff(record.start, record.end) : 0);

    return {
      record,
      title: record.name || `Timelog #${record.id ?? '-'}`,
      user: record.user?.username || record.user?.name || `User #${record.user_id ?? '-'}`,
      startTime: this.formatTime(record.start),
      endTime: record.end ? this.formatTime(record.end) : '-',
      duration: record.end ? this.formatMinutes(durationMinutes) : this.formatElapsed(record.start),
      status: this.getTimelogStatusLabel(record),
      files: this.getTimelogFiles(record),
      attachments: this.getTimelogFiles(record).length,
    };
  }

  getTimelogFilePhoto(file: TimelogFileRecord): string | null {
    return getApiMediaUrl(file.photo);
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

  private getTimelogStatusLabel(record: TimelogRecord): string {
    if (record.status === 'finish') {
      return 'Finished';
    }

    if (record.status === 'pause') {
      return 'Paused';
    }

    return record.end ? 'Completed' : 'Active';
  }

  private startElapsedTimer(): void {
    this.elapsedTimerId = setInterval(() => {
      if (!this.activeTimelog) {
        return;
      }

      this.activeTimelog = {
        ...this.activeTimelog,
        elapsed: this.formatElapsed(this.activeTimelog.record.start),
      };
    }, 1000);
  }

  private calculateMinuteDiff(start?: string, end?: string): number {
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;

    if (
      !startDate ||
      !endDate ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return 0;
    }

    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private formatElapsed(start?: string): string {
    const startDate = start ? new Date(start) : null;

    if (!startDate || Number.isNaN(startDate.getTime())) {
      return '00:00:00';
    }

    const totalSeconds = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((item) => String(item).padStart(2, '0')).join(':');
  }

  private formatMinutes(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  private formatTime(dateValue?: string): string {
    if (!dateValue) {
      return '-';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private getSortTime(record: TimelogRecord): number {
    const source = record.start || record.created_at || record.updated_at;
    const date = source ? new Date(source) : null;
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  }

  private resetCreateForm(): void {
    this.createForm = {
      name: '',
      start_note: '',
    };
  }
}
