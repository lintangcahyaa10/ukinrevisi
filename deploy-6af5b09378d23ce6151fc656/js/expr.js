// Parser ekspresi matematika sederhana dan aman (tanpa eval).
// Mendukung: + - * / ^, perkalian implisit (2x, 3(x+1), 2sin(x)), |x|,
// fungsi sin cos tan sqrt abs ln log exp, konstanta pi dan e, simbol √ ² ³ × · −, desimal koma (0,5).

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sqrt: Math.sqrt, akar: Math.sqrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, exp: Math.exp,
};
const NAMES = [...Object.keys(FUNCS), "pi", "x", "e"].sort((a, b) => b.length - a.length);

function normalize(src) {
  return String(src)
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^")
    .replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/, "");
}

function tokenize(src) {
  const s = normalize(src);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (!m) throw new Error("Angka tidak valid");
      out.push({ t: "num", v: parseFloat(m[1]) });
      i += m[1].length;
      continue;
    }
    if (/[a-z]/.test(c)) {
      let word = s.slice(i).match(/^[a-z]+/)[0];
      i += word.length;
      while (word.length) {
        const name = NAMES.find((n) => word.startsWith(n));
        if (!name) throw new Error(`Tidak dikenal: "${word}"`);
        out.push({ t: "id", v: name });
        word = word.slice(name.length);
      }
      continue;
    }
    if ("+-*/^()|".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Simbol tidak dikenal: "${c}"`);
  }
  return out;
}

export function compile(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new Error("Fungsi masih kosong");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`Kurang tanda "${v}"`);
    p++;
  };
  let absDepth = 0;

  function expr() {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v;
      const l = left, r = term();
      left = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  function startsPrimary() {
    const t = peek();
    if (!t) return false;
    if (t.t === "num" || t.t === "id") return true;
    if (t.t === "op" && t.v === "(") return true;
    if (t.t === "op" && t.v === "|" && absDepth === 0) return true;
    return false;
  }
  function term() {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = toks[p++].v;
        const l = left, r = unary();
        left = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (startsPrimary()) {
        const l = left, r = power();
        left = (x) => l(x) * r(x);
      } else break;
    }
    return left;
  }
  function unary() {
    if (isOp("-")) { p++; const u = unary(); return (x) => -u(x); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp("^")) {
      p++;
      const ex = unary();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error("Ekspresi belum lengkap");
    if (t.t === "num") { p++; const v = t.v; return () => v; }
    if (t.t === "id") {
      p++;
      if (t.v === "x") return (x) => x;
      if (t.v === "pi") return () => Math.PI;
      if (t.v === "e") return () => Math.E;
      const f = FUNCS[t.v];
      let arg;
      if (isOp("(")) { p++; arg = expr(); expect(")"); }
      else arg = power();
      return (x) => f(arg(x));
    }
    if (t.v === "(") { p++; const e = expr(); expect(")"); return e; }
    if (t.v === "|") {
      p++; absDepth++;
      const e = expr();
      absDepth--;
      expect("|");
      return (x) => Math.abs(e(x));
    }
    throw new Error(`Tanda "${t.v}" tidak pada tempatnya`);
  }

  const fn = expr();
  if (p < toks.length) throw new Error(`Tanda "${toks[p].v}" tidak pada tempatnya`);
  // uji cepat
  fn(1.2345);
  return fn;
}

// Tampilan ekspresi yang lebih rapi (x^2 -> x², * -> ·)
export function pretty(src) {
  return String(src)
    .replace(/\^2(?![0-9])/g, "²")
    .replace(/\^3(?![0-9])/g, "³")
    .replace(/\*/g, "·")
    .replace(/-/g, "−");
}
