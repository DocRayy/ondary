import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Subject } from 'rxjs';
import { ActiveTimelogService } from '../features/timelog/service/active-timelog.service';
import { ImageCropperComponent } from '../shared/components/image-cropper/image-cropper.component';
import { ToastService } from '../shared/components/toast/toast.service';
import { GsapModalDirective } from '../shared/directives/gsap-modal.directive';
import { imageAcceptAttribute, isAllowedImageFile } from '../shared/utils/media';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    HeaderComponent,
    SidebarComponent,
    GsapModalDirective,
    ImageCropperComponent,
  ],
})
export class LayoutComponent implements OnInit {
  readonly activeTimelogService = inject(ActiveTimelogService);
  private readonly toastService = inject(ToastService);
  @ViewChild('sidebar') private sidebar?: SidebarComponent;
  private $destroy = new Subject<void>();
  isSidebarCollapsed = false;
  endNote = '';
  endPhotoFile: File | null = null;
  endPhotoPreview = '';
  endFileError = '';
  endCropFile: File | null = null;
  readonly imageAccept = imageAcceptAttribute();

  ngOnInit(): void {
    this.activeTimelogService.loadActiveTimelog();
  }

  endActiveTimelog(): void {
    this.activeTimelogService.openEndDialog();
  }

  toggleSidebar(): void {
    this.sidebar?.toggleSidebar();
  }

  onEndPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.endPhotoFile = null;
      this.endPhotoPreview = '';
      this.endFileError = '';
      this.endCropFile = null;
      return;
    }

    if (!isAllowedImageFile(file)) {
      input.value = '';
      this.endPhotoFile = null;
      this.endPhotoPreview = '';
      this.endCropFile = null;
      this.endFileError = 'Upload file hanya boleh gambar jpg, jpeg, png, webp, atau gif.';
      return;
    }

    input.value = '';
    this.endCropFile = file;
    this.endFileError = '';
  }

  cancelEndPhotoCrop(): void {
    this.endCropFile = null;
  }

  applyEndPhotoCrop(file: File): void {
    this.revokePreview(this.endPhotoPreview);
    this.endPhotoFile = file;
    this.endPhotoPreview = URL.createObjectURL(file);
    this.endCropFile = null;
    this.endFileError = '';
  }

  submitEndTimelog(status: 'pause' | 'finish'): void {
    if (this.endFileError) {
      return;
    }

    this.activeTimelogService.endActiveTimelog(status, this.endNote, this.endPhotoFile)?.subscribe({
      next: (response) => {
        this.resetEndForm();
        this.toastService.success(response);
      },
      error: (error) => this.toastService.errorFrom(error),
    });
  }

  closeEndDialog(): void {
    if (this.activeTimelogService.isEnding()) {
      return;
    }

    this.activeTimelogService.closeEndDialog();
    this.resetEndForm();
  }

  private resetEndForm(): void {
    this.endNote = '';
    this.endPhotoFile = null;
    this.endCropFile = null;
    this.revokePreview(this.endPhotoPreview);
    this.endPhotoPreview = '';
    this.endFileError = '';
  }

  private revokePreview(preview: string): void {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  }

  ngOnDestroy() {
    this.$destroy.next();
    this.$destroy.complete();
  }
}
