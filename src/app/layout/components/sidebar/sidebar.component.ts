import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import { GsapModalDirective } from '../../../shared/directives/gsap-modal.directive';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  menu: 'dashboard' | 'task' | 'timelog' | 'projects' | 'members' | 'reports';
  exact?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, GsapModalDirective],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  isLogoutDialogOpen = false;

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'grid', route: '/', menu: 'dashboard', exact: true },
    { label: 'My Task', icon: 'cart', route: '/task/list', menu: 'task' },
    { label: 'Timelog', icon: 'users', route: '/timelog', menu: 'timelog' },
    { label: 'Projects', icon: 'box', route: '/projects/list', menu: 'projects' },
    { label: 'Team Members', icon: 'users', route: '/members/list', menu: 'members' },
    { label: 'My Reports', icon: 'chart', route: '/reports', menu: 'reports' },
  ];

  readonly visibleNavItems = this.navItems.filter((item) =>
    this.permission.canAccessMenu(item.menu),
  );

  openLogoutDialog(): void {
    this.isLogoutDialogOpen = true;
  }

  closeLogoutDialog(): void {
    this.isLogoutDialogOpen = false;
  }

  confirmLogout(): void {
    this.isLogoutDialogOpen = false;
    this.authService.logout();
  }
}
