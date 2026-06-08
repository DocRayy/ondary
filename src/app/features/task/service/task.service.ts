import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '@app/core/auth/auth.service';
import { createInvalidApiIdError, normalizeApiId } from '@app/shared/utils/api-id';
import { environment } from '../../../../environments/environment';
import {
  ApiCollectionResponse,
  ApiItemResponse,
  CreateTaskRequest,
  CreateTaskTodoRequest,
  ProjectOption,
  TaskLabelOption,
  TaskRecord,
  TaskTodoRecord,
  UpdateTaskRequest,
  UserOption,
} from '../schema/task.schema';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getTasks(
    userId?: number | string,
    filters: { month?: number | string; year?: number | string; projectId?: number | string } = {},
  ) {
    let params = new HttpParams();

    if (userId !== undefined && userId !== null && String(userId).trim()) {
      params = params.set('user_id', String(userId));
    }

    if (
      filters.projectId !== undefined &&
      filters.projectId !== null &&
      String(filters.projectId).trim()
    ) {
      params = params.set('project_id', String(filters.projectId));
    }

    params = this.appendDateFilters(params, filters);

    return this.http
      .get<ApiCollectionResponse<TaskRecord>>(`${this.apiUrl}/task`, {
        headers: this.createAuthHeaders(),
        params,
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  getTask(taskId: number | string) {
    const id = normalizeApiId(taskId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('task id'));
    }

    return this.http
      .get<ApiItemResponse<TaskRecord>>(`${this.apiUrl}/task/${id}`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  createTask(payload: CreateTaskRequest) {
    return this.http
      .post<ApiItemResponse<TaskRecord>>(`${this.apiUrl}/task`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  updateTask(taskId: number | string, payload: UpdateTaskRequest) {
    const id = normalizeApiId(taskId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('task id'));
    }

    return this.http
      .patch<ApiItemResponse<TaskRecord>>(`${this.apiUrl}/task/${id}`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  deleteTask(taskId: number | string) {
    const id = normalizeApiId(taskId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('task id'));
    }

    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/task/${id}`, {
      headers: this.createAuthHeaders(),
    });
  }

  createTaskTodo(payload: CreateTaskTodoRequest) {
    return this.http
      .post<ApiItemResponse<TaskTodoRecord>>(`${this.apiUrl}/task-todos`, payload, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeItem(response)));
  }

  getTaskTodos(filters: { month?: number | string; year?: number | string } = {}) {
    return this.http
      .get<ApiCollectionResponse<TaskTodoRecord>>(`${this.apiUrl}/task-todos`, {
        headers: this.createAuthHeaders(),
        params: this.appendDateFilters(new HttpParams(), filters),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  getProjects() {
    return this.http
      .get<ApiCollectionResponse<ProjectOption>>(`${this.apiUrl}/projects`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  getUsers() {
    return this.http
      .get<ApiCollectionResponse<UserOption>>(`${this.apiUrl}/users`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  getTaskLabels() {
    return this.http
      .get<ApiCollectionResponse<TaskLabelOption>>(`${this.apiUrl}/task-labels`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  generateTaskReportPdf(filters: { month?: number | string; year?: number | string; type?: string }) {
    let params = new HttpParams();

    if (filters.month !== undefined && filters.month !== null && String(filters.month).trim()) {
      params = params.set('month', String(filters.month));
    }

    if (filters.year !== undefined && filters.year !== null && String(filters.year).trim()) {
      params = params.set('year', String(filters.year));
    }

    if (filters.type) {
      params = params.set('type', filters.type);
    }

    return this.http.get(`${this.apiUrl}/task/report/pdf`, {
      headers: this.createAuthHeaders(),
      observe: 'response',
      params,
      responseType: 'blob',
    });
  }

  getFilenameFromResponse(
    response: HttpResponse<Blob>,
    fallback = 'task-report.pdf',
  ): string {
    const contentDisposition = response.headers.get('content-disposition');
    const filenameMatch =
      contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i) ??
      contentDisposition?.match(/filename="?([^"]+)"?/i);

    if (!filenameMatch?.[1]) {
      return fallback;
    }

    try {
      return decodeURIComponent(filenameMatch[1]);
    } catch {
      return filenameMatch[1];
    }
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

  private appendDateFilters(
    params: HttpParams,
    filters: { month?: number | string; year?: number | string },
  ): HttpParams {
    if (filters.month !== undefined && filters.month !== null && String(filters.month).trim()) {
      params = params.set('month', String(filters.month));
    }

    if (filters.year !== undefined && filters.year !== null && String(filters.year).trim()) {
      params = params.set('year', String(filters.year));
    }

    return params;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
