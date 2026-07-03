import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
  DropdownSelectValue,
} from '../../../shared/components/dropdown-select/dropdown-select.component';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import {
  TablePaginationComponent,
  TablePaginationMeta,
} from '../../../shared/components/table-pagination/table-pagination.component';
import { GsapModalDirective } from '../../../shared/directives/gsap-modal.directive';
import {
  AUDIT_LOG_ACTIONS,
  AUDIT_LOG_MODULES,
  AuditLogAction,
  AuditLogField,
  AuditLogRecord,
  AuditLogService,
} from '../service/audit-log.service';

type DiffRowType = 'same' | 'removed' | 'added' | 'changed';

interface PayloadDiffRow {
  key: string;
  before: string;
  after: string;
  type: DiffRowType;
}

interface ValueDiffRow {
  key: string;
  value: string;
  type: 'removed' | 'added';
}

interface AuditFieldDisplay {
  key: AuditLogField;
  label: string;
}

const AUDIT_JSON_FIELDS: AuditFieldDisplay[] = [
  { key: 'database_changes', label: 'Database Changes' },
  { key: 'metadata', label: 'Metadata' },
];

const AUDIT_SIMPLE_FIELDS: AuditLogField[] = [
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
  'created_at',
];

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DropdownSelectComponent,
    FcIconComponent,
    GsapModalDirective,
    TablePaginationComponent,
  ],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent implements OnInit {
  private readonly auditLogService = inject(AuditLogService);

  readonly logs = signal<AuditLogRecord[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly searchTerm = signal('');
  readonly selectedModule = signal('');
  readonly selectedAction = signal('');
  readonly selectedLog = signal<AuditLogRecord | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly meta = signal<TablePaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    page_count: 1,
    limit_options: [10, 25, 50, 100],
  });

  readonly auditJsonFields = AUDIT_JSON_FIELDS;
  readonly auditSimpleFields = AUDIT_SIMPLE_FIELDS;

  readonly moduleOptions = computed<DropdownSelectOption[]>(() => [
    { value: '', label: 'All Modules' },
    ...AUDIT_LOG_MODULES.map((module) => ({ value: module, label: module })),
  ]);

  readonly actionOptions = computed<DropdownSelectOption[]>(() => [
    { value: '', label: 'All Actions' },
    ...AUDIT_LOG_ACTIONS.map((action) => ({ value: action, label: this.getActionLabel(action) })),
  ]);

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.auditLogService
      .getAuditLogs({
        page: this.page(),
        limit: this.limit(),
        search: this.searchTerm(),
        module: this.selectedModule(),
        action: this.selectedAction(),
        dateRange: '7d',
      })
      .subscribe({
        next: (response) => {
          this.logs.set(response.items.filter((log) => this.isAllowedAction(log.action)));
          this.meta.set(response.meta);
          this.page.set(response.meta.page);
          this.limit.set(response.meta.limit);
          this.isLoading.set(false);
        },
        error: () => {
          this.logs.set([]);
          this.meta.set({
            total: 0,
            page: this.page(),
            limit: this.limit(),
            page_count: 1,
            limit_options: [10, 25, 50, 100],
          });
          this.errorMessage.set('Failed to load audit logs.');
          this.isLoading.set(false);
        },
      });
  }

  searchLogs(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
    this.loadLogs();
  }

  selectModule(value: DropdownSelectValue): void {
    this.selectedModule.set(String(value ?? ''));
    this.page.set(1);
    this.loadLogs();
  }

  selectAction(value: DropdownSelectValue): void {
    this.selectedAction.set(String(value ?? ''));
    this.page.set(1);
    this.loadLogs();
  }

  selectPage(page: number): void {
    this.page.set(page);
    this.loadLogs();
  }

  selectLimit(limit: number): void {
    this.limit.set(limit);
    this.page.set(1);
    this.loadLogs();
  }

  openDetail(log: AuditLogRecord): void {
    this.selectedLog.set(log);
  }

  closeDetail(): void {
    this.selectedLog.set(null);
  }

  trackLog(index: number, log: AuditLogRecord): string {
    return String(log.id ?? `${log.created_at ?? 'log'}-${index}`);
  }

  trackDiffRow(index: number, row: PayloadDiffRow): string {
    return `${row.key}-${row.type}-${index}`;
  }

  trackValueDiffRow(index: number, row: ValueDiffRow): string {
    return `${row.key}-${row.type}-${index}`;
  }

  getUserLabel(log: AuditLogRecord): string {
    if (typeof log.user === 'string') {
      return log.user;
    }

    return (
      log.username ||
      log.user?.name ||
      log.user?.username ||
      log.user?.email ||
      `User #${log.user_id ?? '-'}`
    );
  }

  getTimestamp(log: AuditLogRecord | null): string {
    return this.formatDate(log?.created_at || log?.updated_at);
  }

  getActionLabel(action?: string): string {
    const normalized = this.normalizeAction(action);
    if (normalized === 'generate_pdf') {
      return 'Generate PDF';
    }

    return String(action || '-').replace(/_/g, ' ').toUpperCase();
  }

  getStatusLabel(log: AuditLogRecord): string {
    return String(log.status_code ?? log.status ?? '-').replace(/_/g, ' ').toUpperCase();
  }

  getStatusClass(log: AuditLogRecord): string {
    const normalized = this.normalizeValue(String(log.status_code ?? log.status ?? ''));
    if (normalized === 'ok' || normalized === 'success' || normalized.startsWith('2')) {
      return 'bg-success-600 text-white';
    }

    if (normalized.includes('error') || normalized.includes('failed') || normalized.startsWith('4')) {
      return 'bg-error-600 text-white';
    }

    return 'bg-primary-700 text-white';
  }

  getActionClass(action?: string): string {
    const normalized = this.normalizeAction(action);
    if (normalized.includes('delete')) {
      return 'bg-error-900/75 text-error-100 ring-1 ring-error-400/30';
    }

    if (normalized.includes('create')) {
      return 'bg-success-900/75 text-success-100 ring-1 ring-success-400/30';
    }

    if (normalized.includes('update')) {
      return 'bg-warning-900/75 text-warning-100 ring-1 ring-warning-400/30';
    }

    if (normalized === 'generate_pdf') {
      return 'bg-sky-900/75 text-sky-100 ring-1 ring-sky-400/30';
    }

    return 'bg-primary-700 text-white ring-1 ring-white/10';
  }

  getPayloadBefore(log: AuditLogRecord | null): unknown {
    return (
      log?.old_payload ??
      log?.old_values ??
      log?.payload_before ??
      log?.oldPayload ??
      log?.payloadBefore ??
      log?.payload_lama ??
      log?.before ??
      this.getNestedValue(log?.payload_changes, 'before') ??
      this.getNestedValue(log?.payloadChanges, 'before') ??
      this.getNestedValue(log?.changes, 'before') ??
      null
    );
  }

  getPayloadAfter(log: AuditLogRecord | null): unknown {
    return (
      log?.new_payload ??
      log?.new_values ??
      log?.payload_after ??
      log?.newPayload ??
      log?.payloadAfter ??
      log?.payload_baru ??
      log?.after ??
      this.getNestedValue(log?.payload_changes, 'after') ??
      this.getNestedValue(log?.payloadChanges, 'after') ??
      this.getNestedValue(log?.changes, 'after') ??
      null
    );
  }

  getDiffRows(log: AuditLogRecord | null): PayloadDiffRow[] {
    const explicitRows = this.getExplicitDiffRows(
      log?.payload_changes ?? log?.payloadChanges ?? log?.database_changes ?? log?.changes ?? null,
    );
    if (explicitRows.length) {
      return explicitRows;
    }

    const before = this.flattenPayload(this.getPayloadBefore(log));
    const after = this.flattenPayload(this.getPayloadAfter(log));
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

    if (!keys.length) {
      return [];
    }

    return keys.map((key) => {
      const hasBefore = key in before;
      const hasAfter = key in after;
      const beforeValue = hasBefore ? before[key] : '';
      const afterValue = hasAfter ? after[key] : '';
      const type: DiffRowType = !hasBefore
        ? 'added'
        : !hasAfter
          ? 'removed'
          : beforeValue === afterValue
            ? 'same'
            : 'changed';

      return { key, before: beforeValue, after: afterValue, type };
    });
  }

  getOldValueRows(log: AuditLogRecord | null): ValueDiffRow[] {
    const rows = this.getDiffRows(log)
      .filter((row) => row.type === 'removed' || row.type === 'changed')
      .map((row) => ({ key: row.key, value: row.before || '-', type: 'removed' as const }));

    if (rows.length) {
      return rows;
    }

    return Object.entries(this.flattenPayload(this.normalizePayloadObject(log?.old_values))).map(
      ([key, value]) => ({ key, value, type: 'removed' as const }),
    );
  }

  getNewValueRows(log: AuditLogRecord | null): ValueDiffRow[] {
    const rows = this.getDiffRows(log)
      .filter((row) => row.type === 'added' || row.type === 'changed' || row.type === 'removed')
      .map((row) => ({
        key: row.key,
        value: row.type === 'removed' ? row.before || '-' : row.after || '-',
        type: row.type === 'removed' ? ('removed' as const) : ('added' as const),
      }));

    if (rows.length) {
      return rows;
    }

    return Object.entries(this.flattenPayload(this.normalizePayloadObject(log?.new_values))).map(
      ([key, value]) => ({ key, value, type: 'added' as const }),
    );
  }

  formatPayload(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  getTargetUrl(log: AuditLogRecord | null): string {
    return String(log?.target_url || log?.endpoint || log?.path || log?.route || '-');
  }

  getPath(log: AuditLogRecord | null): string {
    return String(log?.path || log?.route || log?.endpoint || '-');
  }

  getSimpleField(log: AuditLogRecord | null, key: AuditLogField): string {
    const value = log ? (log as Record<AuditLogField, unknown>)[key] : undefined;
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    return String(value);
  }

  getJsonField(log: AuditLogRecord | null, key: AuditLogField): unknown {
    return log ? (log as Record<AuditLogField, unknown>)[key] : null;
  }

  private flattenPayload(value: unknown, prefix = ''): Record<string, string> {
    value = this.normalizePayloadObject(value);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return prefix ? { [prefix]: this.formatPayload(value) } : {};
    }

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
      (result, [key, fieldValue]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
          return { ...result, ...this.flattenPayload(fieldValue, path) };
        }

        result[path] = this.formatPayload(fieldValue);
        return result;
      },
      {},
    );
  }

  private normalizeValue(value?: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private normalizePayloadObject(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue || (!trimmedValue.startsWith('{') && !trimmedValue.startsWith('['))) {
      return value;
    }

    try {
      return JSON.parse(trimmedValue);
    } catch {
      return value;
    }
  }

  private normalizeAction(value?: string): string {
    return this.normalizeValue(value).replace(/[\s-]+/g, '_');
  }

  private isAllowedAction(action?: string): boolean {
    return AUDIT_LOG_ACTIONS.includes(this.normalizeAction(action) as AuditLogAction);
  }

  private getNestedValue(source: unknown, key: string): unknown {
    return source && typeof source === 'object' && key in source
      ? (source as Record<string, unknown>)[key]
      : undefined;
  }

  private getExplicitDiffRows(value: unknown): PayloadDiffRow[] {
    if (!value || typeof value !== 'object') {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((item, index) => this.createExplicitDiffRow(item, String(index)))
        .filter((row): row is PayloadDiffRow => !!row);
    }

    const record = value as Record<string, unknown>;
    if ('before' in record || 'after' in record) {
      return [];
    }

    return Object.entries(record)
      .map(([key, fieldValue]) => this.createExplicitDiffRow(fieldValue, key))
      .filter((row): row is PayloadDiffRow => !!row);
  }

  private createExplicitDiffRow(value: unknown, fallbackKey: string): PayloadDiffRow | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const key = String(record['field'] ?? record['key'] ?? record['name'] ?? fallbackKey);
    const before = this.formatPayload(record['before'] ?? record['old'] ?? record['from'] ?? '');
    const after = this.formatPayload(record['after'] ?? record['new'] ?? record['to'] ?? '');

    if (!key || (before === '-' && after === '-')) {
      return null;
    }

    return {
      key,
      before: before === '-' ? '' : before,
      after: after === '-' ? '' : after,
      type: before === '-' ? 'added' : after === '-' ? 'removed' : before === after ? 'same' : 'changed',
    };
  }

  private formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
