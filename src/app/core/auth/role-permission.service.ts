import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export type UserRole = 'member' | 'admin' | 'manager';

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

  canAccessMenu(
    menu: 'dashboard' | 'task' | 'timelog' | 'projects' | 'members' | 'reports',
  ): boolean {
    const role = this.getRole();

    if (role === 'manager') {
      return true;
    }

    if (role === 'admin') {
      return menu === 'dashboard' || menu === 'members';
    }

    return ['dashboard', 'task', 'timelog', 'members', 'reports'].includes(menu);
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
