import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const confusables = {
  'а': 'a', 'А': 'a', 'ɑ': 'a', 'Α': 'a', 'α': 'a',
  'Ь': 'b', 'Β': 'b', 'в': 'b', 'ϲ': 'c', 'с': 'c', 'С': 'c',
  'ԁ': 'd', 'е': 'e', 'Е': 'e', 'Ε': 'e', 'ε': 'e',
  'ғ': 'f', 'һ': 'h', 'Η': 'h', 'і': 'i', 'І': 'i', 'Ι': 'i', 'ι': 'i',
  'ј': 'j', 'Ј': 'j', 'κ': 'k', 'Κ': 'k', 'к': 'k',
  'ӏ': 'l', 'ⅼ': 'l', 'Μ': 'm', 'м': 'm', 'Ν': 'n',
  'о': 'o', 'О': 'o', 'Ο': 'o', 'ο': 'o', 'р': 'p', 'Р': 'p', 'Ρ': 'p',
  'ѕ': 's', 'Ѕ': 's', 'Т': 't', 'τ': 't', 'υ': 'u', 'ν': 'v',
  'х': 'x', 'Х': 'x', 'Χ': 'x', 'χ': 'x', 'у': 'y', 'Υ': 'y', 'Ζ': 'z',
};

export class ValidationError extends Error {
  constructor(message, code = 'invalid_text') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 400;
  }
}

export function moderationForms(text) {
  const normalized = text.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/[\u0400-\u052F\u0370-\u03FF\u0251\u217C]/g, char => confusables[char] || char)
    .toLowerCase();
  const leet = normalized.replace(/[013457@$!|+]/g, char =>
    ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' })[char]);
  // Decode letter substitutes before joining deliberately separated letters.
  // Normal words retain their spaces to avoid creating unrelated matches.
  const joinedLetters = leet.replace(/(?:\b[a-z]\b[\s._*\-]*){3,}/g,
    sequence => sequence.replace(/[^a-z]/g, ''));
  return [text, normalized, leet, joinedLetters];
}

export function validatePublicText(value, { label, min = 1, max = 48 } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${label || 'Text'} is required.`);
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const length = [...text].length;
  if (length < min || length > max) {
    throw new ValidationError(`${label || 'Text'} must be ${min}–${max} characters.`);
  }
  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.test(text)) {
    throw new ValidationError(`${label || 'Text'} must contain visible text only.`);
  }
  if (!/[\p{L}\p{N}]/u.test(text)) throw new ValidationError(`${label || 'Text'} needs a letter or number.`);
  const maskedProfanity = /\bf[\s._-]*[*#?]{1,3}[\s._-]*c?[\s._-]*k(?:ing|er|ers|s)?\b/i;
  if (maskedProfanity.test(text) || moderationForms(text).some(form => matcher.hasMatch(form))) {
    throw new ValidationError('Keep it spooky, not profane. Please choose different words.', 'profanity');
  }
  return text;
}
