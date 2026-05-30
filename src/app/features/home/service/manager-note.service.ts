import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { createInvalidApiIdError, normalizeApiId } from '../../../shared/utils/api-id';
import { environment } from '../../../../environments/environment';

export interface ManagerNoteRecord {
  id?: number | string;
  user_id?: number | string;
  user?: {
    id?: number | string;
    username?: string;
    name?: string;
    email?: string;
  };
  title: string;
  description?: string;
  message?: string;
  created_at?: string;
}

export interface CreateManagerNoteRequest {
  user_id: number;
  title: string;
  description?: string;
}

export interface UpdateManagerNoteRequest {
  user_id?: number;
  title?: string;
  description?: string;
}

type ApiCollectionResponse<T> =
  | T[]
  | {
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
export class ManagerNoteService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getManagerNotes() {
    return this.http
      .get<ApiCollectionResponse<ManagerNoteRecord>>(`${this.apiUrl}/manager-notes`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  createManagerNote(payload: CreateManagerNoteRequest) {
    return this.http
      .post<ApiItemResponse<ManagerNoteRecord>>(`${this.apiUrl}/manager-notes`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateManagerNote(managerNoteId: number | string, payload: UpdateManagerNoteRequest) {
    const id = normalizeApiId(managerNoteId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('manager note id'));
    }

    return this.http
      .patch<ApiItemResponse<ManagerNoteRecord>>(
        `${this.apiUrl}/manager-notes/${id}`,
        payload,
        {
          headers: this.createAuthHeaders(),
        },
      )
      .pipe(map((response) => this.normalizeItem(response)));
  }

  deleteManagerNote(managerNoteId: number | string) {
    const id = normalizeApiId(managerNoteId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('manager note id'));
    }

    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/manager-notes/${id}`, {
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

  private normalizeItem(response: ApiItemResponse<ManagerNoteRecord>): ManagerNoteRecord | null {
    if (!response) {
      return null;
    }

    if (this.isWrappedItemResponse(response)) {
      const item = response.data ?? response.item ?? response.result ?? null;
      if (item && typeof item === 'object') {
        Object.defineProperties(item, {
          __apiTitle: { value: response.title, enumerable: false, configurable: true },
          __apiMessage: { value: response.message, enumerable: false, configurable: true },
        });
      }

      return item;
    }

    return response;
  }

  private isWrappedItemResponse(response: ApiItemResponse<ManagerNoteRecord>): response is {
    title?: string;
    message?: string;
    data?: ManagerNoteRecord;
    item?: ManagerNoteRecord;
    result?: ManagerNoteRecord;
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
