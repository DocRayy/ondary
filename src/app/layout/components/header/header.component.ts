import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import dayjs from 'dayjs';
import gsap from 'gsap';
import { environment } from '../../../../environments/environment';
import { AuthService, AuthUser } from '../../../core/auth/auth.service';
import {
  NotificationItem,
  NotificationService,
} from '../../../core/notifications/notification.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { normalizeApiId } from '../../../shared/utils/api-id';
import { getFirstMediaUrl } from '../../../shared/utils/media';
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
  imports: [CommonModule, FcIconComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private notificationSubscription: Subscription | null = null;
  @Input() isSidebarCollapsed = false;
  @Output() sidebarToggle = new EventEmitter<void>();

  readonly now = signal(new Date());
  readonly notificationsOpen = signal(false);
  readonly notificationsPanelVisible = signal(false);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly user = signal<AuthUser | null>(this.authService.getUser());
  readonly isDesktopInstalled = signal(Boolean(window.ondaryDesktop));
  readonly isInstallingDesktop = signal(false);
  readonly desktopInstallMessage = signal('');
  readonly browserNotificationPermission = this.notificationService.browserPermission;
  readonly realtimeConnected = this.realtimeService.connected;
  private readonly nowDayjs = computed(() => dayjs(this.now()).locale('en'));
  private readonly desktopInstallerUrl = `${this.apiUrl}/downloads/ondary-installer.exe`;
  @ViewChild('notificationsPanel') notificationsPanel?: ElementRef<HTMLElement>;

  readonly displayName = computed(() => {
    const user = this.user();
    return user?.username || user?.name || 'User';
  });

  readonly userEmail = computed(() => this.user()?.email || '-');

  readonly userPhoto = computed(() => {
    const user = this.user();
    return getFirstMediaUrl(user) || '';
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
      const viewNotification = this.toViewNotification(notification);
      this.notifications.update((items) => [
        viewNotification,
        ...items.filter((item) => item.id === undefined || item.id !== notification.id),
      ]);
      this.toastService.success({
        title: viewNotification.title || 'Notification',
        message: viewNotification.message || viewNotification.title || 'Notification baru',
      });
    });
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    this.notificationSubscription?.unsubscribe();
  }

  toggleNotifications(): void {
    if (this.notificationsOpen()) {
      this.closeNotifications();
      return;
    }

    this.notificationsPanelVisible.set(true);
    this.notificationsOpen.set(true);
    window.setTimeout(() => this.animateNotificationsIn());
  }

  closeNotifications(): void {
    if (!this.notificationsOpen()) {
      return;
    }

    this.notificationsOpen.set(false);
    this.animateNotificationsOut();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('[data-notifications-trigger]') ||
      target?.closest('[data-notifications-panel]')
    ) {
      return;
    }

    if (this.notificationsOpen()) {
      this.closeNotifications();
    }
  }

  toggleSidebar(): void {
    this.sidebarToggle.emit();
  }

  openNotification(item: NotificationItem): void {
    this.closeNotifications();
    this.markNotificationAsRead(item);

    const commands = this.getNotificationRoute(item);
    if (!commands) {
      return;
    }

    void this.router.navigate(commands.path, {
      queryParams: commands.queryParams,
    });
  }

  enableBrowserNotifications(): void {
    void this.notificationService.enableBrowserNotifications().then((permission) => {
      if (permission === 'granted') {
        this.toastService.success({
          title: 'Notification',
          message: 'Desktop alert aktif.',
        });
        return;
      }

      this.toastService.error({
        title: 'Notification',
        message:
          permission === 'denied'
            ? 'Desktop alert diblokir browser. Aktifkan dari site settings.'
            : 'Desktop alert belum bisa diaktifkan.',
      });
    });
  }

  testDesktopNotification(): void {
    void this.notificationService.showTestDesktopNotification().then((result) => {
      if (result === 'browser-shown' || result === 'electron-shown') {
        this.toastService.success({
          title: 'Notification',
          message:
            result === 'browser-shown'
              ? 'Browser sudah memanggil desktop alert.'
              : 'Desktop app sudah memanggil desktop alert.',
        });
        return;
      }

      this.toastService.error({
        title: 'Notification',
        message:
          result === 'permission-denied'
            ? 'Permission browser belum granted.'
            : result === 'unsupported'
              ? 'Browser tidak mendukung desktop notification.'
              : 'Desktop alert gagal dipanggil.',
      });
    });
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
      this.desktopInstallMessage.set(
        'Jika download tidak mulai, pastikan installer tersedia di server.',
      );
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
    const userId = normalizeApiId(currentUser?.id);

    if (userId === null) {
      return;
    }

    this.http
      .get<UserResponse>(`${this.apiUrl}/users/${userId}`, {
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
    this.notificationService.getMine().subscribe({
      next: (response) => {
        this.notifications.set(response.map((item) => this.toViewNotification(item)));
      },
      error: () => {
        this.notifications.set([]);
      },
    });
  }

  private animateNotificationsIn(): void {
    const panel = this.notificationsPanel?.nativeElement;
    if (!panel) {
      return;
    }

    gsap.killTweensOf(panel);
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 10 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' },
    );
  }

  private animateNotificationsOut(): void {
    const panel = this.notificationsPanel?.nativeElement;
    if (!panel) {
      this.notificationsPanelVisible.set(false);
      return;
    }

    gsap.killTweensOf(panel);
    gsap.to(panel, {
      autoAlpha: 0,
      y: 10,
      duration: 0.18,
      ease: 'power2.inOut',
      onComplete: () => this.notificationsPanelVisible.set(false),
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
    const content = this.getNotificationContent(item);
    return {
      ...item,
      title: content.title,
      message: content.message,
      time: this.formatNotificationTime(item.created_at),
      tone: this.toBoolean(item.is_read) ? 'info' : 'warning',
    };
  }

  private getNotificationContent(item: NotificationItem): { title: string; message: string } {
    const fallbackTitle = item.title || 'Notification';
    const fallbackMessage = item.message || '';

    switch (item.type) {
      case 'task_created':
        return {
          title: item.title || 'Task baru',
          message: item.message || `Task #${item.task_id ?? '-'} baru dibuat.`,
        };
      case 'task_status_updated':
        return {
          title: item.title || 'Status task diperbarui',
          message: item.message || `Status task #${item.task_id ?? '-'} diperbarui.`,
        };
      case 'task_todo_created':
        return {
          title: item.title || 'Todo baru',
          message:
            item.message ||
            `Todo #${item.task_todo_id ?? '-'} ditambahkan ke task #${item.task_id ?? '-'}.`,
        };
      case 'manager_note_created':
        return {
          title: item.title || 'Manager note baru',
          message: item.message || `Manager note #${item.manager_note_id ?? '-'} baru dibuat.`,
        };
      default:
        return { title: fallbackTitle, message: fallbackMessage };
    }
  }

  private markNotificationAsRead(item: NotificationItem): void {
    if (!item.id || this.toBoolean(item.is_read)) {
      return;
    }

    this.notifications.update((items) =>
      items.map((notification) =>
        notification.id === item.id
          ? { ...notification, is_read: true, tone: 'info' }
          : notification,
      ),
    );

    this.notificationService.markAsRead(item.id).subscribe({
      error: () => {
        this.notifications.update((items) =>
          items.map((notification) =>
            notification.id === item.id
              ? { ...notification, is_read: item.is_read, tone: item.tone }
              : notification,
          ),
        );
      },
    });
  }

  private getNotificationRoute(
    item: NotificationItem,
  ): { path: unknown[]; queryParams: Record<string, string | number> } | null {
    if (item.type === 'manager_note_created' && item.manager_note_id) {
      return {
        path: ['/'],
        queryParams: { manager_note_id: item.manager_note_id },
      };
    }

    if (
      (item.type === 'task_created' ||
        item.type === 'task_status_updated' ||
        item.type === 'task_todo_created') &&
      item.task_id
    ) {
      return {
        path: ['/task/list'],
        queryParams: {
          task_id: item.task_id,
          ...(item.task_todo_id ? { task_todo_id: item.task_todo_id } : {}),
        },
      };
    }

    return null;
  }
}

type UserResponse =
  | AuthUser
  | {
      user?: AuthUser;
      data?: AuthUser | { user?: AuthUser };
    }
  | null;
