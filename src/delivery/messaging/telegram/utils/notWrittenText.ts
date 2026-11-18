import { RU } from '../i18n/ru';
import { itemName, quoted } from '../formatters/recordMessage';
import { NotWrittenItem } from '../../../../modules/voiceProcessing/domain/processedTransaction';

/** One record refused for what it says: «Машина» — сумма больше 1 000 000 000, не записал. */
function refusalLine(item: NotWrittenItem): string {
  // The text the bot already has for an amount with no account in its currency
  if (item.reason === 'no_account') return RU.record.noAccountIn(item.currency ?? 'UZS');
  const reason = item.reason === 'not_saved' ? 'refused' : item.reason;
  return RU.record.notWrittenBecause[reason](quoted(itemName(item)));
}

/**
 * What the phrase named and the bot did not write (#299): a line for every record refused for what it says, and one
 * for the records whose write failed while the rest of the phrase stayed written — «Записал не всё…», which asks to
 * send only them again: the bot cannot tell a phrase sent again from a new one, so the whole phrase would be doubled.
 */
export function notWrittenText(items: NotWrittenItem[]): string {
  const notSaved = items.filter(item => item.reason === 'not_saved');
  const lines = [...new Set(items.filter(item => item.reason !== 'not_saved').map(refusalLine))];
  if (notSaved.length > 0) lines.push(RU.record.savedInPart(notSaved.map(item => quoted(itemName(item))).join(', ')));
  return lines.join('\n');
}
