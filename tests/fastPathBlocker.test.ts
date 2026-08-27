/**
 * describeFastPathBlocker — чистое наблюдение: на разбор не влияет, нужно только
 * чтобы решение о сужении стоп-слов принималось по данным.
 *
 * Знать долю ухода в OpenAI мало — надо знать, какой гард её создаёт. Поэтому
 * тесты закрепляют соответствие «фраза → причина», а не только «быстро/медленно».
 */
import { describeFastPathBlocker } from '../src/modules/voiceProcessing/application/processTextInput';

describe('причина ухода в OpenAI', () => {
  it('телеграфные фразы проходят быстрым путём', () => {
    expect(describeFastPathBlocker('такси 15000')).toBeNull();
    expect(describeFastPathBlocker('кофе 25000')).toBeNull();
    expect(describeFastPathBlocker('продукты 200 тысяч')).toBeNull();
    expect(describeFastPathBlocker('зарплата 5000000')).toBeNull();
  });

  it('любая пунктуация закрывает быстрый путь', () => {
    // Whisper расставляет точки, поэтому голосовые не попадают сюда никогда.
    expect(describeFastPathBlocker('кофе 25000 сум.')).toBe('punctuation');
    expect(describeFastPathBlocker('такси 15000!')).toBe('punctuation');
  });

  it('частые русские слова закрывают быстрый путь', () => {
    expect(describeFastPathBlocker('купил продукты на 200 тысяч')).toBe('complex-words');
    expect(describeFastPathBlocker('за проезд 5000')).toBe('complex-words');
    expect(describeFastPathBlocker('взял кофе 25000')).toBe('complex-words');
    expect(describeFastPathBlocker('обед и кофе 50000')).toBe('complex-words');
  });

  it('долги намеренно уходят в OpenAI', () => {
    expect(describeFastPathBlocker('занял у Азиза 100 тысяч')).toBe('debt-keywords');
  });

  it('различает отсутствие числа и число без описания', () => {
    // parseAmount отказывается от голого числа: ему нужно описание рядом.
    // Это разные случаи, и смешивать их в одну метку значило бы соврать в данных.
    expect(describeFastPathBlocker('5000')).toBe('amount-without-label');
    expect(describeFastPathBlocker('200 тысяч')).toBe('amount-without-label');
    expect(describeFastPathBlocker('привет')).toBe('no-number');
  });

  it('не зависит от лишних пробелов и регистра', () => {
    expect(describeFastPathBlocker('  такси   15000  ')).toBeNull();
    expect(describeFastPathBlocker('Снял в банкомате 300 тысяч')).toBeNull();
  });
});
