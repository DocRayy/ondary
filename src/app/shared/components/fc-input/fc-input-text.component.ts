import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'fc-input-text',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fc-input-text.component.html',
  styleUrls: ['./fc-input-text.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FcInputTextComponent),
      multi: true,
    },
  ],
})
export class FcInputTextComponent implements ControlValueAccessor {
  @Input() label: string = '';
  @Input() type: string = 'text';
  @Input() id: string = '';
  @Input() name: string = '';
  @Input() placeholder: string = '';
  @Input() disabled: boolean = false;

  value: string = '';
  isFocused: boolean = false;

  onChange = (value: any) => {};
  onTouched = () => {};

  writeValue(value: any): void {
    this.value = value;
  }
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: any) {
    this.value = event.target.value;
    this.onChange(this.value);
  }
}
