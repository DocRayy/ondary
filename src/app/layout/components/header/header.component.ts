import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import dayjs from 'dayjs';
import { environment } from '../../../../environments/environment';
import { AuthService, AuthUser } from '../../../core/auth/auth.service';
import { NotificationItem, NotificationService } from '../../../core/notifications/notification.service';
import { getApiMediaUrl } from '../../../shared/utils/media';
import 'dayjs/locale/en';

type OndaryDesktopBridge = {
  isDesktop?: () => Promise<boolean>;
  notify?: (payload: { title?: string; body?: string; message?: string }) => Promise<boolean>;
};

declare global {
  interface Window {
    ondaryDesktop?: OndaryDesktopBridge;
  }
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private notificationSubscription: Subscription | null = null;

  readonly now = signal(new Date());
  readonly notificationsOpen = signal(false);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly user = signal<AuthUser | null>(this.authService.getUser());
  readonly isDesktopInstalled = signal(Boolean(window.ondaryDesktop));
  readonly isInstallingDesktop = signal(false);
  readonly desktopInstallMessage = signal('');
  private readonly nowDayjs = computed(() => dayjs(this.now()).locale('en'));
  private readonly desktopInstallerUrl = `${this.apiUrl}/downloads/ondary-installer.exe`;

  readonly displayName = computed(() => {
    const user = this.user();
    return user?.username || user?.name || 'User';
  });

  readonly userEmail = computed(() => this.user()?.email || '-');

  readonly userPhoto = computed(() => {
    const user = this.user();
    const photo = user?.photo_url || user?.photo || user?.avatar || user?.image;
    return getApiMediaUrl(photo) || '';
  });

  readonly timeLabel = computed(() =>
    this.nowDayjs().locale('en').format('DD MMMM YYYY, dddd, HH:mm:ss'),
  );

  readonly unreadNotificationCount = computed(
    () => this.notifications().filter((item) => !this.toBoolean(item.is_read)).length,
  );

  ngOnInit(): void {
    this.timerId = setInterval(() => this.now.set(new Date()), 1000);
    this.detectDesktopApp();
    this.loadLoggedInUser();
    this.loadNotifications();
    this.notificationSubscription = this.notificationService.created$.subscribe((notification) => {
      this.notifications.update((items) => [
        this.toViewNotification(notification),
        ...items.filter((item) => item.id === undefined || item.id !== notification.id),
      ]);
    });
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    this.notificationSubscription?.unsubscribe();
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((open) => !open);
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  installNow(): void {
    if (this.isInstallingDesktop()) {
      return;
    }

    if (this.isDesktopInstalled()) {
      this.desktopInstallMessage.set('');
      return;
    }

    this.isInstallingDesktop.set(true);
    this.desktopInstallMessage.set('');

    const anchor = document.createElement('a');
    anchor.href = this.desktopInstallerUrl;
    anchor.download = 'Ondary Setup 0.0.0.exe';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      this.isInstallingDesktop.set(false);
      this.desktopInstallMessage.set('Jika download tidak mulai, pastikan installer tersedia di server.');
    }, 1000);
  }

  private detectDesktopApp(): void {
    const bridge = window.ondaryDesktop;

    if (!bridge?.isDesktop) {
      this.isDesktopInstalled.set(false);
      return;
    }

    bridge
      .isDesktop()
      .then((isDesktop) => this.isDesktopInstalled.set(isDesktop))
      .catch(() => this.isDesktopInstalled.set(false));
  }

  private loadLoggedInUser(): void {
    const currentUser = this.authService.getUser();

    if (!currentUser?.id) {
      return;
    }

    this.http
      .get<UserResponse>(`${this.apiUrl}/users/${currentUser.id}`, {
        headers: this.createAuthHeaders(),
      })
      .subscribe({
        next: (response) => {
          const user = this.normalizeUserResponse(response);
          this.user.set(user ?? currentUser);
        },
        error: () => {
          this.user.set(currentUser);
        },
      });
  }

  private loadNotifications(): void {
    this.notificationService
      .getMine()
      .subscribe({
        next: (response) => {
          this.notifications.set(response.map((item) => this.toViewNotification(item)));
        },
        error: () => {
          this.notifications.set([]);
        },
      });
  }

  private normalizeUserResponse(response: UserResponse): AuthUser | null {
    if (!response) {
      return null;
    }

    if (this.isAuthUser(response)) {
      return response;
    }

    const nestedData = response.data;

    if (this.isAuthUser(nestedData)) {
      return nestedData;
    }

    if (nestedData && 'user' in nestedData && this.isAuthUser(nestedData.user)) {
      return nestedData.user;
    }

    if ('user' in response && this.isAuthUser(response.user)) {
      return response.user;
    }

    return null;
  }

  private isAuthUser(value: unknown): value is AuthUser {
    return Boolean(value && typeof value === 'object' && 'id' in value);
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private formatNotificationTime(value?: string): string {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return '-';
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

    if (diffMinutes < 1) {
      return 'Baru saja';
    }

    if (diffMinutes < 60) {
      return `${diffMinutes} menit lalu`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} jam lalu`;
    }

    return dayjs(date).locale('id').format('DD MMM YYYY HH:mm');
  }

  private toBoolean(value: boolean | number | undefined): boolean {
    return value === true || value === 1;
  }

  private toViewNotification(item: NotificationItem): NotificationItem {
    return {
      ...item,
      time: this.formatNotificationTime(item.created_at),
      tone: this.toBoolean(item.is_read) ? 'info' : 'warning',
    };
  }
}

type UserResponse =
  | AuthUser
  | {
      user?: AuthUser;
      data?: AuthUser | { user?: AuthUser };
    }
  | null;
