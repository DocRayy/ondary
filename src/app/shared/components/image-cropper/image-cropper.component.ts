import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GsapModalDirective } from '../../directives/gsap-modal.directive';

@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [CommonModule, FormsModule, GsapModalDirective],
  template: `
    <div
      *ngIf="visible && imageSrc"
      appGsapModal
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      role="presentation"
      (click)="cancelCrop()"
    >
      <section
        class="w-[min(520px,calc(100vw-32px))] rounded-xl bg-white p-5 text-black shadow-2xl"
        role="dialog"
        aria-modal="true"
        (click)="$event.stopPropagation()"
      >
        <header class="flex items-center justify-between gap-4">
          <h2 class="text-base font-extrabold">{{ title }}</h2>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-full bg-[#d9d9d9] text-xs font-bold text-black"
            aria-label="Close crop image"
            (click)="cancelCrop()"
          >
            X
          </button>
        </header>

        <div
          #cropBox
          class="relative mx-auto mt-5 aspect-square w-full max-w-[360px] touch-none overflow-hidden rounded-md bg-neutral-900"
          (pointerdown)="startDrag($event)"
          (pointermove)="drag($event)"
          (pointerup)="endDrag($event)"
          (pointercancel)="endDrag($event)"
          (pointerleave)="endDrag($event)"
        >
          <img
            #imageElement
            [src]="imageSrc"
            alt="Image crop preview"
            class="absolute left-1/2 top-1/2 max-w-none select-none"
            draggable="false"
            [style.width.px]="displayWidth"
            [style.height.px]="displayHeight"
            [style.transform]="imageTransform"
            (load)="handleImageLoad()"
          />
          <div class="pointer-events-none absolute inset-0 border-2 border-white/95"></div>
          <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            <span class="border-r border-b border-white/45"></span>
            <span class="border-r border-b border-white/45"></span>
            <span class="border-b border-white/45"></span>
            <span class="border-r border-b border-white/45"></span>
            <span class="border-r border-b border-white/45"></span>
            <span class="border-b border-white/45"></span>
            <span class="border-r border-white/45"></span>
            <span class="border-r border-white/45"></span>
            <span></span>
          </div>
        </div>

        <label class="mt-4 block text-xs font-bold text-black">
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            [(ngModel)]="zoom"
            (ngModelChange)="updateImageSize()"
            class="mt-2 w-full accent-tertiary-600"
          />
        </label>

        <div class="mt-5 flex justify-end gap-3">
          <button
            type="button"
            class="h-10 rounded-md bg-neutral-100 px-5 text-xs font-bold text-black transition hover:bg-neutral-200"
            (click)="cancelCrop()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-10 rounded-md bg-tertiary-600 px-5 text-xs font-bold text-white transition hover:bg-tertiary-700"
            (click)="applyCrop()"
          >
            Crop
          </button>
        </div>
      </section>
    </div>
  `,
})
export class ImageCropperComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() visible = false;
  @Input() file: File | null = null;
  @Input() title = 'Crop Image';
  @Input() outputSize = 720;
  @Output() cancel = new EventEmitter<void>();
  @Output() cropped = new EventEmitter<File>();

  @ViewChild('cropBox') cropBox?: ElementRef<HTMLDivElement>;
  @ViewChild('imageElement') imageElement?: ElementRef<HTMLImageElement>;

  imageSrc = '';
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  displayWidth = 0;
  displayHeight = 0;

  private objectUrl = '';
  private naturalWidth = 0;
  private naturalHeight = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private startOffsetX = 0;
  private startOffsetY = 0;

  get imageTransform(): string {
    return `translate(calc(-50% + ${this.offsetX}px), calc(-50% + ${this.offsetY}px))`;
  }

  ngAfterViewInit(): void {
    this.updateImageSize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file']) {
      this.loadFile();
    }
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  handleImageLoad(): void {
    const image = this.imageElement?.nativeElement;
    if (!image) {
      return;
    }

    this.naturalWidth = image.naturalWidth;
    this.naturalHeight = image.naturalHeight;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateImageSize();
  }

  startDrag(event: PointerEvent): void {
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.startOffsetX = this.offsetX;
    this.startOffsetY = this.offsetY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  drag(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }

    this.offsetX = this.startOffsetX + event.clientX - this.dragStartX;
    this.offsetY = this.startOffsetY + event.clientY - this.dragStartY;
    this.constrainOffset();
  }

  endDrag(event: PointerEvent): void {
    this.isDragging = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  updateImageSize(): void {
    const box = this.cropBox?.nativeElement;
    if (!box || !this.naturalWidth || !this.naturalHeight) {
      return;
    }

    const boxWidth = box.clientWidth;
    const boxHeight = box.clientHeight;
    const baseScale = Math.max(boxWidth / this.naturalWidth, boxHeight / this.naturalHeight);
    this.displayWidth = this.naturalWidth * baseScale * Number(this.zoom);
    this.displayHeight = this.naturalHeight * baseScale * Number(this.zoom);
    this.constrainOffset();
  }

  applyCrop(): void {
    const box = this.cropBox?.nativeElement;
    if (!box || !this.file || !this.naturalWidth || !this.naturalHeight) {
      return;
    }

    const outputSize = Math.max(120, this.outputSize);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext('2d');
    const image = this.imageElement?.nativeElement;
    if (!context || !image) {
      return;
    }

    const boxWidth = box.clientWidth;
    const boxHeight = box.clientHeight;
    const baseScale = Math.max(boxWidth / this.naturalWidth, boxHeight / this.naturalHeight);
    const scale = baseScale * Number(this.zoom);
    const imageLeft = boxWidth / 2 + this.offsetX - this.displayWidth / 2;
    const imageTop = boxHeight / 2 + this.offsetY - this.displayHeight / 2;
    const sourceX = Math.max(0, -imageLeft / scale);
    const sourceY = Math.max(0, -imageTop / scale);
    const sourceSize = Math.min(boxWidth / scale, this.naturalWidth - sourceX, this.naturalHeight - sourceY);

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    const mimeType = this.getOutputType();
    canvas.toBlob((blob) => {
      if (!blob || !this.file) {
        return;
      }

      this.cropped.emit(new File([blob], this.getOutputName(mimeType), { type: mimeType }));
    }, mimeType, 0.92);
  }

  cancelCrop(): void {
    this.cancel.emit();
  }

  private loadFile(): void {
    this.revokeObjectUrl();
    this.imageSrc = '';
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    if (!this.file) {
      return;
    }

    this.objectUrl = URL.createObjectURL(this.file);
    this.imageSrc = this.objectUrl;
  }

  private constrainOffset(): void {
    const box = this.cropBox?.nativeElement;
    if (!box) {
      return;
    }

    const maxX = Math.max(0, (this.displayWidth - box.clientWidth) / 2);
    const maxY = Math.max(0, (this.displayHeight - box.clientHeight) / 2);
    this.offsetX = Math.min(maxX, Math.max(-maxX, this.offsetX));
    this.offsetY = Math.min(maxY, Math.max(-maxY, this.offsetY));
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }
  }

  private getOutputType(): string {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(this.file?.type || '')
      ? this.file!.type
      : 'image/png';
  }

  private getOutputName(mimeType: string): string {
    const extension = mimeType.split('/')[1] || 'png';
    const name = this.file?.name.replace(/\.[^.]+$/, '') || 'cropped-image';
    return `${name}-cropped.${extension === 'jpeg' ? 'jpg' : extension}`;
  }
}
