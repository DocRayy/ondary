import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { createInvalidApiIdError, normalizeApiId } from '../../../shared/utils/api-id';
import { environment } from '../../../../environments/environment';

export interface BackupRecord {
  id?: number | string;
  _id?: number | string;
  backup_id?: number | string;
  backupId?: number | string;
  timestamp?: string;
  created_at?: string;
  backup_name?: string;
  name?: string;
  filename?: string;
  database_version?: string;
  version?: string;
  size?: string | number;
  status?: string;
}

export interface BackupQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface BackupMeta {
  total: number;
  page: number;
  limit: number;
  page_count: number;
  limit_options?: number[];
}

export interface BackupList {
  items: BackupRecord[];
  meta: BackupMeta;
}

type ApiCollectionResponse<T> =
  | T[]
  | {
      data?:
        | T[]
        | {
            items?: T[];
            results?: T[];
            backups?: T[];
            meta?: Partial<BackupMeta>;
          };
      items?: T[];
      results?: T[];
      backups?: T[];
      meta?: Partial<BackupMeta>;
    }
  | null;

@Injectable({
  providedIn: 'root',
})
export class BackupRestoreService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getBackups(query: BackupQuery = {}) {
    return this.http
      .get<ApiCollectionResponse<BackupRecord>>(`${this.apiUrl}/backups`, {
        headers: this.createAuthHeaders(),
        params: this.createParams(query),
      })
      .pipe(map((response) => this.normalizeList(response, query)));
  }

  createBackup() {
    return this.http.post<{ title?: string; message?: string }>(
      `${this.apiUrl}/backups`,
      {},
      { headers: this.createAuthHeaders() },
    );
  }

  downloadBackup(backupId: number | string) {
    const id = normalizeApiId(backupId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('backup id'));
    }

    return this.http.get(`${this.apiUrl}/backups/${id}/download`, {
      headers: this.createAuthHeaders(),
      responseType: 'blob',
    });
  }

  restoreBackup(backupId: number | string) {
    const id = normalizeApiId(backupId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('backup id'));
    }

    return this.http.post<{ title?: string; message?: string }>(
      `${this.apiUrl}/backups/${id}/restore`,
      {},
      { headers: this.createAuthHeaders() },
    );
  }

  deleteBackup(backupId: number | string) {
    const id = normalizeApiId(backupId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('backup id'));
    }

    return this.http.delete<{ title?: string; message?: string }>(`${this.apiUrl}/backups/${id}`, {
      headers: this.createAuthHeaders(),
    });
  }

  uploadRestore(file: File, databaseVersion: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database_version', databaseVersion);

    return this.http.post<{ title?: string; message?: string }>(
      `${this.apiUrl}/restore`,
      formData,
      { headers: this.createAuthHeaders() },
    );
  }

  private normalizeList<T>(response: ApiCollectionResponse<T>, query: BackupQuery): BackupList {
    const fallbackMeta = this.createFallbackMeta(query);

    if (Array.isArray(response)) {
      const items = this.normalizeRecords(response as BackupRecord[]);
      return {
        items,
        meta: {
          ...fallbackMeta,
          total: items.length,
          page_count: Math.max(1, Math.ceil(items.length / fallbackMeta.limit)),
        },
      };
    }

    if (!response) {
      return { items: [], meta: fallbackMeta };
    }

    if (response.data && !Array.isArray(response.data) && typeof response.data === 'object') {
      const items = this.normalizeRecords(
        (response.data.items ?? response.data.results ?? response.data.backups ?? []) as BackupRecord[],
      );
      return {
        items,
        meta: this.normalizeMeta(response.data.meta, query, items.length),
      };
    }

    const items = this.normalizeRecords((
      Array.isArray(response.data)
        ? response.data
        : response.items ?? response.results ?? response.backups ?? []
    ) as BackupRecord[]);

    return {
      items,
      meta: this.normalizeMeta(response.meta, query, items.length),
    };
  }

  private normalizeRecords(items: BackupRecord[]): BackupRecord[] {
    return items.map((item) => ({
      ...item,
      id: item.id ?? item.backup_id ?? item.backupId ?? item._id,
    }));
  }

  private createParams(query: BackupQuery): HttpParams {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('limit', String(query.limit ?? 10));

    if (query.search?.trim()) {
      params = params.set('search', query.search.trim());
    }

    return params;
  }

  private normalizeMeta(
    meta: Partial<BackupMeta> | undefined,
    query: BackupQuery,
    itemCount: number,
  ): BackupMeta {
    const fallback = this.createFallbackMeta(query);
    const total = Number(meta?.total ?? itemCount);
    const limit = Number(meta?.limit ?? fallback.limit);
    const page = Number(meta?.page ?? fallback.page);
    const pageCount = Number(meta?.page_count ?? Math.max(1, Math.ceil(total / limit)));

    return {
      total: Number.isFinite(total) ? total : itemCount,
      page: Number.isInteger(page) && page > 0 ? page : fallback.page,
      limit: Number.isInteger(limit) && limit > 0 ? limit : fallback.limit,
      page_count: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1,
      limit_options: meta?.limit_options?.length ? meta.limit_options : fallback.limit_options,
    };
  }

  private createFallbackMeta(query: BackupQuery): BackupMeta {
    return {
      total: 0,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      page_count: 1,
      limit_options: [10, 25, 50, 100],
    };
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
