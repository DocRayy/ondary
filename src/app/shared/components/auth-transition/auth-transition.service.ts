import { Injectable, signal } from '@angular/core';
import { AuthUser } from '../../../core/auth/auth.service';

export type AuthTransitionMode = 'login-loading' | 'login-welcome' | 'logout-loading';

export interface AuthTransitionState {
  visible: boolean;
  mode: AuthTransitionMode;
  user: AuthUser | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthTransitionService {
  private readonly stateSignal = signal<AuthTransitionState>({
    visible: false,
    mode: 'login-loading',
    user: null,
  });

  readonly state = this.stateSignal.asReadonly();

  showLoginLoading(): void {
    this.stateSignal.set({
      visible: true,
      mode: 'login-loading',
      user: null,
    });
  }

  showLoginWelcome(user: AuthUser | null): void {
    this.stateSignal.set({
      visible: true,
      mode: 'login-welcome',
      user,
    });
  }

  showLogoutLoading(user: AuthUser | null): void {
    this.stateSignal.set({
      visible: true,
      mode: 'logout-loading',
      user,
    });
  }

  hide(): void {
    this.stateSignal.update((state) => ({
      ...state,
      visible: false,
    }));
  }
}
