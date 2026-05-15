import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@app/core/auth/auth.service';
import { ConfirmationModalComponent } from '../../../../shared/components/confirmation-modal/confirmation-modal.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { StickyNoteRecord } from '../../schema/sticky-note.schema';
import { StickyNoteService } from '../../service/sticky-note.service';

@Component({
  selector: 'app-sticky-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmationModalComponent],
  templateUrl: './sticky-notes.component.html',
})
export class StickyNotesComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly stickyNoteService = inject(StickyNoteService);
  private readonly toastService = inject(ToastService);

  readonly currentUser = signal(this.authService.getUser());
  readonly notes = signal<StickyNoteRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | string | null>(null);
  readonly errorMessage = signal('');
  readonly showForm = signal(false);
  readonly editingNote = signal<StickyNoteRecord | null>(null);
  readonly notePendingDelete = signal<StickyNoteRecord | null>(null);
  readonly noteCount = computed(() => this.notes().length);

  formTitle = '';
  formDescription = '';

  ngOnInit(): void {
    this.loadStickyNotes();
  }

  loadStickyNotes(): void {
    const userId = this.currentUser()?.id;

    if (!userId) {
      this.notes.set([]);
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.stickyNoteService.getStickyNotes().subscribe({
      next: (notes) => {
        this.notes.set(notes.filter((note) => Number(note.user_id) === Number(userId)));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Gagal memuat sticky notes.');
        this.loading.set(false);
      },
    });
  }

  openCreateForm(): void {
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDescription = '';
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  openEditForm(note: StickyNoteRecord): void {
    this.editingNote.set(note);
    this.formTitle = note.title ?? '';
    this.formDescription = note.description ?? '';
    this.showForm.set(true);
    this.errorMessage.set('');
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingNote.set(null);
    this.formTitle = '';
    this.formDescription = '';
  }

  saveNote(): void {
    const userId = this.currentUser()?.id;
    const title = this.formTitle.trim();
    const description = this.formDescription.trim();
    const editingNote = this.editingNote();

    if (!userId || !title || title.length > 150) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    if (editingNote?.id) {
      this.stickyNoteService
        .updateStickyNote(editingNote.id, {
          user_id: Number(userId),
          title,
          description,
        })
        .subscribe({
          next: (updatedNote) => {
            this.notes.update((notes) =>
              notes.map((note) =>
                note.id === editingNote.id
                  ? updatedNote
                    ? { ...note, ...updatedNote }
                    : { ...note, title, description }
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

    this.stickyNoteService
      .createStickyNote({
        user_id: Number(userId),
        title,
        description,
      })
      .subscribe({
        next: (createdNote) => {
          if (createdNote && Number(createdNote.user_id) === Number(userId)) {
            this.notes.update((notes) => [createdNote, ...notes]);
          } else {
            this.loadStickyNotes();
          }

          this.finishSaving(createdNote);
        },
        error: (error) => {
          const message = this.toastService.getErrorMessage(error, '');
          this.errorMessage.set(message);
          this.toastService.errorFrom(error);
          this.saving.set(false);
        },
      });
  }

  deleteNote(note: StickyNoteRecord): void {
    if (!note.id || this.deletingId()) {
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
    if (!note?.id) {
      return;
    }

    this.deletingId.set(note.id);
    this.errorMessage.set('');

    this.stickyNoteService.deleteStickyNote(note.id).subscribe({
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

  trackNote(_index: number, note: StickyNoteRecord): number | string {
    return note.id ?? `${note.title}-${note.description}`;
  }

  private finishSaving(response: unknown): void {
    this.saving.set(false);
    this.toastService.success(response);
    this.cancelForm();
  }
}
