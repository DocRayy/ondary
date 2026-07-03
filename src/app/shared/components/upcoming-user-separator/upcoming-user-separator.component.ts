import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import gsap from 'gsap';

@Component({
  selector: 'app-upcoming-user-separator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="overflow-hidden rounded-xl bg-primary-200 text-white">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-primary-300"
        (click)="toggle.emit()"
      >
        <img
          *ngIf="photo; else avatarFallback"
          [src]="photo"
          [alt]="name"
          class="h-8 w-8 shrink-0 rounded-full object-cover"
        />
        <ng-template #avatarFallback>
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-500 text-xs font-bold text-white"
          >
            {{ initial }}
          </span>
        </ng-template>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-extrabold">{{ name }}</span>
          <span class="block text-xs font-semibold text-white/70">
            {{ count }} incomplete todo{{ count === 1 ? '' : 's' }}
          </span>
        </span>
        <span class="text-xs font-extrabold transition" [class.rotate-180]="expanded">v</span>
      </button>

      <div #content class="overflow-hidden" [class.hidden]="!hasMounted && !expanded">
        <div class="space-y-3 px-4 pb-4">
          <ng-content></ng-content>
        </div>
      </div>
    </section>
  `,
})
export class UpcomingUserSeparatorComponent implements AfterViewInit, OnChanges {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() name = '';
  @Input() photo = '';
  @Input() initial = '?';
  @Input() count = 0;
  @Input() expanded = false;
  @Output() toggle = new EventEmitter<void>();
  @ViewChild('content') content?: ElementRef<HTMLElement>;

  hasMounted = false;

  ngAfterViewInit(): void {
    this.hasMounted = true;
    this.setExpandedState(this.expanded, false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.hasMounted || !changes['expanded']) {
      return;
    }

    this.setExpandedState(this.expanded, true);
  }

  private setExpandedState(expanded: boolean, animated: boolean): void {
    const element = this.content?.nativeElement;
    if (!element) {
      return;
    }

    gsap.killTweensOf(element);
    if (!animated) {
      element.style.height = expanded ? 'auto' : '0px';
      element.style.opacity = expanded ? '1' : '0';
      return;
    }

    if (expanded) {
      element.style.height = 'auto';
      const height = element.offsetHeight;
      gsap.fromTo(
        element,
        { height: 0, opacity: 0 },
        { height, opacity: 1, duration: 0.24, ease: 'power2.out', onComplete: () => {
          element.style.height = 'auto';
        } },
      );
      return;
    }

    gsap.to(element, { height: 0, opacity: 0, duration: 0.2, ease: 'power2.inOut' });
  }
}
