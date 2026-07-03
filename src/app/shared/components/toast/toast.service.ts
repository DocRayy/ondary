import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: number;
  type: ToastType;
  title: string;
  message: string;
}

export interface ApiToastResponse {
  title?: string;
  message?: string | string[];
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<ToastMessage[]>([]);

  success(response: unknown): void {
    const apiMessage = this.getApiMessage(response, 'Success');
    this.show('success', apiMessage.title, apiMessage.message);
  }

  error(response: unknown): void {
    const apiMessage = this.getApiMessage(response, 'Error');
    this.show('error', apiMessage.title, apiMessage.message);
  }

  errorFrom(error: unknown): void {
    this.error(this.getErrorSource(error));
  }

  remove(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  getErrorMessage(error: unknown, fallback: string): string {
    return this.getApiMessage(this.getErrorSource(error), 'Error', fallback).message;
  }

  getApiMessage(
    source: unknown,
    fallbackTitle: ToastType | 'Success' | 'Error',
    fallbackMessage = '',
  ) {
    const title =
      fallbackTitle === 'success' ? 'Success' : fallbackTitle === 'error' ? 'Error' : fallbackTitle;

    if (this.isRecord(source)) {
      const sourceTitle = source['title'] ?? source['__apiTitle'];
      const sourceMessage = source['message'] ?? source['__apiMessage'];

      if (
        typeof sourceTitle === 'string' ||
        typeof sourceMessage === 'string' ||
        Array.isArray(sourceMessage)
      ) {
        return {
          title: typeof sourceTitle === 'string' && sourceTitle.trim() ? sourceTitle : title,
          message: this.normalizeMessage(sourceMessage) || fallbackMessage || title,
        };
      }

      const data = source['data'];
      if (this.isRecord(data)) {
        const dataTitle = data['title'];
        const dataMessage = data['message'];
        if (
          typeof dataTitle === 'string' ||
          typeof dataMessage === 'string' ||
          Array.isArray(dataMessage)
        ) {
          return {
            title: typeof dataTitle === 'string' && dataTitle.trim() ? dataTitle : title,
            message: this.normalizeMessage(dataMessage) || fallbackMessage || title,
          };
        }
      }
    }

    return { title, message: fallbackMessage || title };
  }

  getErrorSource(error: unknown): unknown {
    if (this.isRecord(error) && error['error']) {
      return error['error'];
    }

    return error;
  }

  private show(type: ToastType, title: string, message: string): void {
    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts, { id, type, title, message }]);
  }

  private normalizeMessage(message: unknown): string {
    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return typeof message === 'string' ? message.trim() : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
  }
}
