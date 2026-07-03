import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrimeNG } from 'primeng/config';
import { NotificationService } from './core/notifications/notification.service';
import { RealtimeService } from './core/realtime/realtime.service';
import { AuthTransitionOverlayComponent } from './shared/components/auth-transition/auth-transition-overlay.component';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, AuthTransitionOverlayComponent],
  template: `
    <router-outlet></router-outlet>
    <app-auth-transition-overlay></app-auth-transition-overlay>
    <app-toast-container></app-toast-container>
  `,
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  private primeng = inject(PrimeNG);
  private readonly notificationService = inject(NotificationService);
  private readonly realtimeService = inject(RealtimeService);

  title = 'ondary';

  ngOnInit(): void {
    this.notificationService.connect();
    this.realtimeService.connect();
  }
}
