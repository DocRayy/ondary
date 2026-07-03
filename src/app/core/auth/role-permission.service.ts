import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export type UserRole = 'member' | 'admin' | 'manager';
export type AppMenu =
  | 'dashboard'
  | 'task'
  | 'timelog'
  | 'projects'
  | 'members'
  | 'reports'
  | 'audit-log'
  | 'backup-restore';

@Injectable({
  providedIn: 'root',
})
export class RolePermissionService {
  private readonly authService = inject(AuthService);

  getRole(): UserRole {
    const role = (this.authService.getUser()?.role || 'member').toLowerCase().trim();
    return role === 'admin' || role === 'manager' ? role : 'member';
  }

  hasRole(roles: UserRole[]): boolean {
    return roles.includes(this.getRole());
  }

  isMember(): boolean {
    return this.getRole() === 'member';
  }

  isAdmin(): boolean {
    return this.getRole() === 'admin';
  }

  isManager(): boolean {
    return this.getRole() === 'manager';
  }

  canAccessMenu(menu: AppMenu): boolean {
    const role = this.getRole();

    if (role === 'manager') {
      return ['dashboard', 'task', 'timelog', 'projects', 'members', 'reports'].includes(menu);
    }

    if (role === 'admin') {
      return ['members', 'audit-log', 'backup-restore'].includes(menu);
    }

    return ['dashboard', 'task', 'timelog', 'members', 'reports'].includes(menu);
  }

  getDefaultRoute(): string {
    return this.isAdmin() ? '/members/list' : '/';
  }

  canManageMembers(): boolean {
    return this.isAdmin() || this.isManager();
  }

  canManageProjects(): boolean {
    return this.isManager();
  }

  canManageManagerNotes(): boolean {
    return this.isManager();
  }
}
