import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { FcInputTextComponent } from '../../../../shared/components/fc-input/fc-input-text.component';

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
      this.errorMessage = 'Username dan password wajib diisi.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.username, this.loginForm.password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/']);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Username atau password tidak sesuai.';
      },
    });
  }
}
