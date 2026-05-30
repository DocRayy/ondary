import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
  inject,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import gsap from 'gsap';
import { AuthService } from '../../../core/auth/auth.service';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import { FcIconComponent } from '../../../shared/components/fc-icon/fc-icon.component';
import { IconDefinition } from '../../../shared/components/fc-icon/icon.constant';
import { GsapModalDirective } from '../../../shared/directives/gsap-modal.directive';

interface NavItem {
  label: string;
  icon: IconDefinition;
  route: string;
  menu: 'dashboard' | 'task' | 'timelog' | 'projects' | 'members' | 'reports';
  exact?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FcIconComponent, GsapModalDirective],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly permission = inject(RolePermissionService);
  @ViewChild('sidebarPanel') private sidebarPanel?: ElementRef<HTMLElement>;
  @ViewChildren('collapsibleLabel') private collapsibleLabels?: QueryList<ElementRef<HTMLElement>>;
  @Output() collapsedChange = new EventEmitter<boolean>();

  isLogoutDialogOpen = false;
  isCollapsed = false;

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'home-4-linear', route: '/', menu: 'dashboard', exact: true },
    { label: 'My Task', icon: 'cart-linear', route: '/task/list', menu: 'task' },
    { label: 'Timelog', icon: 'clock-linear', route: '/timelog', menu: 'timelog' },
    { label: 'Projects', icon: 'box-linear', route: '/projects/list', menu: 'projects' },
    { label: 'Team Members', icon: 'users-linear', route: '/members/list', menu: 'members' },
    { label: 'My Reports', icon: 'chart-linear', route: '/reports', menu: 'reports' },
  ];

  readonly visibleNavItems = this.navItems.filter((item) =>
    this.permission.canAccessMenu(item.menu),
  );

  ngAfterViewInit(): void {
    const panel = this.sidebarPanel?.nativeElement;
    if (!panel) {
      return;
    }

    gsap.set(panel, { width: this.isCollapsed ? 80 : 240 });
    gsap.set(this.getLabelElements(), {
      autoAlpha: this.isCollapsed ? 0 : 1,
      display: this.isCollapsed ? 'none' : 'inline',
      x: this.isCollapsed ? -8 : 0,
    });
  }

  toggleSidebar(): void {
    const panel = this.sidebarPanel?.nativeElement;
    const labels = this.getLabelElements();
    this.isCollapsed = !this.isCollapsed;
    this.collapsedChange.emit(this.isCollapsed);

    if (!panel) {
      return;
    }

    gsap.killTweensOf([panel, ...labels]);
    gsap.to(panel, {
      width: this.isCollapsed ? 80 : 240,
      duration: 0.32,
      ease: 'power2.inOut',
    });

    gsap.to(labels, {
      autoAlpha: this.isCollapsed ? 0 : 1,
      x: this.isCollapsed ? -8 : 0,
      duration: 0.18,
      ease: 'power2.out',
      stagger: this.isCollapsed ? 0 : 0.025,
      onStart: () => {
        if (!this.isCollapsed) {
          gsap.set(labels, { display: 'inline' });
        }
      },
      onComplete: () => {
        if (this.isCollapsed) {
          gsap.set(labels, { display: 'none' });
        }
      },
    });
  }

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

  private getLabelElements(): HTMLElement[] {
    return this.collapsibleLabels?.map((label) => label.nativeElement) ?? [];
  }
}
