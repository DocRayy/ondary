import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { FcIconComponent } from '../../../../shared/components/fc-icon/fc-icon.component';
import { ConfirmationModalComponent } from '../../../../shared/components/confirmation-modal/confirmation-modal.component';
import { ImageCropperComponent } from '../../../../shared/components/image-cropper/image-cropper.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { GsapModalDirective } from '../../../../shared/directives/gsap-modal.directive';
import {
  getFirstMediaUrl,
  imageAcceptAttribute,
  isAllowedImageFile,
} from '../../../../shared/utils/media';
import { ProjectRecord } from '../../schema/project.schema';
import { ProjectService } from '../../service/project.service';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FcIconComponent,
    ConfirmationModalComponent,
    GsapModalDirective,
    ImageCropperComponent,
  ],
  templateUrl: './project-list.component.html',
})
export class ProjectListComponent implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly toastService = inject(ToastService);

  readonly projects = signal<ProjectRecord[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly selectedProject = signal<ProjectRecord | null>(null);
  readonly isProjectFormOpen = signal(false);
  readonly savingProject = signal(false);
  readonly deletingProjectId = signal<number | string | null>(null);
  readonly editingProject = signal<ProjectRecord | null>(null);
  readonly projectPendingDelete = signal<ProjectRecord | null>(null);
  formLabel = '';
  formDescription = '';
  formPhotoFile: File | null = null;
  formPhotoPreview = '';
  formCropFile: File | null = null;
  readonly imageAccept = imageAcceptAttribute();

  readonly totalProjects = computed(() => this.projects().length);

  ngOnInit(): void {
    this.loadProjects();
  }

  reloadProjects(): void {
    this.loadProjects();
  }

  openProjectDetail(project: ProjectRecord): void {
    this.selectedProject.set(project);
    this.realtimeService.joinProject(project.id);
  }

  closeProjectDetail(): void {
    this.selectedProject.set(null);
  }

  openCreateProject(): void {
    this.editingProject.set(null);
    this.formLabel = '';
    this.formDescription = '';
    this.formPhotoFile = null;
    this.formCropFile = null;
    this.revokePreview(this.formPhotoPreview);
    this.formPhotoPreview = '';
    this.isProjectFormOpen.set(true);
  }

  openEditProject(project: ProjectRecord): void {
    this.selectedProject.set(null);
    this.editingProject.set(project);
    this.formLabel = project.label || project.name || '';
    this.formDescription = project.description || '';
    this.formPhotoFile = null;
    this.formCropFile = null;
    this.revokePreview(this.formPhotoPreview);
    this.formPhotoPreview = this.getProjectPhoto(project) || '';
    this.isProjectFormOpen.set(true);
  }

  closeProjectForm(): void {
    this.isProjectFormOpen.set(false);
    this.editingProject.set(null);
    this.formLabel = '';
    this.formDescription = '';
    this.formPhotoFile = null;
    this.formCropFile = null;
    this.revokePreview(this.formPhotoPreview);
    this.formPhotoPreview = '';
  }

  onProjectPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.formPhotoFile = null;
      this.formPhotoPreview = this.editingProject()
        ? this.getProjectPhoto(this.editingProject()!) || ''
        : '';
      this.formCropFile = null;
      return;
    }

    if (!isAllowedImageFile(file)) {
      input.value = '';
      this.formPhotoFile = null;
      this.formCropFile = null;
      this.errorMessage.set('Photo upload only supports jpg, jpeg, png, webp, or gif.');
      return;
    }

    input.value = '';
    this.formCropFile = file;
    this.errorMessage.set('');
  }

  cancelProjectPhotoCrop(): void {
    this.formCropFile = null;
  }

  applyProjectPhotoCrop(file: File): void {
    this.revokePreview(this.formPhotoPreview);
    this.formPhotoFile = file;
    this.formPhotoPreview = URL.createObjectURL(file);
    this.formCropFile = null;
    this.errorMessage.set('');
  }

  saveProject(): void {
    const label = this.formLabel.trim();
    if (!label) {
      this.errorMessage.set('Project name is required.');
      return;
    }

    const duplicateProject = this.projects().some(
      (project) =>
        String(project.id) !== String(this.editingProject()?.id) &&
        this.getProjectLabel(project).trim().toLowerCase() === label.toLowerCase(),
    );
    if (duplicateProject) {
      this.errorMessage.set('Project name is already available.');
      return;
    }

    const editingProject = this.editingProject();
    const payload = this.createProjectFormData(label);

    this.savingProject.set(true);
    this.errorMessage.set('');

    const request = editingProject?.id
      ? this.projectService.updateProject(editingProject.id, payload)
      : this.projectService.createProject(payload);

    request.subscribe({
      next: (response) => {
        this.savingProject.set(false);
        this.closeProjectForm();
        this.loadProjects();
        this.toastService.success(response);
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.toastService.errorFrom(error);
        this.savingProject.set(false);
      },
    });
  }

  deleteProject(project: ProjectRecord): void {
    if (!project.id || this.deletingProjectId()) {
      return;
    }

    this.projectPendingDelete.set(project);
  }

  closeDeleteDialog(): void {
    if (this.deletingProjectId()) {
      return;
    }

    this.projectPendingDelete.set(null);
  }

  confirmDeleteProject(): void {
    const project = this.projectPendingDelete();
    if (!project?.id) {
      return;
    }

    this.deletingProjectId.set(project.id);

    this.projectService.deleteProject(project.id).subscribe({
      next: (response) => {
        this.projects.update((projects) =>
          projects.filter((item) => String(item.id) !== String(project.id)),
        );
        this.closeProjectDetail();
        this.projectPendingDelete.set(null);
        this.deletingProjectId.set(null);
        this.toastService.success(response);
      },
      error: (error) => {
        const message = this.toastService.getErrorMessage(error, '');
        this.errorMessage.set(message);
        this.deletingProjectId.set(null);
        this.toastService.errorFrom(error);
      },
    });
  }

  getProjectLabel(project: ProjectRecord): string {
    return project.label || project.name || `Project #${project.id ?? '-'}`;
  }

  getProjectDescription(project: ProjectRecord): string {
    return project.description?.trim() || 'Project description';
  }

  getProjectPhoto(project: ProjectRecord): string | null {
    return getFirstMediaUrl(project);
  }

  getProjectTaskCount(project: ProjectRecord): number {
    if (Array.isArray(project.task_id)) {
      return project.task_id.length;
    }

    if (Array.isArray(project.tasks)) {
      return project.tasks.length;
    }

    return 0;
  }

  getProjectDate(project: ProjectRecord): string {
    const sourceDate = project.created_at;

    if (!sourceDate) {
      return '-';
    }

    const date = new Date(sourceDate);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private loadProjects(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.isLoading.set(false);
      },
      error: () => {
        this.projects.set([]);
        this.errorMessage.set('Failed to load projects.');
        this.isLoading.set(false);
      },
    });
  }

  private createProjectFormData(label: string): FormData {
    const formData = new FormData();
    formData.append('label', label);
    formData.append('description', this.formDescription.trim());

    const userId = this.authService.getUser()?.id;
    if (userId !== undefined && userId !== null) {
      formData.append('user_id', String(userId));
    }

    if (this.formPhotoFile) {
      formData.append('photo', this.formPhotoFile);
    }

    return formData;
  }

  private revokePreview(preview: string): void {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  }
}
