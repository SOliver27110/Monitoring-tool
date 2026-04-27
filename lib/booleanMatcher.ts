// Boolean expression matcher for browse-source feeds (Oxford Mail,
// Banbury Guardian, etc.). Browse sources don't take a query — they
// return a fixed feed of recent items, and we filter locally with the
// project's boolean_search_terms / client_search_terms.
//
// Grammar (recursive descent, NOT > AND > OR precedence):
//   expr    := orExpr
//   orExpr  := andExpr ('OR' andExpr)*
//   andExpr := unary (('AND')? unary)*       — AND is implicit
//   unary   := ('NOT' | '-')? atom
//   atom    := PHRASE | TERM | '(' expr ')'
//
// Term match: word boundary, case-insensitive (so `housing` doesn't
// match `rehousing`). Phrase match: case-insensitive substring (so
// `"Heyford Park"` matches `Heyford Park's`).
//
// Punctuation normalisation runs at compile time on the query and at
// match time on the article text, so curly quotes / em-dashes / nbsp
// in CMS content match straight-character queries and vice-versa.

/**
 * Normalise text so query terms and article content match consistently
 * across CMS quote-mangling. Public so ad-hoc debugging scripts can
 * reproduce the matcher's view of a string.
 */
export function normaliseText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');
}

export type Matcher = (text: string) => boolean;

type Token =
  | { type: 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' }
  | { type: 'TERM'; value: string }
  | { type: 'PHRASE'; value: string };

type Node =
  | { type: 'and'; left: Node; right: Node }
  | { type: 'or'; left: Node; right: Node }
  | { type: 'not'; child: Node }
  | { type: 'term'; match: (text: string) => boolean }
  | { type: 'phrase'; needle: string };

function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }

    if (ch === '"') {
      // Consume until the next quote, or to end of input if unterminated.
      const end = input.indexOf('"', i + 1);
      if (end === -1) {
        tokens.push({ type: 'PHRASE', value: input.slice(i + 1) });
        i = input.length;
      } else {
        tokens.push({ type: 'PHRASE', value: input.slice(i + 1, end) });
        i = end + 1;
      }
      continue;
    }

    // Term or keyword: consume until whitespace, paren, or quote.
    let end = i;
    while (end < input.length && !/[\s()"]/.test(input[end])) end++;
    const word = input.slice(i, end);
    i = end;

    if (word === 'AND') tokens.push({ type: 'AND' });
    else if (word === 'OR') tokens.push({ type: 'OR' });
    else if (word === 'NOT') tokens.push({ type: 'NOT' });
    else if (word.startsWith('-') && word.length > 1) {
      tokens.push({ type: 'NOT' });
      tokens.push({ type: 'TERM', value: word.slice(1) });
    } else {
      tokens.push({ type: 'TERM', value: word });
    }
  }

  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parse(): Node {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at position ${this.pos}: ${this.tokens[this.pos].type}`);
    }
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek()?.type === 'OR') {
      this.consume();
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseUnary();
    while (true) {
      const next = this.peek();
      if (!next) break;
      if (next.type === 'OR' || next.type === 'RPAREN') break;
      if (next.type === 'AND') this.consume();
      const right = this.parseUnary();
      left = { type: 'and', left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek()?.type === 'NOT') {
      this.consume();
      return { type: 'not', child: this.parseAtom() };
    }
    return this.parseAtom();
  }

  private parseAtom(): Node {
    const tok = this.consume();
    if (!tok) throw new Error('Unexpected end of input');
    if (tok.type === 'LPAREN') {
      const expr = this.parseOr();
      const close = this.consume();
      if (!close || close.type !== 'RPAREN') {
        throw new Error('Missing closing paren');
      }
      return expr;
    }
    if (tok.type === 'TERM') {
      const escaped = tok.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Only apply \b where the term boundary is a word char. \b matches a
      // word↔non-word transition, so a term ending in `+` (e.g. `c++`)
      // would never get the trailing boundary anchor to fire — `++ ` is
      // non-word↔non-word.
      const leading = /^\w/.test(tok.value) ? '\\b' : '';
      const trailing = /\w$/.test(tok.value) ? '\\b' : '';
      const re = new RegExp(`${leading}${escaped}${trailing}`, 'i');
      return { type: 'term', match: (text) => re.test(text) };
    }
    if (tok.type === 'PHRASE') {
      return { type: 'phrase', needle: tok.value.toLowerCase() };
    }
    throw new Error(`Unexpected token: ${tok.type}`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }
}

function evalNode(node: Node, normalisedText: string, lowerNormalisedText: string): boolean {
  switch (node.type) {
    case 'and':
      return (
        evalNode(node.left, normalisedText, lowerNormalisedText) &&
        evalNode(node.right, normalisedText, lowerNormalisedText)
      );
    case 'or':
      return (
        evalNode(node.left, normalisedText, lowerNormalisedText) ||
        evalNode(node.right, normalisedText, lowerNormalisedText)
      );
    case 'not':
      return !evalNode(node.child, normalisedText, lowerNormalisedText);
    case 'term':
      return node.match(normalisedText);
    case 'phrase':
      return lowerNormalisedText.includes(node.needle);
  }
}

/**
 * Compile a boolean query into a reusable matcher. Compile-time work
 * (tokenise, parse, build regexes, normalise phrase needles) happens
 * once; the returned function only walks the AST.
 *
 * Empty / whitespace queries return a matcher that matches everything.
 *
 * Throws on syntax error (unmatched paren, unexpected token). Callers
 * should wrap in try/catch and surface the error to the user — silent
 * fallback to matches-everything would mask malformed queries.
 */
export function compileMatcher(query: string): Matcher {
  const trimmed = query.trim();
  if (!trimmed) return () => true;

  const normalisedQuery = normaliseText(trimmed);
  const tokens = tokenise(normalisedQuery);
  if (tokens.length === 0) return () => true;

  // Normalise phrase needles at compile time; they're already in the AST
  // as lowercased substrings via parseAtom.
  const ast = new Parser(tokens).parse();

  return (text: string) => {
    const normalised = normaliseText(text);
    return evalNode(ast, normalised, normalised.toLowerCase());
  };
}
