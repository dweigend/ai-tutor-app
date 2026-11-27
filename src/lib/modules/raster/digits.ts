/**
 * Input logic of the DigitPad recipe (konzept M6): a number as the learner types it, as a string
 * with a decimal comma (`0,476`, `-24`). The string goes to the existing check rules unchanged.
 * Pure, so the rules are testable in Node.
 */
export type DigitKey =
	'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '±' | 'back';

export interface DigitOptions {
	/** Digits after the comma; 0 means whole numbers only (no comma key). */
	decimals: number;
	/** Whether the ± key exists. */
	signed: boolean;
	/** Upper bound for all digits together, so the readout never wraps. */
	maxDigits?: number;
}

const DEFAULT_MAX_DIGITS = 9;

/** The pad in reading order: 7 8 9 / 4 5 6 / 1 2 3 / ± 0 , */
export const PAD_KEYS: readonly DigitKey[] = [
	'7',
	'8',
	'9',
	'4',
	'5',
	'6',
	'1',
	'2',
	'3',
	'±',
	'0',
	','
];

/** False for keys the options rule out; the pad leaves their cell empty instead of greying it. */
export function keyExists(key: DigitKey, options: DigitOptions): boolean {
	if (key === ',') return options.decimals > 0;
	if (key === '±') return options.signed;
	return true;
}

/** Applies one key to the current text and returns the new text. Invalid keys change nothing. */
export function pressDigit(value: string, key: DigitKey, options: DigitOptions): string {
	if (!keyExists(key, options)) return value;
	const negative = value.startsWith('-');
	const body = negative ? value.slice(1) : value;
	const sign = negative ? '-' : '';
	switch (key) {
		case 'back':
			return value.slice(0, -1);
		case '±':
			return negative ? body : `-${body}`;
		case ',':
			if (body.includes(',')) return value;
			return `${sign}${body === '' ? '0' : body},`;
		default: {
			const digits = body.replace(',', '').length;
			if (digits >= (options.maxDigits ?? DEFAULT_MAX_DIGITS)) return value;
			const comma = body.indexOf(',');
			if (comma >= 0 && body.length - comma - 1 >= options.decimals) return value;
			// A leading zero gives way to the next digit: 0 → 5, not 05.
			if (body === '0') return `${sign}${key}`;
			return `${sign}${body}${key}`;
		}
	}
}

/** Maps a hardware key to a pad key: `.` is the comma, `-` and `+` toggle the sign. */
export function keyFromKeyboard(key: string): DigitKey | null {
	if (/^[0-9]$/.test(key)) return key as DigitKey;
	if (key === ',' || key === '.') return ',';
	if (key === '-' || key === '+' || key === '±') return '±';
	if (key === 'Backspace') return 'back';
	return null;
}

/** Cleans pasted text by replaying it key by key, so the same rules hold. */
export function normalizeDigits(text: string, options: DigitOptions): string {
	let value = '';
	for (const char of text.trim()) {
		const key = keyFromKeyboard(char);
		if (key === '±' && value !== '') continue;
		if (key && key !== 'back') value = pressDigit(value, key, options);
	}
	return value;
}
