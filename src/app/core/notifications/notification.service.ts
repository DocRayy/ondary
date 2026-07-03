import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Subject, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from '../realtime/realtime.service';
import { createInvalidApiIdError, normalizeApiId } from '../../shared/utils/api-id';

export type NotificationType =
  | 'task_created'
  | 'task_status_updated'
  | 'task_todo_created'
  | 'manager_note_created';

export interface NotificationItem {
  id?: number | string;
  user_id?: number | string;
  type?: NotificationType | string;
  title: string;
  message?: string;
  is_read?: boolean | number;
  task_id?: number | string | null;
  task_todo_id?: number | string | null;
  manager_note_id?: number | string | null;
  created_at?: string;
  updated_at?: string;
  time?: string;
  tone?: 'info' | 'success' | 'warning';
}

type NotificationResponse =
  | NotificationItem[]
  | {
      data?: NotificationItem[];
      items?: NotificationItem[];
      results?: NotificationItem[];
    }
  | null;

type OndaryDesktopBridge = {
  isDesktop?: () => Promise<boolean>;
  notify?: (payload: { title?: string; body?: string; message?: string }) => Promise<boolean>;
};

export type DesktopNotificationResult =
  | 'browser-shown'
  | 'electron-shown'
  | 'permission-denied'
  | 'unsupported'
  | 'failed';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly apiUrl = environment.API_URL;

  private readonly createdSubject = new Subject<NotificationItem>();
  readonly created$ = this.createdSubject.asObservable();
  readonly browserPermission = signal<NotificationPermission | 'unsupported'>(
    this.getBrowserNotificationPermission(),
  );

  constructor() {
    this.realtimeService.notificationCreated$.subscribe((notification) => {
      this.createdSubject.next(notification);
      void this.showDesktopNotification(notification);
    });
  }

  connect(): void {
    const token = this.authService.getToken();

    if (!token) {
      this.disconnect();
      return;
    }

    this.realtimeService.connect();
  }

  disconnect(): void {
    this.realtimeService.disconnect();
  }

  getMine() {
    return this.http
      .get<NotificationResponse>(`${this.apiUrl}/notifications/me`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  markAsRead(notificationId: number | string) {
    const id = normalizeApiId(notificationId);
    if (id === null) {
      return throwError(() => createInvalidApiIdError('notification id'));
    }

    return this.http.patch<{ title?: string; message?: string }>(
      `${this.apiUrl}/notifications/${id}/read`,
      {},
      {
        headers: this.createAuthHeaders(),
      },
    );
  }

  async showDesktopNotification(notification: NotificationItem): Promise<DesktopNotificationResult> {
    const title = notification.title || 'Ondary';
    const body = notification.message || '';

    const desktopBridge = this.getDesktopBridge();
    if (desktopBridge?.notify) {
      const notified = await desktopBridge.notify({ title, body, message: body }).catch(() => false);
      if (notified) {
        return 'electron-shown';
      }
    }

    if (!('Notification' in window)) {
      this.browserPermission.set('unsupported');
      return 'unsupported';
    }

    this.browserPermission.set(Notification.permission);

    if (Notification.permission !== 'granted') {
      return 'permission-denied';
    }

    try {
      new Notification(title, { body });
      return 'browser-shown';
    } catch {
      return 'failed';
    }
  }

  async showTestDesktopNotification(): Promise<DesktopNotificationResult> {
    return this.showDesktopNotification({
      title: 'Ondary notification test',
      message: 'Desktop alert successfull.',
    });
  }

  async enableBrowserNotifications(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) {
      this.browserPermission.set('unsupported');
      return 'unsupported';
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission().catch(() => 'denied' as const);
      this.browserPermission.set(permission);
      return permission;
    }

    this.browserPermission.set(Notification.permission);
    return Notification.permission;
  }

  private getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
    if (!('Notification' in window)) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  private getDesktopBridge(): OndaryDesktopBridge | undefined {
    return (window as Window & { ondaryDesktop?: OndaryDesktopBridge }).ondaryDesktop;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private normalizeCollection(response: NotificationResponse): NotificationItem[] {
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
}
