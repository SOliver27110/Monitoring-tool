import { describe, it, expect } from 'vitest';
import { compileMatcher, normaliseText } from './booleanMatcher';

describe('normaliseText', () => {
  it('replaces curly single quotes with straight', () => {
    expect(normaliseText("residents’ association")).toBe("residents' association");
    expect(normaliseText("‘hello’")).toBe("'hello'");
  });

  it('replaces curly double quotes with straight', () => {
    expect(normaliseText("“Heyford Park”")).toBe('"Heyford Park"');
  });

  it('replaces en/em dashes with hyphen', () => {
    expect(normaliseText('Heyford—Park')).toBe('Heyford-Park');
    expect(normaliseText('1–2 days')).toBe('1-2 days');
  });

  it('replaces ellipsis with three dots', () => {
    expect(normaliseText('and so on…')).toBe('and so on...');
  });

  it('replaces nbsp with regular space', () => {
    expect(normaliseText('Heyford Park')).toBe('Heyford Park');
  });

  it('applies NFKC for ligatures and fullwidth', () => {
    expect(normaliseText('oﬃce')).toBe('office');
    expect(normaliseText('ＡＢＣ')).toBe('ABC');
  });
});

describe('compileMatcher — empty queries', () => {
  it('matches everything for an empty query', () => {
    const m = compileMatcher('');
    expect(m('anything')).toBe(true);
    expect(m('')).toBe(true);
  });

  it('matches everything for a whitespace-only query', () => {
    expect(compileMatcher('   \n\t ')('foo')).toBe(true);
  });
});

describe('compileMatcher — empty article text', () => {
  it('returns false for a non-trivial query against empty text', () => {
    expect(compileMatcher('foo')('')).toBe(false);
  });
});

describe('compileMatcher — single term', () => {
  it('matches with word-boundary, case-insensitive', () => {
    const m = compileMatcher('housing');
    expect(m('new housing announcement')).toBe(true);
    expect(m('HOUSING crisis')).toBe(true);
    expect(m('Housing scheme approved')).toBe(true);
  });

  it('does not match within a larger word', () => {
    const m = compileMatcher('housing');
    expect(m('rehousing scheme')).toBe(false);
    expect(m('warehousing')).toBe(false);
  });

  it('does not match unrelated text', () => {
    expect(compileMatcher('housing')('a quiet day in Banbury')).toBe(false);
  });
});

describe('compileMatcher — implicit AND', () => {
  it('requires both terms when separated by whitespace', () => {
    const m = compileMatcher('heyford housing');
    expect(m('Heyford Park housing approved')).toBe(true);
    expect(m('Heyford Park new development')).toBe(false);
    expect(m('housing scheme in Banbury')).toBe(false);
  });
});

describe('compileMatcher — explicit AND', () => {
  it('requires both operands', () => {
    const m = compileMatcher('heyford AND housing');
    expect(m('Heyford Park housing approved')).toBe(true);
    expect(m('Heyford Park development')).toBe(false);
  });
});

describe('compileMatcher — OR', () => {
  it('matches if either operand matches', () => {
    const m = compileMatcher('housing OR development');
    expect(m('new housing announcement')).toBe(true);
    expect(m('major development plans')).toBe(true);
    expect(m('a quiet day in Banbury')).toBe(false);
  });
});

describe('compileMatcher — NOT', () => {
  it('handles -term shorthand', () => {
    const m = compileMatcher('housing -affiliate');
    expect(m('housing scheme approved')).toBe(true);
    expect(m('housing affiliate links')).toBe(false);
  });

  it('handles NOT keyword', () => {
    const m = compileMatcher('housing NOT affiliate');
    expect(m('housing scheme approved')).toBe(true);
    expect(m('housing affiliate links')).toBe(false);
  });

  it('NOT alone selects everything not matching', () => {
    const m = compileMatcher('NOT affiliate');
    expect(m('housing news')).toBe(true);
    expect(m('affiliate links roundup')).toBe(false);
  });
});

