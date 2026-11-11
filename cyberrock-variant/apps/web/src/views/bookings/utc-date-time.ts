const MINUTE_LENGTH = 'YYYY-MM-DDTHH:mm'.length;

export const parseUtcInput = (value: string): number => Date.parse(`${value}Z`);

export const utcInputToIso = (value: string): string => new Date(parseUtcInput(value)).toISOString();

export const isoToUtcInput = (iso: string): string => new Date(iso).toISOString().slice(0, MINUTE_LENGTH);

export const formatUtc = (iso: string): string => `${isoToUtcInput(iso).replace('T', ' ')} UTC`;
