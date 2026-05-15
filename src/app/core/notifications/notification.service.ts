import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Subject, map } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface NotificationItem {
  id?: number | string;
  user_id?: number | string;
  title: string;
  message?: string;
  is_read?: boolean | number;
  created_at?: string;
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

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;
  private socket: Socket | null = null;
  private activeToken: string | null = null;

  private readonly createdSubject = new Subject<NotificationItem>();
  readonly created$ = this.createdSubject.asObservable();

  constructor() {
    this.authService.authChanged$.subscribe((token) => {
      if (token) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  connect(): void {
    const token = this.authService.getToken();

    if (!token) {
      this.disconnect();
      return;
    }

    if (this.socket?.connected && this.activeToken === token) {
      return;
    }

    this.disconnect();
    this.activeToken = token;
    this.requestBrowserNotificationPermission();

    this.socket = io(this.apiUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('notification.created', (notification: NotificationItem) => {
      this.createdSubject.next(notification);
      void this.showDesktopNotification(notification);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.activeToken = null;
  }

  getMine() {
    return this.http
      .get<NotificationResponse>(`${this.apiUrl}/notifications/me`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(map((response) => this.normalizeCollection(response)));
  }

  async showDesktopNotification(notification: NotificationItem): Promise<void> {
    const title = notification.title || 'Ondary';
    const body = notification.message || '';

    const desktopBridge = this.getDesktopBridge();
    if (desktopBridge?.notify) {
      await desktopBridge.notify({ title, body, message: body }).catch(() => false);
      return;
    }

    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => 'denied');
    }

    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  private requestBrowserNotificationPermission(): void {
    if (!('Notification' in window) || Notification.permission !== 'default') {
      return;
    }

    void Notification.requestPermission().catch(() => 'denied');
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
