import { environment } from '../../../environments/environment';

const allowedImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export function getApiMediaUrl(path?: string | null): string | null {
  const value = path?.trim();

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  return `${environment.API_URL}/${value.replace(/^\/+/, '')}`;
}

export function isAllowedImageFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return file.type.startsWith('image/') && allowedImageExtensions.has(extension);
}

export function imageAcceptAttribute(): string {
  return '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif';
}
