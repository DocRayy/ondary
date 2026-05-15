import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GsapModalDirective } from '../../directives/gsap-modal.directive';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule, GsapModalDirective],
  template: `
    <div
      *ngIf="visible"
      appGsapModal
      class="fixed inset-0 z-90 flex items-center justify-center bg-black/30 px-4"
      role="presentation"
      (click)="cancel.emit()"
    >
      <section
        class="w-[min(420px,calc(100vw-32px))] rounded-xl bg-white p-6 text-black shadow-2xl"
        role="dialog"
        aria-modal="true"
        (click)="$event.stopPropagation()"
      >
        <h2 class="text-lg font-extrabold">{{ title }}</h2>
        <p class="mt-3 text-sm font-medium text-neutral-700">{{ message }}</p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="h-10 rounded-md bg-neutral-100 px-5 text-sm font-bold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-70"
            [disabled]="loading"
            (click)="cancel.emit()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-10 rounded-md bg-tertiary-300 px-5 text-sm font-bold text-tertiary-800 transition hover:bg-tertiary-400 disabled:cursor-not-allowed disabled:opacity-70"
            [disabled]="loading"
            (click)="confirm.emit()"
          >
            {{ loading ? loadingText : confirmText }}
          </button>
        </div>
      </section>
    </div>
  `,
})
export class ConfirmationModalComponent {
  @Input() visible = false;
  @Input() loading = false;
  @Input() title = 'Delete';
  @Input() message = 'Are you sure you want to delete this item?';
  @Input() confirmText = 'Delete';
  @Input() loadingText = 'Deleting...';
  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}
