import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

export const AUDIT_LOG_ACTIONS = ['create', 'update', 'delete', 'generate_pdf'] as const;

export const AUDIT_LOG_MODULES = [
  'auth',
  'users',
  'projects',
  'task',
  'task-attachments',
  'task-bookmarks',
  'task-comments',
  'task-files',
  'task-labels',
  'task-label-maps',
  'task-todos',
  'task-todo-files',
  'task-users',
  'timelogs',
  'timelog-file',
  'sticky-notes',
  'manager-notes',
  'notifications',
  'database-backups',
  'reports',
  'audit-logs',
] as const;

export const AUDIT_LOG_FIELDS = [
  'id',
  'user_id',
  'username',
  'user_role',
  'action',
  'module',
  'table_name',
  'method',
  'path',
  'endpoint',
  'target_url',
  'route',
  'resource_id',
  'status_code',
  'duration_ms',
  'ip_address',
  'user_agent',
  'query_params',
  'request_body',
  'old_values',
  'new_values',
  'changed_fields',
  'old_payload',
  'new_payload',
  'payload_changes',
  'database_changes',
  'metadata',
  'created_at',
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];
export type AuditLogModule = (typeof AUDIT_LOG_MODULES)[number];
export type AuditLogField = (typeof AUDIT_LOG_FIELDS)[number];

export interface AuditLogRecord {
  id?: number | string;
  user?: string | { id?: number | string; name?: string; username?: string; email?: string };
  user_id?: number | string;
  username?: string;
  user_role?: string;
  action?: string;
  module?: string;
  table_name?: string;
  method?: string;
  path?: string;
  endpoint?: string;
  target_url?: string;
  targetUrl?: string;
  url?: string;
  route?: string;
  resource_id?: number | string;
  status?: string;
  status_code?: number | string;
  duration_ms?: number | string;
  ip_address?: string;
  user_agent?: string;
  query_params?: unknown;
  request_body?: unknown;
  old_values?: unknown;
  new_values?: unknown;
  changed_fields?: unknown;
  old_payload?: unknown;
  new_payload?: unknown;
  payload_before?: unknown;
  payload_after?: unknown;
  oldPayload?: unknown;
  newPayload?: unknown;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  payload_lama?: unknown;
  payload_baru?: unknown;
  payload?: unknown;
  request_payload?: unknown;
  response_payload?: unknown;
  payload_changes?: unknown;
  payloadChanges?: unknown;
  database_changes?: unknown;
  changes?: unknown;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  search?: string;
  module?: string;
  action?: string;
  dateRange?: string;
}

export interface AuditLogMeta {
  total: number;
  page: number;
  limit: number;
  page_count: number;
  limit_options?: number[];
}

export interface AuditLogList {
  items: AuditLogRecord[];
  meta: AuditLogMeta;
}

