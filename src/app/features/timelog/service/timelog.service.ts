import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '@app/core/auth/auth.service';
import { createInvalidApiIdError, normalizeApiId } from '@app/shared/utils/api-id';
import { environment } from '../../../../environments/environment';
import {
  ApiCollectionResponse,
  ApiItemResponse,
  CreateTimelogRequest,
  TimelogRecord,
  UpdateTimelogRequest,
  TimelogFileRecord,
} from '../schema/timelog.schema';

@Injectable({
  providedIn: 'root',
})
export class TimelogService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getTimelogs() {
    return this.http
      .get<ApiCollectionResponse<TimelogRecord>>(`${this.apiUrl}/timelogs`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  createTimelog(payload: CreateTimelogRequest) {
    return this.http
      .post<ApiItemResponse<TimelogRecord>>(`${this.apiUrl}/timelogs`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateTimelog(timelogId: number | string, payload: UpdateTimelogRequest | FormData) {
    const id = normalizeApiId(timelogId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('timelog id'));
    }

    return this.http
      .patch<ApiItemResponse<TimelogRecord>>(`${this.apiUrl}/timelogs/${id}`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  uploadTimelogFile(timelogId: number | string, photo: File, note = '') {
    const id = normalizeApiId(timelogId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('timelog id'));
    }

    const formData = new FormData();
    formData.append('timelog_id', String(id));
    formData.append('photo', photo);

    if (note.trim()) {
      formData.append('note', note.trim());
    }

    return this.http
      .post<ApiItemResponse<TimelogFileRecord>>(`${this.apiUrl}/timelog-file`, formData, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
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
