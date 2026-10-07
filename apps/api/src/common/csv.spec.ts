import { CSV_BOM, CSV_SEPARATOR, neutraliseCell, toCsvRow } from './csv.js';

describe('neutraliseCell', () => {
  it.each(['=1+1', '+62812', '-5', '@SUM(A1)', '\tteks', '\rteks', '=HYPERLINK("http://x","y")'])(
    'defuses %j, which a spreadsheet would read as a formula',
    (value) => {
      expect(neutraliseCell(value)).toBe(`'${value}`);
    },
  );

  it.each(['Beli semen', '', '150000', '2026-10-01', 'a=b', 'Rp -5', ' =1+1'])('leaves %j alone', (value) => {
    expect(neutraliseCell(value)).toBe(value);
  });
});

describe('toCsvRow', () => {
  it('joins cells with the separator and ends the line', () => {
    expect(CSV_SEPARATOR).toBe(';');
    expect(toCsvRow(['2026-10-01', 'Keluar', '150000'])).toBe('2026-10-01;Keluar;150000\r\n');
  });

  it('writes an empty cell for null', () => {
    expect(toCsvRow(['a', null, 'c'])).toBe('a;;c\r\n');
  });

  it.each([
    ['a separator', 'Semen; 10 sak', '"Semen; 10 sak"'],
    ['a quote', 'Semen "tiga roda"', '"Semen ""tiga roda"""'],
    ['a line break', 'baris satu\nbaris dua', '"baris satu\nbaris dua"'],
    ['a carriage return', 'satu\rdua', '"satu\rdua"'],
  ])('quotes a cell containing %s', (_label, cell, written) => {
    expect(toCsvRow(['x', cell])).toBe(`x;${written}\r\n`);
  });

  it('defuses and quotes at once when a cell needs both', () => {
    expect(toCsvRow(['=HYPERLINK("http://x";"y")'])).toBe(`"'=HYPERLINK(""http://x"";""y"")"\r\n`);
  });

  it('leaves commas alone, since the separator is a semicolon', () => {
    expect(toCsvRow(['Semen, pasir'])).toBe('Semen, pasir\r\n');
  });
});

describe('CSV_BOM', () => {
  it('is the UTF-8 byte order mark, so spreadsheets read the text as UTF-8', () => {
    expect(Buffer.from(CSV_BOM, 'utf8')).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
});
