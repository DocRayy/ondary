import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RolePermissionService } from '../../../core/auth/role-permission.service';
import { ConfirmationModalComponent } from '../../../shared/components/confirmation-modal/confirmation-modal.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { GsapModalDirective } from '../../../shared/directives/gsap-modal.directive';
import { getApiMediaUrl, imageAcceptAttribute, isAllowedImageFile } from '../../../shared/utils/media';
import { MemberRecord, MemberService } from '../service/member.service';
import { FcIconComponent } from "@app/shared/components/fc-icon/fc-icon.component";

type TeamMember = MemberRecord;
type EditMemberForm = {
  username: string;
  name: string;
  email: string;
  password: string;
  role: string;
  photoFile: File | null;
  photoPreview: string;
};

@Component({
  selector: 'app-team-members',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ConfirmationModalComponent, FcIconComponent, GsapModalDirective],
  templateUrl: './team-members.component.html',
})
export class TeamMembersComponent implements OnInit {
  private readonly memberService = inject(MemberService);
  private readonly permission = inject(RolePermissionService);
  private readonly toastService = inject(ToastService);

  readonly users = signal<TeamMember[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly searchTerm = signal('');
  readonly deletingId = signal<number | string | null>(null);
  readonly updatingId = signal<number | string | null>(null);
  readonly userPendingDelete = signal<TeamMember | null>(null);
  readonly editingUser = signal<TeamMember | null>(null);
  readonly canManageMembers = this.permission.canManageMembers();
  readonly totalUsers = computed(() => this.users().length);
  readonly imageAccept = imageAcceptAttribute();
  readonly roles = ['member', 'manager', 'admin'];
  editForm: EditMemberForm = this.createEditForm();

  readonly filteredUsers = computed(() => {
    const keyword = this.searchTerm().trim().toLowerCase();
    if (!keyword) {
      return this.users();
    }

    return this.users().filter((user) =>
      [user.name, user.username, user.email, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  reloadUsers(): void {
    this.loadUsers();
  }

  getUserName(user: TeamMember): string {
    return user.name || user.username || user.email || `User #${user.id}`;
  }

  getUserStatus(user: TeamMember): string {
    return user.status || 'Available';
  }

  getUserPhoto(user: TeamMember): string | null {
    return getApiMediaUrl(user.photo_url || user.photo || user.avatar || user.image);
  }

  openEditUser(user: TeamMember): void {
    if (!this.canManageMembers) {
      return;
    }

    this.editingUser.set(user);
    this.editForm = {
      username: user.username || '',
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'member',
      photoFile: null,
      photoPreview: this.getUserPhoto(user) || '',
    };
  }

  closeEditUser(): void {
    if (this.updatingId()) {
      return;
    }

    this.editingUser.set(null);
    this.editForm = this.createEditForm();
  }

  onEditPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.editForm.photoFile = null;
      this.editForm.photoPreview = this.editingUser() ? this.getUserPhoto(this.editingUser()!) || '' : '';
      return;
    }

    if (!isAllowedImageFile(file)) {
      input.value = '';
      this.editForm.photoFile = null;
      this.errorMessage.set('Upload photo hanya boleh jpg, jpeg, png, webp, atau gif.');
      return;
    }

    this.editForm.photoFile = file;
    this.editForm.photoPreview = URL.createObjectURL(file);
    this.errorMessage.set('');
  }

  submitEditUser(): void {
    const user = this.editingUser();
    if (!user?.id || !this.canManageMembers || this.updatingId()) {
      return;
    }

    if (!this.editForm.username.trim() || !this.editForm.name.trim() || !this.editForm.email.trim() || !this.editForm.role) {
      this.errorMessage.set('Lengkapi username, name, email, dan role.');
      return;
    }

    const formData = new FormData();
    formData.append('username', this.editForm.username.trim());
    formData.append('name', this.editForm.name.trim());
    formData.append('email', this.editForm.email.trim());
    formData.append('role', this.editForm.role);

    if (this.editForm.password) {
      formData.append('password', this.editForm.password);
    }

    if (this.editForm.photoFile) {
      formData.append('photo', this.editForm.photoFile);
    }

    this.updatingId.set(user.id);
    this.errorMessage.set('');

    this.memberService.updateUser(user.id, formData).subscribe({
      next: (response) => {
        this.users.update((users) =>
          users.map((item) => (String(item.id) === String(user.id) ? { ...item, ...response } : item)),
        );
        this.toastService.success(response);
        this.updatingId.set(null);
        this.closeEditUser();
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.updatingId.set(null);
        this.toastService.errorFrom(error);
      },
    });
  }

  private loadUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.memberService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users as TeamMember[]);
        this.isLoading.set(false);
      },
      error: () => {
        this.users.set([]);
        this.errorMessage.set('Failed to load team members.');
        this.isLoading.set(false);
      },
    });
  }

  private createEditForm(): EditMemberForm {
    return {
      username: '',
      name: '',
      email: '',
      password: '',
      role: 'member',
      photoFile: null,
      photoPreview: '',
    };
  }

  deleteUser(user: TeamMember): void {
    if (!user.id || !this.canManageMembers || this.deletingId()) {
      return;
    }

    this.userPendingDelete.set(user);
  }

  closeDeleteDialog(): void {
    if (this.deletingId()) {
      return;
    }

    this.userPendingDelete.set(null);
  }

  confirmDeleteUser(): void {
    const user = this.userPendingDelete();
    if (!user?.id || !this.canManageMembers) {
      return;
    }

    this.deletingId.set(user.id);
    this.errorMessage.set('');

    this.memberService.deleteUser(user.id).subscribe({
      next: (response) => {
        this.users.update((users) => users.filter((item) => String(item.id) !== String(user.id)));
        this.deletingId.set(null);
        this.userPendingDelete.set(null);
        this.toastService.success(response);
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.deletingId.set(null);
        this.toastService.errorFrom(error);
      },
    });
  }
}