type ApiCollectionResponse<T> =
  | T[]
  | {
      data?:
        | T[]
        | {
            items?: T[];
            meta?: Partial<AuditLogMeta>;
          };
      items?: T[];
      results?: T[];
      logs?: T[];
      meta?: Partial<AuditLogMeta>;
    }
  | null;

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getAuditLogs(query: AuditLogQuery = {}) {
    return this.http
      .get<ApiCollectionResponse<AuditLogRecord>>(`${this.apiUrl}/audit-logs`, {
        headers: this.createAuthHeaders(),
        params: this.createParams(query),
      })
      .pipe(map((response) => this.normalizeList(response, query)));
  }

  private normalizeList<T>(response: ApiCollectionResponse<T>, query: AuditLogQuery): AuditLogList {
    const fallbackMeta = this.createFallbackMeta(query);

    if (Array.isArray(response)) {
      return {
        items: this.normalizeRecords(response as AuditLogRecord[]),
        meta: {
          ...fallbackMeta,
          total: response.length,
          page_count: Math.max(1, Math.ceil(response.length / fallbackMeta.limit)),
        },
      };
    }

    if (!response) {
      return { items: [], meta: fallbackMeta };
    }

    if (response.data && !Array.isArray(response.data) && typeof response.data === 'object') {
      const items = response.data.items ?? [];
      return {
        items: this.normalizeRecords(items as AuditLogRecord[]),
        meta: this.normalizeMeta(response.data.meta, query, items.length),
      };
    }

    const items = (
      Array.isArray(response.data)
        ? response.data
        : response.items ?? response.results ?? response.logs ?? []
    ) as AuditLogRecord[];

    return {
      items: this.normalizeRecords(items),
      meta: this.normalizeMeta(response.meta, query, items.length),
    };
  }

  private normalizeRecords(items: AuditLogRecord[]): AuditLogRecord[] {
    return items.map((item) => {
      const endpoint =
        item.endpoint ||
        item.target_url ||
        item.targetUrl ||
        item.url ||
        item.path ||
        this.getStringField(item.metadata, 'endpoint') ||
        this.getStringField(item.metadata, 'target_url') ||
        this.getStringField(item.metadata, 'targetUrl') ||
        this.getStringField(item.metadata, 'url') ||
        this.getStringField(item.metadata, 'path');
      const targetUrl =
        item.target_url ||
        item.targetUrl ||
        item.url ||
        this.getStringField(item.metadata, 'target_url') ||
        this.getStringField(item.metadata, 'targetUrl') ||
        this.getStringField(item.metadata, 'url') ||
        this.getStringField(item.metadata, 'route') ||
        endpoint;
      const oldPayload =
        item.old_payload ??
        item.old_values ??
        item.payload_before ??
        item.oldPayload ??
        item.payloadBefore ??
        item.payload_lama ??
        item.before ??
        this.getUnknownField(item.payload_changes, 'before') ??
        this.getUnknownField(item.payloadChanges, 'before') ??
        this.getUnknownField(item.changes, 'before') ??
        this.getUnknownField(item.metadata, 'old_payload') ??
        this.getUnknownField(item.metadata, 'old_values') ??
        this.getUnknownField(item.metadata, 'payload_before') ??
        this.getUnknownField(item.metadata, 'before');
      const newPayload =
        item.new_payload ??
        item.new_values ??
        item.payload_after ??
        item.newPayload ??
        item.payloadAfter ??
        item.payload_baru ??
        item.after ??
        this.getUnknownField(item.payload_changes, 'after') ??
        this.getUnknownField(item.payloadChanges, 'after') ??
        this.getUnknownField(item.changes, 'after') ??
        this.getUnknownField(item.metadata, 'new_payload') ??
        this.getUnknownField(item.metadata, 'new_values') ??
        this.getUnknownField(item.metadata, 'payload_after') ??
        this.getUnknownField(item.metadata, 'after');

      return {
        ...item,
        endpoint,
        target_url: targetUrl,
        old_payload: oldPayload ?? null,
        new_payload: newPayload ?? null,
      };
    });
  }

  private getStringField(source: unknown, key: string): string {
    const value = this.getUnknownField(source, key);
    return typeof value === 'string' ? value : '';
  }

  private getUnknownField(source: unknown, key: string): unknown {
    return source && typeof source === 'object' && key in source
      ? (source as Record<string, unknown>)[key]
      : undefined;
  }

  private createParams(query: AuditLogQuery): HttpParams {
    let params = new HttpParams();
    const append = (key: string, value: string | undefined) => {
      if (value) {
        params = params.set(key, value);
      }
    };

    params = params.set('page', String(query.page ?? 1));
    params = params.set('limit', String(query.limit ?? 10));
    append('search', query.search?.trim());
    append('module', query.module);
    append('action', query.action);
    append('date_range', query.dateRange);
    return params;
  }

  private normalizeMeta(
    meta: Partial<AuditLogMeta> | undefined,
    query: AuditLogQuery,
    itemCount: number,
  ): AuditLogMeta {
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

  private createFallbackMeta(query: AuditLogQuery): AuditLogMeta {
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
