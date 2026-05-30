import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '@app/core/auth/auth.service';
import { createInvalidApiIdError, normalizeApiId } from '@app/shared/utils/api-id';
import { environment } from '../../../../environments/environment';
import {
  ApiCollectionResponse,
  ApiItemResponse,
  CreateStickyNoteRequest,
  StickyNoteRecord,
  UpdateStickyNoteRequest,
} from '../schema/sticky-note.schema';

@Injectable({
  providedIn: 'root',
})
export class StickyNoteService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getStickyNotes() {
    return this.http
      .get<ApiCollectionResponse<StickyNoteRecord>>(`${this.apiUrl}/sticky-notes`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  createStickyNote(payload: CreateStickyNoteRequest) {
    return this.http
      .post<ApiItemResponse<StickyNoteRecord>>(`${this.apiUrl}/sticky-notes`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateStickyNote(stickyNoteId: number | string, payload: UpdateStickyNoteRequest) {
    const id = normalizeApiId(stickyNoteId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('sticky note id'));
    }

    return this.http
      .patch<ApiItemResponse<StickyNoteRecord>>(
        `${this.apiUrl}/sticky-notes/${id}`,
        payload,
        {
          headers: this.createAuthHeaders(),
        },
      )
      .pipe(map((response) => this.normalizeItem(response)));
  }

  deleteStickyNote(stickyNoteId: number | string) {
    const id = normalizeApiId(stickyNoteId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('sticky note id'));
    }

    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/sticky-notes/${id}`, {
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

  private normalizeItem(response: ApiItemResponse<StickyNoteRecord>): StickyNoteRecord | null {
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

  private isWrappedItemResponse(response: ApiItemResponse<StickyNoteRecord>): response is {
    title?: string;
    message?: string;
    data?: StickyNoteRecord;
    item?: StickyNoteRecord;
    result?: StickyNoteRecord;
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
