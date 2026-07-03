import { environment } from '../../../environments/environment';

const allowedImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export function getApiMediaUrl(path?: string | null): string | null {
  const value = normalizeMediaPath(path);

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  return `${environment.API_URL}/${value.replace(/^\/+/, '')}`;
}

export function getFirstMediaUrl(
  record: unknown,
  keys = ['photo_url', 'photo', 'avatar', 'image', 'file_path', 'url'],
): string | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      const url = getApiMediaUrl(value);
      if (url) {
        return url;
      }
      continue;
    }

    if (value && typeof value === 'object') {
      const url = getFirstMediaUrl(value);
      if (url) {
        return url;
      }
    }
  }

  return null;
}

function normalizeMediaPath(path?: string | null): string {
  let value = String(path ?? '').trim();

  if (!value) {
    return '';
  }

  value = value.replace(/\\/g, '/');

  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  value = value.replace(/^\.\/+/, '').replace(/^public\/+/i, '');
  value = value.replace(/^storage\/app\/public\/+/i, 'storage/');

  const uploadIndex = value.toLowerCase().lastIndexOf('/uploads/');
  if (/^[a-z]:\//i.test(value) && uploadIndex >= 0) {
    value = value.slice(uploadIndex + 1);
  }

  const storageIndex = value.toLowerCase().lastIndexOf('/storage/');
  if (/^[a-z]:\//i.test(value) && storageIndex >= 0) {
    value = value.slice(storageIndex + 1);
  }

  return value;
}

export function isAllowedImageFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return file.type.startsWith('image/') && allowedImageExtensions.has(extension);
}

export function imageAcceptAttribute(): string {
  return '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif';
}
