const INPUT_VALUE_LENGTH = 'YYYY-MM-DDTHH:mm'.length;

export const isoToInputValue = (iso: string): string => new Date(iso).toISOString().slice(0, INPUT_VALUE_LENGTH);

export const formatUtcDateTime = (iso: string): string => isoToInputValue(iso).replace('T', ' ');

export const inputValueToIsoUtc = (inputValue: string): string => new Date(`${inputValue}Z`).toISOString();

export const isEndAfterStart = (endsAtInputValue: string, startsAtInputValue: string): boolean =>
  Date.parse(`${endsAtInputValue}Z`) > Date.parse(`${startsAtInputValue}Z`);
