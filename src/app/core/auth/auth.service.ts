import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable, Subject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  name: string;
  phone_no: string;
  is_verified: boolean | number;
  role: string;
  status: string;
  photo?: string;
  photo_url?: string;
  avatar?: string;
  image?: string;
}

interface LoginResponse {
  token?: string;
  access_token?: string;
  user?: AuthUser;
  data?: AuthUser | { user?: AuthUser; token?: string; access_token?: string };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenKey = 'ondary_token';
  private readonly userKey = 'ondary_user';
  private readonly apiUrl = environment.API_URL;
  private readonly authChangedSubject = new Subject<string | null>();
  readonly authChanged$ = this.authChangedSubject.asObservable();

  login(username: string, password: string): Observable<AuthUser | null> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, {
        identifier: username,
        password,
      })
      .pipe(
        map((response) => this.normalizeLoginResponse(response)),
        tap(({ token, user }) => {
          if (token) {
            localStorage.setItem(this.tokenKey, token);
          }

          if (user) {
            localStorage.setItem(this.userKey, JSON.stringify(user));
          }

          this.authChangedSubject.next(token);
        }),
        map(({ user }) => user),
      );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.authChangedSubject.next(null);
    this.router.navigate(['/login']);
  }

  isAuthenticated() {
    return Boolean(this.getToken() || this.getUser());
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    const rawUser = localStorage.getItem(this.userKey);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as AuthUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }

  private normalizeLoginResponse(response: LoginResponse): {
    token: string | null;
    user: AuthUser | null;
  } {
    const nestedData = response.data;
    const nestedUser = nestedData && 'user' in nestedData ? nestedData.user : null;
    const directDataUser = nestedData && !('user' in nestedData) ? (nestedData as AuthUser) : null;

    return {
      token:
        response.token ??
        response.access_token ??
        (nestedData && 'token' in nestedData ? nestedData.token : null) ??
        (nestedData && 'access_token' in nestedData ? nestedData.access_token : null) ??
        null,
      user: response.user ?? nestedUser ?? directDataUser ?? null,
    };
  }
}
