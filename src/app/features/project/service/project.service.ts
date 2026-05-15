import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '@app/core/auth/auth.service';
import { environment } from '../../../../environments/environment';
import { ApiCollectionResponse, ApiItemResponse, ProjectRecord } from '../schema/project.schema';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getProjects() {
    return this.http
      .get<ApiCollectionResponse<ProjectRecord>>(`${this.apiUrl}/projects`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  createProject(payload: Partial<ProjectRecord> | FormData) {
    return this.http
      .post<ApiItemResponse<ProjectRecord>>(`${this.apiUrl}/projects`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateProject(projectId: number | string, payload: Partial<ProjectRecord> | FormData) {
    return this.http
      .patch<ApiItemResponse<ProjectRecord>>(`${this.apiUrl}/projects/${projectId}`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  deleteProject(projectId: number | string) {
    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/projects/${projectId}`, {
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
