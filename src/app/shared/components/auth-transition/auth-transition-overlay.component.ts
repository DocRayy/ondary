import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import gsap from 'gsap';
import { AuthUser } from '../../../core/auth/auth.service';
import { getFirstMediaUrl } from '../../utils/media';
import { AuthTransitionService, AuthTransitionState } from './auth-transition.service';

@Component({
  selector: 'app-auth-transition-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="isMounted()"
      #overlay
      class="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center bg-[#1E293B] px-6 text-center text-white"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        #content
        class="flex max-w-[min(520px,100%)] flex-col items-center justify-center opacity-0"
      >
        <ng-container [ngSwitch]="displayedState().mode">
          <ng-container *ngSwitchCase="'login-welcome'">
            <div
              class="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-white/20 bg-white/10 shadow-2xl shadow-black/20 sm:h-44 sm:w-44"
            >
              <img
                *ngIf="userPhoto(); else userInitial"
                [src]="userPhoto()"
                [alt]="userName()"
                class="h-full w-full object-cover"
              />
              <ng-template #userInitial>
                <span class="text-6xl font-extrabold sm:text-7xl">{{ userInitialText() }}</span>
              </ng-template>
            </div>
            <p class="mt-8 text-2xl font-extrabold sm:text-4xl">Welcome Back, {{ userName() }}</p>
          </ng-container>

          <ng-container *ngSwitchCase="'logout-loading'">
            <p class="text-2xl font-extrabold sm:text-4xl">Logging out from {{ userName() }}</p>
          </ng-container>

          <ng-container *ngSwitchDefault>
            <p class="text-2xl font-extrabold sm:text-4xl">Logging in</p>
          </ng-container>
        </ng-container>
      </div>
    </div>
  `,
})
export class AuthTransitionOverlayComponent implements OnDestroy {
  private readonly transitionService = inject(AuthTransitionService);
  private readonly defaultState: AuthTransitionState = {
    visible: false,
    mode: 'login-loading',
    user: null,
  };
  private hasAnimatedIn = false;

  @ViewChild('overlay') private overlay?: ElementRef<HTMLElement>;
  @ViewChild('content') private content?: ElementRef<HTMLElement>;

  readonly state = this.transitionService.state;
  readonly displayedState = signal<AuthTransitionState>(this.defaultState);
  readonly isMounted = signal(false);
  readonly userName = computed(() => this.getUserName(this.displayedState().user));
  readonly userPhoto = computed(() => getFirstMediaUrl(this.displayedState().user) || '');
  readonly userInitialText = computed(() => this.userName().charAt(0).toUpperCase() || 'U');

  constructor() {
    effect(() => {
      const state = this.state();
      const mounted = untracked(() => this.isMounted());

      if (state.visible) {
        if (!mounted) {
          this.displayedState.set(state);
          this.isMounted.set(true);
          window.requestAnimationFrame(() => this.animateContentIn());
          return;
        }

        this.transitionContentTo(state);
        return;
      }

      if (mounted) {
        this.animateOut();
      }
    });
  }

  ngOnDestroy(): void {
    const overlay = this.overlay?.nativeElement;
    const content = this.content?.nativeElement;
    gsap.killTweensOf([overlay, content].filter(Boolean));
  }

  private animateContentIn(): void {
    const content = this.content?.nativeElement;

    if (!content) {
      return;
    }

    gsap.killTweensOf(content);
    gsap.fromTo(
      content,
      { autoAlpha: 0, y: 18, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.44, ease: 'power3.out' },
    );
    this.hasAnimatedIn = true;
  }

  private animateOut(): void {
    const overlay = this.overlay?.nativeElement;

    if (!overlay) {
      this.isMounted.set(false);
      return;
    }

    gsap.killTweensOf(overlay);
    gsap.to(overlay, {
      autoAlpha: 0,
      duration: 0.42,
      ease: 'power2.inOut',
      onComplete: () => {
        this.isMounted.set(false);
        this.hasAnimatedIn = false;
      },
    });
  }

  private transitionContentTo(nextState: AuthTransitionState): void {
    const currentState = this.displayedState();

    if (
      currentState.mode === nextState.mode &&
      currentState.user?.id === nextState.user?.id &&
      this.hasAnimatedIn
    ) {
      return;
    }

    const content = this.content?.nativeElement;

    if (!content) {
      this.displayedState.set(nextState);
      window.requestAnimationFrame(() => this.animateContentIn());
      return;
    }

    gsap.killTweensOf(content);
    gsap.to(content, {
      autoAlpha: 0,
      y: -12,
      scale: 0.98,
      duration: this.hasAnimatedIn ? 0.22 : 0,
      ease: 'power2.inOut',
      onComplete: () => {
        this.displayedState.set(nextState);
        window.requestAnimationFrame(() => this.animateContentIn());
      },
    });
  }

  private getUserName(user: AuthUser | null): string {
    return user?.name || user?.username || 'User';
  }
}
