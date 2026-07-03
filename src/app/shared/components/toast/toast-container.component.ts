import {
  AfterViewChecked,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import gsap from 'gsap';
import { ToastMessage, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed right-5 top-8 z-[120] flex w-[min(380px,calc(100vw-32px))] flex-col gap-3">
      <article
        *ngFor="let toast of toastService.toasts(); trackBy: trackToast"
        #toastItem
        class="flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-black shadow-2xl"
        [class.border-green-200]="toast.type === 'success'"
        [class.border-red-200]="toast.type === 'error'"
        [attr.data-toast-id]="toast.id"
      >
        <span
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          [class.bg-green-50]="toast.type === 'success'"
          [class.bg-red-50]="toast.type === 'error'"
        >
          <img class="h-5 w-5" [src]="getIcon(toast.type)" [alt]="toast.type" />
        </span>
        <div class="min-w-0 flex-1 pt-0.5">
          <p
            class="text-xs font-extrabold uppercase"
            [class.text-green-700]="toast.type === 'success'"
            [class.text-red-700]="toast.type === 'error'"
          >
            {{ toast.title }}
          </p>
          <p class="mt-1 whitespace-pre-line break-all text-sm font-semibold text-neutral-800">
            {{ toast.message }}
          </p>
        </div>
        <button
          type="button"
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-neutral-500 transition hover:bg-neutral-100"
          aria-label="Close toast"
          (click)="closeToast(toast.id, toastItem)"
        >
          X
        </button>
      </article>
    </div>
  `,
})
export class ToastContainerComponent implements AfterViewChecked {
  readonly toastService = inject(ToastService);
  private readonly animatedIds = new Set<number>();
  private readonly closingIds = new Set<number>();

  @ViewChildren('toastItem') private toastItems?: QueryList<ElementRef<HTMLElement>>;

  ngAfterViewChecked(): void {
    this.toastItems?.forEach((item) => {
      const id = Number(item.nativeElement.dataset['toastId']);
      if (!Number.isInteger(id) || this.animatedIds.has(id)) {
        return;
      }

      this.animatedIds.add(id);
      gsap.fromTo(
        item.nativeElement,
        { autoAlpha: 0, x: 36, y: -10, scale: 0.98 },
        { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.32, ease: 'power3.out' },
      );
      window.setTimeout(() => this.closeToast(id, item.nativeElement), 4200);
    });
  }

  trackToast(_index: number, toast: ToastMessage): number {
    return toast.id;
  }

  getIcon(type: ToastMessage['type']): string {
    return type === 'success' ? 'icons/linear/tick-circle.svg' : 'icons/linear/close-circle.svg';
  }

  closeToast(id: number, element: HTMLElement): void {
    if (this.closingIds.has(id)) {
      return;
    }

    this.closingIds.add(id);
    gsap.to(element, {
      autoAlpha: 0,
      x: 32,
      y: -8,
      scale: 0.98,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => {
        this.animatedIds.delete(id);
        this.closingIds.delete(id);
        this.toastService.remove(id);
      },
    });
  }
}
