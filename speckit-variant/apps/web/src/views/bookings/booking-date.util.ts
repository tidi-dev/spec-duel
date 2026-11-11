const pad = (value: number): string => String(value).padStart(2, '0');

export const toUtcIso = (localInputValue: string): string => new Date(localInputValue).toISOString();

export const toLocalInputValue = (iso: string): string => {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatDateTime = (iso: string): string => new Date(iso).toLocaleString();