describe('compileMatcher — phrase', () => {
  it('matches case-insensitive substring', () => {
    const m = compileMatcher('"Heyford Park"');
    expect(m('Heyford Park news')).toBe(true);
    expect(m('heyford park news')).toBe(true);
    expect(m("HEYFORD PARK'S new plans")).toBe(true);
  });

  it('does not match if words are separated by other content', () => {
    expect(compileMatcher('"Heyford Park"')('Heyford to Park Lane')).toBe(false);
  });

  it('handles unterminated phrase by consuming to end of input', () => {
    const m = compileMatcher('"Heyford Park');
    expect(m('Heyford Park news')).toBe(true);
    expect(m('something else')).toBe(false);
  });
});

describe('compileMatcher — punctuation normalisation', () => {
  it('matches straight-apostrophe query against curly-apostrophe text', () => {
    const m = compileMatcher("\"residents' association\"");
    expect(m("the residents’ association said")).toBe(true);
    expect(m("the residents' association said")).toBe(true);
  });

  it('matches curly-apostrophe query against straight-apostrophe text', () => {
    const m = compileMatcher("\"residents’ association\"");
    expect(m("the residents' association said")).toBe(true);
  });

  it('matches across en-dash / hyphen variants', () => {
    const m = compileMatcher('"Heyford-Park"');
    expect(m('Heyford–Park development')).toBe(true);
    expect(m('Heyford—Park development')).toBe(true);
    expect(m('Heyford-Park development')).toBe(true);
  });

  it('matches across nbsp / regular space', () => {
    const m = compileMatcher('"Heyford Park"');
    expect(m('Heyford Park news')).toBe(true);
  });

  it('matches curly double-quoted phrase content via straight-quoted query', () => {
    const m = compileMatcher('"smart homes"');
    expect(m('the so-called “smart homes” project')).toBe(true);
  });
});

describe('compileMatcher — grouping and precedence', () => {
  it('respects parentheses', () => {
    const m = compileMatcher('"Heyford Park" AND (housing OR development)');
    expect(m('Heyford Park housing announcement')).toBe(true);
    expect(m('Heyford Park development plans')).toBe(true);
    expect(m('Heyford Park weather report')).toBe(false);
    expect(m('Banbury housing announcement')).toBe(false);
  });

  it('parses a AND b OR c as (a AND b) OR c', () => {
    const m = compileMatcher('heyford AND housing OR banbury');
    expect(m('Heyford housing news')).toBe(true);
    expect(m('Banbury weather report')).toBe(true);
    expect(m('Heyford weather report')).toBe(false);
  });

  it('handles nested parens', () => {
    const m = compileMatcher('((heyford OR oxford) AND housing)');
    expect(m('Oxford housing announcement')).toBe(true);
    expect(m('Heyford housing announcement')).toBe(true);
    expect(m('Oxford weather report')).toBe(false);
  });
});

describe('compileMatcher — regex special chars in terms', () => {
  it('treats regex metachars as literal', () => {
    const m = compileMatcher('c++');
    expect(m('learning c++ today')).toBe(true);
    expect(m('learning python today')).toBe(false);
  });
});

describe('compileMatcher — syntax errors', () => {
  it('throws on unmatched opening paren', () => {
    expect(() => compileMatcher('(heyford AND housing')).toThrow();
  });

  it('throws on unmatched closing paren', () => {
    expect(() => compileMatcher('heyford AND housing)')).toThrow();
  });
});

describe('compileMatcher — Heyford-realistic samples', () => {
  const m = compileMatcher('"Heyford Park" AND (housing OR planning OR development)');

  it('matches a relevant local-news headline + description', () => {
    const text =
      '"Concerns over Heyford Park housing plans" Residents have raised concerns over the latest Heyford Park development proposals submitted to Cherwell District Council.';
    expect(m(text)).toBe(true);
  });

  it('rejects an unrelated regional item', () => {
    const text =
      '"Banbury Christmas lights switched on" The town’s annual celebration drew crowds despite rain.';
    expect(m(text)).toBe(false);
  });

  it('rejects a Heyford Park item that is not about housing/planning/development', () => {
    const text =
      '"Heyford Park half-marathon raises £20,000" Runners gathered at Heyford Park on Saturday for the annual charity event.';
    expect(m(text)).toBe(false);
  });
});
