/**
 * Legal forms of a business, as a bank or a receipt writes them before its name: «ООО», «ЧП», «LLC»; and the Uzbek
 * «MChJ» / «МЧЖ» (mas'uliyati cheklangan jamiyat — ООО), «YTT» / «YaTT» / «ЯТТ» (yakka tartibdagi tadbirkor — ИП),
 * «DUK» / «ДУК» (davlat unitar korxonasi — ГУП). Wallet names a merchant this way: «Ooo Mazzali Super Food», «Ytt
 * Abduvoxidov Davronbek». A form listed here names no category (`namesNothing`) and is left out of the merchant key
 * (`merchantKey`), FT-184, FT-208. Other two-letter forms than «ЧП» («ИП», «XK», «AJ») are not listed: as words they are
 * too short to be taught anyway, but a merchant key keeps them — «XK Zzqx» and «Zzqx» are two merchants. Folded, as
 * `wordsOf` gives them.
 */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
  'ooo', 'ооо', 'llc', 'ltd', 'inc', 'mchj', 'мчж', 'chp', 'чп', 'оао', 'зао', 'плс', 'plc',
  'ytt', 'yatt', 'ятт', 'duk', 'дук',
]);

export function isLegalForm(word: string): boolean {
  return LEGAL_FORMS.has(word);
}
