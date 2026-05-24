/**
 * Extract JOIN equalities from a SELECT query for Model View visualization.
 * Handles common patterns: FROM / JOIN with optional schema, AS aliases, ON a.x = b.y
 */

function stripQuotes(s) {
  if (!s) return '';
  let t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('[') && t.endsWith(']'))) {
    t = t.slice(1, -1);
  }
  if (t.startsWith('`') && t.endsWith('`')) t = t.slice(1, -1);
  return t;
}

function lastTableSegment(ident) {
  const parts = ident.split('.').map(stripQuotes);
  return parts[parts.length - 1].toLowerCase();
}

function parseQualified(expr) {
  const e = String(expr).trim();
  const m = e.match(/^([\w]+)\.([\w."`\[\]]+)$/);
  if (!m) return null;
  return { alias: m[1].toLowerCase(), column: stripQuotes(m[2]) };
}

/**
 * Build map: alias -> bare table name (last segment)
 */
function buildAliasMap(fromClause) {
  const map = new Map();
  if (!fromClause) return map;

  const register = (fullTable, aliasToken) => {
    const bare = lastTableSegment(fullTable);
    const alias = (aliasToken || bare).toLowerCase();
    map.set(alias, bare);
  };

  // FROM schema.table [AS] alias | FROM table [AS] alias
  const fromHead = fromClause.replace(/^\s*FROM\s+/i, '');
  const firstJoinIdx = fromHead.search(/\b(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+JOIN\b|\bJOIN\b/i);
  const firstSeg = firstJoinIdx >= 0 ? fromHead.slice(0, firstJoinIdx) : fromHead;

  const trimmed = firstSeg.trim();
  let m = trimmed.match(/^([\w."`\[\]]+(?:\.[\w."`\[\]]+)*)\s+AS\s+(\w+)\s*$/i);
  if (m) {
    register(m[1], m[2]);
  } else {
    m = trimmed.match(/^([\w."`\[\]]+(?:\.[\w."`\[\]]+)*)\s+(\w+)\s*$/i);
    if (m && !/^(AS|ON|WHERE|GROUP|ORDER|LIMIT)$/i.test(m[2])) {
      register(m[1], m[2]);
    } else {
      m = trimmed.match(/^([\w."`\[\]]+(?:\.[\w."`\[\]]+)*)\s*$/i);
      if (m) register(m[1], lastTableSegment(m[1]));
    }
  }

  const joinRe = /\b(?:(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+)?JOIN\s+([\w."`\[\]]+(?:\.[\w."`\[\]]+)*)(?:\s+AS\s+|\s+)(\w+)\b/gi;
  let jm;
  while ((jm = joinRe.exec(fromClause)) !== null) {
    register(jm[1], jm[2]);
  }

  return map;
}

function extractFromClause(sql) {
  const cleaned = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
  const m = cleaned.match(/\bFROM\s+([\s\S]+?)(?=\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bOFFSET\b|\bHAVING\b|$)/i);
  return m ? m[1].trim() : '';
}

/** Join keyword immediately before this ON clause (FROM prelude is segment 0). */
function joinTypeBeforeOn(prelude) {
  const m = [...prelude.matchAll(/\b(LEFT|RIGHT|INNER|FULL|CROSS)?\s+JOIN\b/gi)];
  if (m.length === 0) return 'INNER';
  const last = m[m.length - 1][1];
  const t = (last || 'INNER').toUpperCase();
  if (t === 'CROSS') return 'INNER';
  return t;
}

/**
 * @returns {{ joinType: string, leftTable: string, leftColumn: string, rightTable: string, rightColumn: string }[]}
 */
export function parseJoinEqualities(sql) {
  if (!sql || typeof sql !== 'string') return [];
  const fromClause = extractFromClause(sql);
  if (!fromClause) return [];

  const aliasMap = buildAliasMap(`FROM ${fromClause}`);
  const out = [];

  const onSegment = fromClause.split(/\bON\b/i);
  for (let i = 1; i < onSegment.length; i += 1) {
    const joinType = joinTypeBeforeOn(onSegment[i - 1]);
    let chunk = onSegment[i];
    const stop = chunk.search(/\b(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+JOIN\b|\bJOIN\b/i);
    if (stop >= 0) chunk = chunk.slice(0, stop);

    const conditions = chunk.split(/\bAND\b/i);
    for (const cond of conditions) {
      const c = cond.trim();
      const eq = c.match(
        /^([\w."`\[\]]+\.[\w."`\[\]]+)\s*=\s*([\w."`\[\]]+\.[\w."`\[\]]+)/i
      );
      if (!eq) continue;
      const a = parseQualified(eq[1]);
      const b = parseQualified(eq[2]);
      if (!a || !b) continue;

      const ta = aliasMap.get(a.alias);
      const tb = aliasMap.get(b.alias);
      if (!ta || !tb) continue;
      if (ta === tb) continue;

      out.push({
        joinType,
        leftTable: ta,
        leftColumn: a.column,
        rightTable: tb,
        rightColumn: b.column,
      });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const k = [r.leftTable, r.leftColumn, r.rightTable, r.rightColumn].join('|');
    const k2 = [r.rightTable, r.rightColumn, r.leftTable, r.leftColumn].join('|');
    if (seen.has(k) || seen.has(k2)) continue;
    seen.add(k);
    deduped.push(r);
  }
  return deduped;
}

/** Heuristic cardinality from JOIN keyword (for Model View hints; not enforced by the engine). */
export function joinTypeToCardinality(joinType) {
  const j = (joinType || '').toUpperCase();
  if (j === 'LEFT') return 'N:1';
  if (j === 'RIGHT') return '1:N';
  if (j === 'FULL') return 'N:N';
  return '1:N'; // INNER, CROSS, unknown
}
