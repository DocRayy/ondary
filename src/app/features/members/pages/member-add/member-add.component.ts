import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FcIconComponent } from '../../../../shared/components/fc-icon/fc-icon.component';
import { ImageCropperComponent } from '../../../../shared/components/image-cropper/image-cropper.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { imageAcceptAttribute, isAllowedImageFile } from '../../../../shared/utils/media';
import { MemberRecord, MemberService } from '../../service/member.service';

type MemberForm = Required<Pick<MemberRecord, 'username' | 'name' | 'email' | 'password' | 'role'>> & {
  photoFile: File | null;
  photoPreview: string;
};

@Component({
  selector: 'app-member-add',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FcIconComponent, ImageCropperComponent],
  templateUrl: './member-add.component.html',
})
export class MemberAddComponent {
  private readonly memberService = inject(MemberService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  readonly roles = ['member', 'manager', 'admin'];
  readonly imageAccept = imageAcceptAttribute();
  forms: MemberForm[] = [this.createForm()];
  isSubmitting = false;
  errorMessage = '';
  photoCropFile: File | null = null;
  private photoCropForm: MemberForm | null = null;

  addMore(): void {
    this.forms.push(this.createForm());
  }

  removeForm(index: number): void {
    if (this.forms.length === 1) {
      return;
    }

    const [removedForm] = this.forms.splice(index, 1);
    this.revokePreview(removedForm.photoPreview);
    if (this.photoCropForm === removedForm) {
      this.cancelPhotoCrop();
    }
  }

  submit(): void {
    if (this.isSubmitting || this.forms.some((form) => !this.isValidForm(form))) {
      this.errorMessage = 'Lengkapi semua username, email, password, dan role.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    forkJoin(
      this.forms.map((form) =>
        this.memberService.createUser(this.createUserFormData(form)),
      ),
    ).subscribe({
      next: (responses) => {
        this.isSubmitting = false;
        this.toastService.success(responses[responses.length - 1]);
        this.router.navigate(['/members/list']);
      },
      error: (error) => {
        this.errorMessage = this.toastService.getErrorMessage(error, '');
        this.toastService.errorFrom(error);
        this.isSubmitting = false;
      },
    });
  }

  trackForm(index: number): number {
    return index;
  }

  onPhotoChange(event: Event, form: MemberForm): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      form.photoFile = null;
      this.revokePreview(form.photoPreview);
      form.photoPreview = '';
      return;
    }

    if (!isAllowedImageFile(file)) {
      input.value = '';
      form.photoFile = null;
      this.photoCropFile = null;
      this.photoCropForm = null;
      this.revokePreview(form.photoPreview);
      form.photoPreview = '';
      this.errorMessage = 'Upload photo hanya boleh jpg, jpeg, png, webp, atau gif.';
      return;
    }

    input.value = '';
    this.photoCropFile = file;
    this.photoCropForm = form;
    this.errorMessage = '';
  }

  cancelPhotoCrop(): void {
    this.photoCropFile = null;
    this.photoCropForm = null;
  }

  applyPhotoCrop(file: File): void {
    if (!this.photoCropForm) {
      return;
    }

    this.revokePreview(this.photoCropForm.photoPreview);
    this.photoCropForm.photoFile = file;
    this.photoCropForm.photoPreview = URL.createObjectURL(file);
    this.photoCropFile = null;
    this.photoCropForm = null;
    this.errorMessage = '';
  }

  private createForm(): MemberForm {
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

  private isValidForm(form: MemberForm): boolean {
    return Boolean(form.username.trim() && form.name.trim() && form.email.trim() && form.password && form.role);
  }

  private createUserFormData(form: MemberForm): FormData {
    const formData = new FormData();
    formData.append('username', form.username.trim());
    formData.append('name', form.name.trim());
    formData.append('email', form.email.trim());
    formData.append('password', form.password);
    formData.append('role', form.role);

    if (form.photoFile) {
      formData.append('photo', form.photoFile);
    }

    return formData;
  }

  private revokePreview(preview: string): void {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  }
}
