import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
import { FcIconComponent } from '../fc-icon/fc-icon.component';

export type DropdownSelectValue = string | number | null;

export interface DropdownSelectOption {
  value: DropdownSelectValue;
  label: string;
  imageUrl?: string;
  initial?: string;
}

@Component({
  selector: 'app-dropdown-select',
  standalone: true,
  imports: [CommonModule, FcIconComponent],
  templateUrl: './dropdown-select.component.html',
})
export class DropdownSelectComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @Input() options: DropdownSelectOption[] = [];
  @Input() value: DropdownSelectValue = null;
  @Input() ariaLabel = 'Select option';
  @Input() loading = false;
  @Input() loadingLabel = 'Loading...';
  @Input() emptyLabel = 'No options found.';
  @Input() showAvatar = false;
  @Input() buttonClass =
    'flex h-10 w-full items-center justify-between gap-2 rounded-full border border-tertiary-200 bg-tertiary-100 px-4 text-left text-sm font-semibold text-tertiary-800 outline-none transition hover:border-tertiary-300';
  @Input() menuClass =
    'absolute left-0 z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl bg-[#1E293B] p-2 text-sm text-white shadow-xl';

  @Output() valueChange = new EventEmitter<DropdownSelectValue>();

  isOpen = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
    }
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  select(option: DropdownSelectOption, event: MouseEvent): void {
    event.stopPropagation();
    this.value = option.value;
    this.isOpen = false;
    this.valueChange.emit(option.value);
  }

  get selectedOption(): DropdownSelectOption {
    return (
      this.options.find((option) => this.isSameValue(option.value, this.value)) ||
      this.options[0] || {
        value: null,
        label: '-',
      }
    );
  }

  getOptionInitial(option: DropdownSelectOption): string {
    return option.initial || option.label.trim().slice(0, 1).toUpperCase() || '?';
  }

  isSelected(option: DropdownSelectOption): boolean {
    return this.isSameValue(option.value, this.value);
  }

  trackOptionByValue(index: number, option: DropdownSelectOption): string {
    return `${option.value ?? 'null'}-${option.label}-${index}`;
  }

  private isSameValue(first: DropdownSelectValue, second: DropdownSelectValue): boolean {
    if (first === null || first === undefined || second === null || second === undefined) {
      return first === second;
    }

    return String(first) === String(second);
  }
}
