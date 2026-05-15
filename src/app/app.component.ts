import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrimeNG } from 'primeng/config';
import { NotificationService } from './core/notifications/notification.service';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
  `,
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  private primeng = inject(PrimeNG);
  private readonly notificationService = inject(NotificationService);

  title = 'ondary';

  ngOnInit(): void {
    this.notificationService.connect();
  }
}
