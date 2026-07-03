import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { AuthTransitionService } from '../../../../shared/components/auth-transition/auth-transition.service';
import { FcInputTextComponent } from '../../../../shared/components/fc-input/fc-input-text.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

interface LoginForm {
  username: string;
  password: string;
}
@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FcInputTextComponent],
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly authTransition = inject(AuthTransitionService);

  loading = false;
  errorMessage = '';
  loginForm: LoginForm = {
    username: '',
    password: '',
  };

  passwordVisibility = { login: false, old: false, new: false, confirm: false };

  toggleVisibility(field: keyof typeof this.passwordVisibility): void {
    this.passwordVisibility[field] = !this.passwordVisibility[field];
  }

  submitLogin() {
    if (!this.loginForm.username || !this.loginForm.password || this.loading) {
      this.errorMessage = 'Username and password are required.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.authTransition.showLoginLoading();

    this.authService.login(this.loginForm.username, this.loginForm.password).subscribe({
      next: (user) => {
        this.loading = false;
        this.authTransition.showLoginWelcome(user);

        window.setTimeout(() => {
          this.router.navigate(['/']).then((navigated) => {
            this.authTransition.hide();

            if (navigated) {
              this.toastService.success({
                title: 'Login Successful',
                message: 'Welcome back. You have successfully signed in.',
              });
            }
          });
        }, 3000);
      },
      error: () => {
        this.loading = false;
        this.authTransition.hide();
        this.errorMessage = 'Username or password is incorrect.';
      },
    });
  }
}
