import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationModalComponent } from '../../../shared/components/confirmation-modal/confirmation-modal.component';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import {
  TablePaginationComponent,
  TablePaginationMeta,
} from '../../../shared/components/table-pagination/table-pagination.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { normalizeApiId } from '../../../shared/utils/api-id';
import { BackupRecord, BackupRestoreService } from '../service/backup-restore.service';

@Component({
  selector: 'app-backup-restore',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConfirmationModalComponent,
    FcIconComponent,
    TablePaginationComponent,
  ],
  templateUrl: './backup-restore.component.html',
})
export class BackupRestoreComponent implements OnInit {
  private readonly backupRestoreService = inject(BackupRestoreService);
  private readonly toastService = inject(ToastService);

  readonly backups = signal<BackupRecord[]>([]);
  readonly isLoading = signal(false);
  readonly isCreating = signal(false);
  readonly isUploading = signal(false);
  readonly activeId = signal<number | string | null>(null);
  readonly errorMessage = signal('');
  readonly restoreFileName = signal('Select SQL File');
  readonly pendingRestore = signal<BackupRecord | null>(null);
  readonly pendingDelete = signal<BackupRecord | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly meta = signal<TablePaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    page_count: 1,
    limit_options: [10, 25, 50, 100],
  });

  databaseVersion = '';
  restoreFile: File | null = null;

  ngOnInit(): void {
    this.loadBackups();
  }

  loadBackups(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.backupRestoreService
      .getBackups({
        page: this.page(),
        limit: this.limit(),
        search: this.searchTerm(),
      })
      .subscribe({
      next: (response) => {
        this.backups.set(response.items);
        this.meta.set(response.meta);
        this.page.set(response.meta.page);
        this.limit.set(response.meta.limit);
        this.isLoading.set(false);
      },
      error: () => {
        this.backups.set([]);
        this.meta.set({
          total: 0,
          page: this.page(),
          limit: this.limit(),
          page_count: 1,
          limit_options: [10, 25, 50, 100],
        });
        this.errorMessage.set('Failed to load backups.');
        this.isLoading.set(false);
      },
    });
  }

  searchBackups(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
    this.loadBackups();
  }

  selectPage(page: number): void {
    this.page.set(page);
    this.loadBackups();
  }

  selectLimit(limit: number): void {
    this.limit.set(limit);
    this.page.set(1);
    this.loadBackups();
  }

  createBackup(): void {
    if (this.isCreating()) {
      return;
    }

    this.isCreating.set(true);
    this.errorMessage.set('');

    this.backupRestoreService.createBackup().subscribe({
      next: (response) => {
        this.toastService.success(response);
        this.isCreating.set(false);
        this.loadBackups();
      },
      error: (error) => {
        this.toastService.errorFrom(error);
        this.isCreating.set(false);
      },
    });
  }

  downloadBackup(backup: BackupRecord): void {
    const backupId = this.getBackupId(backup);
    if (backupId === null) {
      this.toastService.error({ message: 'Backup ID is missing.' });
      return;
    }

    this.activeId.set(backupId);
    this.backupRestoreService.downloadBackup(backupId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.getBackupName(backup);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.activeId.set(null);
      },
      error: (error) => {
        this.toastService.errorFrom(error);
        this.activeId.set(null);
      },
    });
  }

  requestRestore(backup: BackupRecord): void {
    this.pendingRestore.set(backup);
  }

  closeRestoreDialog(): void {
    if (this.activeId()) {
      return;
    }

    this.pendingRestore.set(null);
  }

  confirmRestore(): void {
    const backup = this.pendingRestore();
    const backupId = backup ? this.getBackupId(backup) : null;
    if (backupId === null) {
      this.toastService.error({ message: 'Backup ID is missing.' });
      return;
    }

    this.activeId.set(backupId);
    this.backupRestoreService.restoreBackup(backupId).subscribe({
      next: (response) => {
        this.toastService.success(response);
        this.activeId.set(null);
        this.pendingRestore.set(null);
        this.loadBackups();
      },
      error: (error) => {
        this.toastService.errorFrom(error);
        this.activeId.set(null);
      },
    });
  }

  requestDelete(backup: BackupRecord): void {
    this.pendingDelete.set(backup);
  }

  closeDeleteDialog(): void {
    if (this.activeId()) {
      return;
    }

    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const backup = this.pendingDelete();
    const backupId = backup ? this.getBackupId(backup) : null;
    if (backupId === null) {
      this.toastService.error({ message: 'Backup ID is missing.' });
      return;
    }

    this.activeId.set(backupId);
    this.backupRestoreService.deleteBackup(backupId).subscribe({
      next: (response) => {
        this.toastService.success(response);
        this.activeId.set(null);
        this.pendingDelete.set(null);
        this.refetchAfterDelete();
      },
      error: (error) => {
        this.toastService.errorFrom(error);
        this.activeId.set(null);
      },
    });
  }

  onRestoreFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.restoreFile = null;
      this.restoreFileName.set('Select SQL File');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.sql')) {
      input.value = '';
      this.restoreFile = null;
      this.restoreFileName.set('Select SQL File');
      this.errorMessage.set('Restore manual only supports .sql files.');
      return;
    }

    this.restoreFile = file;
    this.restoreFileName.set(file.name);
    this.errorMessage.set('');
  }

  uploadRestore(): void {
    if (!this.restoreFile || this.isUploading()) {
      this.errorMessage.set('Select SQL file before uploading restore.');
      return;
    }

    this.isUploading.set(true);
    this.errorMessage.set('');

    this.backupRestoreService.uploadRestore(this.restoreFile, this.databaseVersion).subscribe({
      next: (response) => {
        this.toastService.success(response);
        this.restoreFile = null;
        this.restoreFileName.set('Select SQL File');
        this.databaseVersion = '';
        this.isUploading.set(false);
        this.loadBackups();
      },
      error: (error) => {
        this.toastService.errorFrom(error);
        this.isUploading.set(false);
      },
    });
  }

  trackBackup = (index: number, backup: BackupRecord): string => {
    return String(this.getBackupId(backup) ?? `${this.getBackupName(backup)}-${index}`);
  };

  getBackupName(backup: BackupRecord): string {
    return backup.backup_name || backup.name || backup.filename || `backup-${backup.id ?? 'file'}.sql`;
  }

  getVersion(backup: BackupRecord): string {
    return backup.database_version || backup.version || '-';
  }

  getTimestamp(backup: BackupRecord): string {
    return this.formatDate(backup.timestamp || backup.created_at);
  }

  getStatus(backup: BackupRecord): string {
    return String(backup.status || 'ok').toUpperCase();
  }

  getStatusClass(backup: BackupRecord): string {
    const status = String(backup.status || 'ok').toLowerCase();
    return status === 'ok' || status === 'success'
      ? 'bg-success-600 text-white'
      : 'bg-error-600 text-white';
  }

  formatSize(value: string | number | undefined): string {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    const bytes = Number(value ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '-';
    }

    if (bytes >= 1024 * 1024) {
      return `${Math.round(bytes / 1024 / 1024)} MB`;
    }

    return `${Math.round(bytes / 1024)} KB`;
  }

  private refetchAfterDelete(): void {
    if (this.backups().length <= 1 && this.page() > 1) {
      this.page.update((page) => page - 1);
    }

    this.loadBackups();
  }

  private getBackupId(backup: BackupRecord): number | null {
    return normalizeApiId(backup.id ?? backup.backup_id ?? backup.backupId ?? backup._id);
  }

  private formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
