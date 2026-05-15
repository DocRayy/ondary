import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

export interface MemberRecord {
  id?: number | string;
  username: string;
  email: string;
  password?: string;
  name?: string;
  role?: string;
  status?: string;
  photo?: string;
  photo_url?: string;
  avatar?: string;
  image?: string;
}

type ApiCollectionResponse<T> =
  | T[]
  | {
      title?: string;
      message?: string;
      data?: T[];
      items?: T[];
      results?: T[];
    }
  | null;

type ApiItemResponse<T> =
  | T
  | {
      title?: string;
      message?: string;
      data?: T;
      item?: T;
      result?: T;
    }
  | null;

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getUsers() {
    return this.http
      .get<ApiCollectionResponse<MemberRecord>>(`${this.apiUrl}/users`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  createUser(payload: MemberRecord | FormData) {
    return this.http
      .post<ApiItemResponse<MemberRecord>>(`${this.apiUrl}/users`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateUser(userId: number | string, payload: Partial<MemberRecord> | FormData) {
    return this.http
      .patch<ApiItemResponse<MemberRecord>>(`${this.apiUrl}/users/${userId}`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  deleteUser(userId: number | string) {
    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/users/${userId}`, {
      headers: this.createAuthHeaders(),
    });
  }

  private normalizeCollection<T>(response: ApiCollectionResponse<T>): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (!response) {
      return [];
    }

    if (Array.isArray(response.data)) {
      return response.data;
    }

    if (Array.isArray(response.items)) {
      return response.items;
    }

    if (Array.isArray(response.results)) {
      return response.results;
    }

    return [];
  }

  private normalizeItem<T>(response: ApiItemResponse<T>): T {
    if (!response) {
      return null as T;
    }

    if (this.isWrappedItemResponse(response)) {
      const item = response.data ?? response.item ?? response.result ?? null;
      if (item && typeof item === 'object') {
        Object.defineProperties(item, {
          __apiTitle: { value: response.title, enumerable: false, configurable: true },
          __apiMessage: { value: response.message, enumerable: false, configurable: true },
        });
      }

      return item as T;
    }

    return response as T;
  }

  private isWrappedItemResponse<T>(response: ApiItemResponse<T>): response is {
    title?: string;
    message?: string;
    data?: T;
    item?: T;
    result?: T;
  } {
    if (!response || typeof response !== 'object') {
      return false;
    }

    return 'data' in response || 'item' in response || 'result' in response;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
