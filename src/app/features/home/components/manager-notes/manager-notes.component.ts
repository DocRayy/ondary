import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Subscription } from 'rxjs';
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
export class ManagerNotesComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  private readonly managerNoteService = inject(ManagerNoteService);
  private readonly memberService = inject(MemberService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private managerNoteRouteSubscription: Subscription | null = null;

  readonly notes = signal<ManagerNoteRecord[]>([]);
  readonly users = signal<MemberRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | string | null>(null);
  readonly showForm = signal(false);
  readonly errorMessage = signal('');
  readonly editingNote = signal<ManagerNoteRecord | null>(null);
  readonly notePendingDelete = signal<ManagerNoteRecord | null>(null);
  readonly highlightedNoteId = signal<string | null>(null);
  readonly canManageNotes = this.permission.canManageManagerNotes();

  formTitle = '';
  formDetail = '';
  selectedUsers: MemberRecord[] = [];
  userSearch = '';
  sendToAllUsers = false;
  isUserPickerOpen = false;

  ngOnInit(): void {
    this.managerNoteRouteSubscription = this.route.queryParamMap.subscribe((params) => {
      const managerNoteId = params.get('manager_note_id');
      this.highlightedNoteId.set(managerNoteId);
      this.scrollHighlightedNoteIntoView(managerNoteId);
    });
    this.loadNotes();
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.managerNoteRouteSubscription?.unsubscribe();
  }

  openForm(): void {
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDetail = '';
    this.selectedUsers = [];
    this.userSearch = '';
    this.sendToAllUsers = false;
    this.isUserPickerOpen = false;
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  openEditForm(note: ManagerNoteRecord): void {
    const userId = note.user_id ?? note.user?.id;

    this.editingNote.set(note);
    this.formTitle = note.title ?? '';
    this.formDetail = note.description ?? note.message ?? '';
    this.selectedUsers = userId
      ? this.users().filter((user) => String(user.id) === String(userId))
      : [];
    this.userSearch = '';
    this.sendToAllUsers = false;
    this.isUserPickerOpen = false;
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDetail = '';
    this.selectedUsers = [];
    this.userSearch = '';
    this.sendToAllUsers = false;
    this.isUserPickerOpen = false;
  }

  reloadNotes(): void {
    this.loadNotes();
  }

  saveNote(): void {
    const title = this.formTitle.trim();
    const detail = this.formDetail.trim();
    const userIds = this.selectedUsers
      .map((user) => Number(user.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const editingNote = this.editingNote();

    if (!title || (!this.sendToAllUsers && !userIds.length)) {
      this.errorMessage.set('Complete the title and select at least one user.');
      return;
    }

    if (editingNote && (this.sendToAllUsers || userIds.length !== 1)) {
      this.errorMessage.set('Select one user to edit the manager note.');
      return;
    }

    if (title.length > 150) {
      this.errorMessage.set('Title must be a maximum of 150 characters.');
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

    if (this.sendToAllUsers) {
      this.managerNoteService
        .createManagerNote({
          send_to_all: true,
          title,
          ...(detail ? { description: detail } : {}),
        })
        .subscribe({
          next: (response) => {
            this.finishSaving(response);
            this.loadNotes();
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

  getFilteredUsers(): MemberRecord[] {
    const query = this.userSearch.trim().toLowerCase();
    const selectedIds = new Set(this.selectedUsers.map((user) => String(user.id)));

    return this.users()
      .filter((user) => !selectedIds.has(String(user.id)))
      .filter((user) => {
        if (!query) {
          return true;
        }

        return [user.name, user.username, user.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 8);
  }

  selectUser(user: MemberRecord): void {
    if (!user.id || this.sendToAllUsers) {
      return;
    }

    this.selectedUsers = [...this.selectedUsers, user];
    this.userSearch = '';
    this.isUserPickerOpen = false;
  }

  removeSelectedUser(user: MemberRecord): void {
    this.selectedUsers = this.selectedUsers.filter((item) => String(item.id) !== String(user.id));
  }

  onSendToAllUsersChange(): void {
    if (this.sendToAllUsers) {
      this.selectedUsers = [];
      this.userSearch = '';
      this.isUserPickerOpen = false;
    }
  }

  isHighlightedNote(note: ManagerNoteRecord): boolean {
    return Boolean(
      this.highlightedNoteId() && note.id && String(note.id) === String(this.highlightedNoteId()),
    );
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
        this.scrollHighlightedNoteIntoView(this.highlightedNoteId());
      },
      error: () => {
        this.notes.set([]);
        this.errorMessage.set('Failed to load manager notes.');
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

  private scrollHighlightedNoteIntoView(noteId: string | null): void {
    if (!noteId) {
      return;
    }

    window.setTimeout(() => {
      document
        .getElementById(`manager-note-${noteId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}
