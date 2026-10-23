/** Shared network identities and photo-reviewed procedural livery families. */
export const FUEL_BRANDS = {
  neutral: { name: 'АЗС', fascia: 0xd8dad5, accent: 0x687471, secondary: 0x89958f, column: 0xd8dad5, pump: 0xd2d5cf, text: '#263c38', references: [] },
  lukoil: { name: 'ЛУКОЙЛ', fascia: 0xeeeae2, accent: 0xc72b30, secondary: 0xc72b30, column: 0xeeeae2, pump: 0xe0e1dc, text: '#c72b30', references: ['https://companies.caixin.com/2023-10-07/102114315.html'] },
  tatneft: { name: 'ТАТНЕФТЬ', fascia: 0xeeeae2, accent: 0x23854c, secondary: 0xc62e35, column: 0xe7e6dc, pump: 0xdfe2da, text: '#22834b', references: ['https://commons.wikimedia.org/wiki/File:Казань._Автозаправочная_станция_«Татнефть»_-_проспект_Победы,_105А_(2).JPG'] },
  taif: { name: 'ТАИФ-НК', fascia: 0x285d43, accent: 0xc6b781, secondary: 0xb3a777, column: 0xd9d1b0, pump: 0xd6d9ce, text: '#e9deac', references: ['https://taifazs.ru/news/otkrytie-azs-taif-nk-/'] },
  irbis: { name: 'IRBIS', fascia: 0x292e2e, accent: 0xc7df2c, secondary: 0xbb3035, column: 0xc7df2c, pump: 0x333a39, text: '#d7e83b', references: ['https://azsirbis.ru/news/34'] },
  teboil: { name: 'TEBOIL', fascia: 0x254c89, accent: 0xcf303a, secondary: 0xeeeee7, column: 0xe5e5db, pump: 0x254c89, text: '#ffffff', references: ['https://azs.teboil.ru/career/'] },
  gazpromneft: { name: 'ГАЗПРОМНЕФТЬ', fascia: 0xf0eee6, accent: 0x1477ba, secondary: 0x10528b, column: 0xdedfd9, pump: 0x176dad, text: '#126cae', references: ['https://azsrpk.ru/proekty/kompleksnoe-oformlenie-azs/reklamnoe-oborudovanie-dlya-azs-gazpromneft/'] },
  bashneft: { name: 'БАШНЕФТЬ', fascia: 0xf0eee6, accent: 0x348a66, secondary: 0xa62a65, column: 0x348a66, pump: 0xe1e1d8, text: '#2c825e', references: ['https://www.kommersant.ru/doc/4399492'] }
};

const normalized = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
const aliases = { lukoil: 'lukoil', лукойл: 'lukoil', tatneft: 'tatneft', татнефть: 'tatneft', таифнк: 'taif', taifnk: 'taif', irbis: 'irbis', ирбис: 'irbis', teboil: 'teboil', тебойл: 'teboil', газпромнефть: 'gazpromneft', gazpromneft: 'gazpromneft', башнефть: 'bashneft', bashneft: 'bashneft' };
const wikidata = { Q329347: 'lukoil', Q1616858: 'tatneft', Q1461799: 'gazpromneft', Q809985: 'bashneft', Q112960401: 'taif', Q7692079: 'teboil' };

/** Explicit station branding wins over a parent operator or accepted fuel cards. */
export function resolveFuelBrand(tags) {
  for (const field of ['brand', 'brand:ru', 'brand:en']) {
    if (!tags[field]) continue;
    const family = aliases[normalized(tags[field])] || 'neutral';
    return { family, identity: tags[field], field, confidence: family === 'neutral' ? 'unreviewed-identity' : 'mapped-brand' };
  }
  if (wikidata[tags['brand:wikidata']]) return { family: wikidata[tags['brand:wikidata']], identity: tags['brand:wikidata'], field: 'brand:wikidata', confidence: 'mapped-brand' };
  for (const field of ['operator', 'name']) {
    const value = normalized(tags[field]);
    let family = aliases[value];
    if (field === 'operator') {
      if (/^(ооо)?лукойлуралнефтепродукт$/.test(value)) family = 'lukoil';
      if (/^(ооо)?татнефтьазсцентр$/.test(value)) family = 'tatneft';
    }
    if (family) return { family, identity: tags[field], field, confidence: `mapped-${field}-alias` };
  }
  return { family: 'neutral', identity: tags.brand || tags.name || tags.operator || '', field: tags.brand ? 'brand' : tags.name ? 'name' : tags.operator ? 'operator' : null, confidence: 'unreviewed-identity' };
}
