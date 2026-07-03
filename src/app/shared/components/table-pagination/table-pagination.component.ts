import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  DropdownSelectComponent,
  DropdownSelectOption,
  DropdownSelectValue,
} from '../dropdown-select/dropdown-select.component';
import { FcIconComponent } from '../fc-icon/fc-icon.component';

export interface TablePaginationMeta {
  total: number;
  page: number;
  limit: number;
  page_count: number;
  limit_options?: number[];
}

@Component({
  selector: 'app-table-pagination',
  standalone: true,
  imports: [CommonModule, DropdownSelectComponent, FcIconComponent],
  templateUrl: './table-pagination.component.html',
})
export class TablePaginationComponent {
  @Input({ required: true }) meta!: TablePaginationMeta;
  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();

  readonly defaultLimitOptions = [10, 25, 50, 100];

  get limitOptions(): DropdownSelectOption[] {
    const options = this.meta?.limit_options?.length
      ? this.meta.limit_options
      : this.defaultLimitOptions;

    return options.map((limit) => ({
      value: limit,
      label: `${limit} / page`,
    }));
  }

  get pages(): number[] {
    const pageCount = Math.max(1, Number(this.meta?.page_count || 1));
    const currentPage = Math.min(Math.max(1, Number(this.meta?.page || 1)), pageCount);
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(pageCount, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }

  get isFirstPage(): boolean {
    return Number(this.meta?.page || 1) <= 1;
  }

  get isLastPage(): boolean {
    return Number(this.meta?.page || 1) >= Math.max(1, Number(this.meta?.page_count || 1));
  }

  selectLimit(value: DropdownSelectValue): void {
    const limit = Number(value);
    if (Number.isInteger(limit) && limit > 0 && limit !== this.meta.limit) {
      this.limitChange.emit(limit);
    }
  }

  goToPage(page: number): void {
    const pageCount = Math.max(1, Number(this.meta?.page_count || 1));
    const nextPage = Math.min(Math.max(1, page), pageCount);
    if (nextPage !== this.meta.page) {
      this.pageChange.emit(nextPage);
    }
  }
}
