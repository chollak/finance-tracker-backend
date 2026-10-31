/**
 * Legal forms of a business, as a bank or a receipt writes them before its name: «ООО», «ЧП», «LLC»; and the Uzbek
 * «MChJ» / «МЧЖ» (mas'uliyati cheklangan jamiyat — ООО), «YTT» / «YaTT» / «ЯТТ» (yakka tartibdagi tadbirkor — ИП),
 * «DUK» / «ДУК» (davlat unitar korxonasi — ГУП). Wallet names a merchant this way: «Ooo Mazzali Super Food», «Ytt
 * Abduvoxidov Davronbek». They name neither a category nor the merchant (FT-184, FT-208). Two-letter forms («ИП», «XK»,
 * «AJ») are too short to be taught anyway. Folded, as `wordsOf` gives them.
 */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
  'ooo', 'ооо', 'llc', 'ltd', 'inc', 'mchj', 'мчж', 'chp', 'чп', 'оао', 'зао', 'плс', 'plc',
  'ytt', 'yatt', 'ятт', 'duk', 'дук',
]);

export function isLegalForm(word: string): boolean {
  return LEGAL_FORMS.has(word);
}
