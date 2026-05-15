import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { RolePermissionService } from '../../../../core/auth/role-permission.service';
import { ConfirmationModalComponent } from '../../../../shared/components/confirmation-modal/confirmation-modal.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { MemberRecord, MemberService } from '../../../members/service/member.service';
import { ManagerNoteRecord, ManagerNoteService } from '../../service/manager-note.service';

const MANAGER_NOTE_RECIPIENT_ROLES = ['member', 'admin'];

@Component({
  selector: 'app-manager-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmationModalComponent],
  templateUrl: './manager-notes.component.html',
})
export class ManagerNotesComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly managerNoteService = inject(ManagerNoteService);
  private readonly memberService = inject(MemberService);
  private readonly toastService = inject(ToastService);

  readonly notes = signal<ManagerNoteRecord[]>([]);
  readonly users = signal<MemberRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | string | null>(null);
  readonly showForm = signal(false);
  readonly errorMessage = signal('');
  readonly editingNote = signal<ManagerNoteRecord | null>(null);
  readonly notePendingDelete = signal<ManagerNoteRecord | null>(null);
  readonly canManageNotes = this.permission.canManageManagerNotes();

  formTitle = '';
  formDetail = '';
  selectedUserIds: Record<string, boolean> = {};

  ngOnInit(): void {
    this.loadNotes();
    this.loadUsers();
  }

  openForm(): void {
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDetail = '';
    this.selectedUserIds = {};
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  openEditForm(note: ManagerNoteRecord): void {
    const userId = note.user_id ?? note.user?.id;

    this.editingNote.set(note);
    this.formTitle = note.title ?? '';
    this.formDetail = note.description ?? note.message ?? '';
    this.selectedUserIds = userId ? { [userId]: true } : {};
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDetail = '';
    this.selectedUserIds = {};
  }

  saveNote(): void {
    const title = this.formTitle.trim();
    const detail = this.formDetail.trim();
    const userIds = Object.entries(this.selectedUserIds)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const editingNote = this.editingNote();

    if (!title || !userIds.length) {
      this.errorMessage.set('Lengkapi title dan minimal satu user.');
      return;
    }

    if (editingNote && userIds.length !== 1) {
      this.errorMessage.set('Pilih satu user untuk edit manager note.');
      return;
    }

    if (title.length > 150) {
      this.errorMessage.set('Title maksimal 150 karakter.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    if (editingNote?.id) {
      this.managerNoteService
        .updateManagerNote(editingNote.id, {
          user_id: userIds[0],
          title,
          description: detail,
        })
        .subscribe({
          next: (updatedNote) => {
            this.notes.update((notes) =>
              notes.map((note) =>
                note.id === editingNote.id
                  ? updatedNote
                    ? { ...note, ...updatedNote }
                    : { ...note, user_id: userIds[0], title, description: detail }
                  : note,
              ),
            );
            this.finishSaving(updatedNote);
          },
          error: (error) => {
            const message = this.toastService.getErrorMessage(error, '');
            this.errorMessage.set(message);
            this.toastService.errorFrom(error);
            this.saving.set(false);
          },
        });
      return;
    }

    const requests = userIds.map((userId) =>
      this.managerNoteService.createManagerNote({
        user_id: userId,
        title,
        ...(detail ? { description: detail } : {}),
      }),
    );

    forkJoin(requests).subscribe({
      next: (responses) => {
        this.finishSaving(responses[responses.length - 1]);
        this.loadNotes();
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.toastService.errorFrom(error);
        this.saving.set(false);
      },
    });
  }

  deleteNote(note: ManagerNoteRecord): void {
    if (!note.id || !this.canManageNotes || this.deletingId()) {
      return;
    }

    this.notePendingDelete.set(note);
  }

  closeDeleteDialog(): void {
    if (this.deletingId()) {
      return;
    }

    this.notePendingDelete.set(null);
  }

  confirmDeleteNote(): void {
    const note = this.notePendingDelete();
    if (!note?.id || !this.canManageNotes) {
      return;
    }

    this.deletingId.set(note.id);
    this.errorMessage.set('');

    this.managerNoteService.deleteManagerNote(note.id).subscribe({
      next: (response) => {
        this.notes.update((notes) => notes.filter((item) => item.id !== note.id));
        this.deletingId.set(null);
        this.notePendingDelete.set(null);
        this.toastService.success(response);
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.toastService.errorFrom(error);
        this.deletingId.set(null);
      },
    });
  }

  getNoteDetail(note: ManagerNoteRecord): string {
    return note.description || note.message || '-';
  }

  getNoteUsername(note: ManagerNoteRecord): string {
    return (
      note.user?.username ||
      this.users().find((user) => Number(user.id) === Number(note.user_id))?.username ||
      '-'
    );
  }

  getNoteTime(note: ManagerNoteRecord): string {
    if (!note.created_at) {
      return '-';
    }

    const date = new Date(note.created_at);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID');
  }

  trackNote(index: number, note: ManagerNoteRecord): number | string {
    return note.id ?? `${note.title}-${index}`;
  }

  trackUser(index: number, user: MemberRecord): number | string {
    return user.id ?? index;
  }

  private loadNotes(): void {
    const currentUserId = this.authService.getUser()?.id;
    this.loading.set(true);

    this.managerNoteService.getManagerNotes().subscribe({
      next: (notes) => {
        this.notes.set(
          this.canManageNotes
            ? notes
            : notes.filter((note) => Number(note.user_id) === Number(currentUserId)),
        );
        this.loading.set(false);
      },
      error: () => {
        this.notes.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadUsers(): void {
    if (!this.canManageNotes) {
      return;
    }

    this.memberService.getUsers().subscribe({
      next: (users) =>
        this.users.set(
          users.filter((user) =>
            MANAGER_NOTE_RECIPIENT_ROLES.includes((user.role ?? '').toLowerCase()),
          ),
        ),
      error: () => this.users.set([]),
    });
  }

  private finishSaving(response: unknown): void {
    this.saving.set(false);
    this.toastService.success(response);
    this.closeForm();
  }
}
