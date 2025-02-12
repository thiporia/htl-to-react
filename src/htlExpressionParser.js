// htlExpressionParser.js
import nearley from "nearley";
const { Parser, Grammar } = nearley;

/**
 * Nearley grammar in JS object form.
 *  - We define tokens & rules for:
 *    Expression -> orBinaryOp ("?" orBinaryOp ":" orBinaryOp)?
 *    orBinaryOp -> andBinaryOp ("||" andBinaryOp)*
 *    andBinaryOp -> inBinaryOp ("&&" inBinaryOp)*
 *    inBinaryOp -> comparisonTerm ("in" comparisonTerm)*
 *    ...
 *
 *  This is a simplified HTL expression grammar example.
 */
const htlGrammar = {
  Lexer: undefined, // for simplicity we won't define a separate lexer; we'll do tokenizing in rules
  ParserRules: [
    // [0] Start rule
    {
      name: "Expression",
      symbols: ["_", "TernaryExpr", "_"],
      postprocess: (d) => d[1],
    },

    // [1] Ternary expr
    // ternary => orExpr "?" orExpr ":" orExpr | orExpr
    {
      name: "TernaryExpr",
      symbols: ["OrExpr", "__qm", "OrExpr", "__colon", "OrExpr"],
      postprocess: (d) => ({
        type: "Ternary",
        condition: d[0],
        thenBranch: d[2],
        elseBranch: d[4],
      }),
    },
    {
      name: "TernaryExpr",
      symbols: ["OrExpr"],
      postprocess: (d) => d[0],
    },

    // [2] OrExpr -> AndExpr ( "||" AndExpr )*
    {
      name: "OrExpr$ebnf$1",
      symbols: [],
    },
    {
      name: "OrExpr$ebnf$1$subexpression$1",
      symbols: ["__or", "AndExpr"],
    },
    {
      name: "OrExpr$ebnf$1",
      symbols: ["OrExpr$ebnf$1", "OrExpr$ebnf$1$subexpression$1"],
      postprocess: (arr) => arr.flat(),
    },
    {
      name: "OrExpr",
      symbols: ["AndExpr", "OrExpr$ebnf$1"],
      postprocess: (d) => {
        const first = d[0];
        const rest = d[1];
        if (!rest || rest.length === 0) return first;
        // rest = [ "__or", AndExpr, "__or", AndExpr, ... ]
        let result = first;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "||") {
            const right = rest[i + 1];
            result = {
              type: "BinaryOp",
              op: "||",
              left: result,
              right,
            };
            i++;
          }
        }
        return result;
      },
    },

    // [3] AndExpr -> InExpr ( "&&" InExpr )*
    {
      name: "AndExpr$ebnf$1",
      symbols: [],
    },
    {
      name: "AndExpr$ebnf$1$subexpression$1",
      symbols: ["__and", "InExpr"],
    },
    {
      name: "AndExpr$ebnf$1",
      symbols: ["AndExpr$ebnf$1", "AndExpr$ebnf$1$subexpression$1"],
      postprocess: (arr) => arr.flat(),
    },
    {
      name: "AndExpr",
      symbols: ["InExpr", "AndExpr$ebnf$1"],
      postprocess: (d) => {
        let result = d[0];
        const rest = d[1];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "&&") {
            const right = rest[i + 1];
            result = { type: "BinaryOp", op: "&&", left: result, right };
            i++;
          }
        }
        return result;
      },
    },

    // [4] InExpr -> Comparison ( "in" Comparison )*
    {
      name: "InExpr$ebnf$1",
      symbols: [],
    },
    {
      name: "InExpr$ebnf$1$subexpression$1",
      symbols: ["__in", "Comparison"],
    },
    {
      name: "InExpr$ebnf$1",
      symbols: ["InExpr$ebnf$1", "InExpr$ebnf$1$subexpression$1"],
      postprocess: (arr) => arr.flat(),
    },
    {
      name: "InExpr",
      symbols: ["Comparison", "InExpr$ebnf$1"],
      postprocess: (d) => {
        let result = d[0];
        const rest = d[1];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "in") {
            const right = rest[i + 1];
            result = { type: "BinaryOp", op: "in", left: result, right };
            i++;
          }
        }
        return result;
      },
    },

    // [5] Comparison -> Factor ( compareOp Factor )?
    {
      name: "Comparison",
      symbols: ["Factor", "compareOp", "Factor"],
      postprocess: (d) => ({
        type: "BinaryOp",
        op: d[1],
        left: d[0],
        right: d[2],
      }),
    },
    {
      name: "Comparison",
      symbols: ["Factor"],
      postprocess: (d) => d[0],
    },

    // [6] Factor -> "!"? Term
    {
      name: "Factor",
      symbols: ["__not", "Term"],
      postprocess: (d) => ({
        type: "UnaryOp",
        op: "!",
        operand: d[1],
      }),
    },
    {
      name: "Factor",
      symbols: ["Term"],
      postprocess: (d) => d[0],
    },

    // [7] Term -> Atom ( '.' field | '[' expr ']' )*
    // 간단 예: 여기서는 property access, array access 정도
    {
      name: "Term$ebnf$1",
      symbols: [],
    },
    {
      name: "Term$ebnf$1$subexpression$1",
      symbols: ["__dot", "field"],
    },
    {
      name: "Term$ebnf$1$subexpression$1",
      symbols: ["__lb", "Expression", "__rb"],
    },
    {
      name: "Term$ebnf$1",
      symbols: ["Term$ebnf$1", "Term$ebnf$1$subexpression$1"],
      postprocess: (arr) => arr.flat(),
    },
    {
      name: "Term",
      symbols: ["Atom", "Term$ebnf$1"],
      postprocess: (d) => {
        let result = d[0];
        const rest = d[1];
        let i = 0;
        while (i < rest.length) {
          const token = rest[i];
          if (token === ".") {
            const f = rest[i + 1];
            result = {
              type: "PropertyAccess",
              object: result,
              name: f,
            };
            i += 2;
          } else if (token === "[") {
            // next is Expression, then ]
            const expr = rest[i + 1];
            result = {
              type: "IndexAccess",
              arrayOrObject: result,
              index: expr,
            };
            i += 3; // skip ] token
          } else {
            i++;
          }
        }
        return result;
      },
    },

    // [8] Atom -> identifier | number | string | boolean | '(' Expression ')'
    {
      name: "Atom",
      symbols: ["identifier"],
      postprocess: (d) => ({ type: "Identifier", name: d[0] }),
    },
    {
      name: "Atom",
      symbols: ["number"],
      postprocess: (d) => ({ type: "NumberLiteral", value: d[0] }),
    },
    {
      name: "Atom",
      symbols: ["string"],
      postprocess: (d) => ({ type: "StringLiteral", value: d[0] }),
    },
    {
      name: "Atom",
      symbols: ["boolean"],
      postprocess: (d) => ({ type: "BooleanLiteral", value: d[0] }),
    },
    {
      name: "Atom$subexpression$1",
      symbols: ["Expression"],
    },
    {
      name: "Atom",
      symbols: ["__lpar", "Atom$subexpression$1", "__rpar"],
      postprocess: (d) => d[1][0],
    },

    // compareOp: '==' | '!=' | '<' | '<=' | '>' | '>='
    {
      name: "compareOp",
      symbols: [/[=!<>]=?|<=|>=/],
      postprocess: (d) => d[0],
    },

    // lexical references or partial tokens
    // __or => '||', __and => '&&', __qm => '?', __colon => ':', etc.

    { name: "__or", symbols: [/[|][|]/], postprocess: (d) => "||" },
    { name: "__and", symbols: [/[&][&]/], postprocess: (d) => "&&" },
    { name: "__in", symbols: [/in/], postprocess: (d) => "in" },
    { name: "__not", symbols: [/!/], postprocess: (d) => "!" },
    { name: "__dot", symbols: [/\./], postprocess: (d) => "." },
    { name: "__lb", symbols: [/\[/], postprocess: (d) => "[" },
    { name: "__rb", symbols: [/\]/], postprocess: (d) => "]" },
    { name: "__qm", symbols: [/\?/], postprocess: (d) => "?" },
    { name: "__colon", symbols: [/:/], postprocess: (d) => ":" },
    { name: "__lpar", symbols: [/\(/], postprocess: (d) => "(" },
    { name: "__rpar", symbols: [/\)/], postprocess: (d) => ")" },

    // identifier: [a-zA-Z_] [a-zA-Z0-9_]*
    {
      name: "identifier",
      symbols: [
        /[a-zA-Z_]/,
        { test: (x) => /[a-zA-Z0-9_]/.test(x), repeat: true },
      ],
      postprocess: (d) => d[0] + d[1].join(""),
    },

    // boolean => 'true'|'false'
    {
      name: "boolean$string$1",
      symbols: [
        { literal: "t" },
        { literal: "r" },
        { literal: "u" },
        { literal: "e" },
      ],
      postprocess: (d) => d.join(""),
    },
    {
      name: "boolean",
      symbols: ["boolean$string$1"],
      postprocess: () => true,
    },
    {
      name: "boolean$string$2",
      symbols: [
        { literal: "f" },
        { literal: "a" },
        { literal: "l" },
        { literal: "s" },
        { literal: "e" },
      ],
      postprocess: (d) => d.join(""),
    },
    {
      name: "boolean",
      symbols: ["boolean$string$2"],
      postprocess: () => false,
    },

    // number => (float|int), 단순화:
    {
      name: "number",
      symbols: [/[+-]?[0-9]+(\.[0-9]+)?/],
      postprocess: (d) => parseFloat(d[0]),
    },

    // string => 싱글/더블 쿼트 내 내용을 단순히 그대로 받음
    {
      name: "string$subexpression$1",
      symbols: [/[^"\\]/],
    },
    {
      name: "string$subexpression$1",
      symbols: [/\\./],
    },
    {
      name: "string$ebnf$1",
      symbols: ["string$subexpression$1"],
    },
    {
      name: "string$ebnf$1",
      symbols: ["string$ebnf$1", "string$subexpression$1"],
      postprocess: (d) => d.flat(),
    },
    {
      name: "string",
      symbols: [{ literal: '"' }, "string$ebnf$1", { literal: '"' }],
      postprocess: (d) => {
        const contentArr = d[1].map((x) => (x instanceof Array ? x[0] : x));
        const content = contentArr.join("");
        return content;
      },
    },
    // 싱글 쿼트 버전
    {
      name: "string$subexpression$2",
      symbols: [/[^'\\]/],
    },
    {
      name: "string$subexpression$2",
      symbols: [/\\./],
    },
    {
      name: "string$ebnf$2",
      symbols: ["string$subexpression$2"],
    },
    {
      name: "string$ebnf$2",
      symbols: ["string$ebnf$2", "string$subexpression$2"],
      postprocess: (d) => d.flat(),
    },
    {
      name: "string",
      symbols: [{ literal: "'" }, "string$ebnf$2", { literal: "'" }],
      postprocess: (d) => {
        const contentArr = d[1].map((x) => (x instanceof Array ? x[0] : x));
        return contentArr.join("");
      },
    },

    // optional whitespace
    {
      name: "_$ebnf$1",
      symbols: [/[\s]/],
    },
    {
      name: "_$ebnf$1",
      symbols: ["_$ebnf$1", /[\s]/],
      postprocess: (d) => d.flat(),
    },
    {
      name: "_",
      symbols: ["_$ebnf$1"],
      postprocess: () => null,
    },
    {
      name: "__$ebnf$1",
      symbols: [/[\s]/],
      postprocess: (d) => d,
    },
    {
      name: "__$ebnf$1",
      symbols: ["__$ebnf$1", /[\s]/],
      postprocess: (d) => d.flat(),
    },
    {
      name: "__",
      symbols: ["__$ebnf$1"],
      postprocess: () => null,
    },
  ],
  ParserStart: "Expression",
};

/**
 * Nearley Grammar object -> nearley.Parser
 */
const compiledGrammar = Grammar.fromCompiled(htlGrammar);

/**
 * parseHtlExpression(exprString):
 *  - exprString: "myVar && myVar < 10 ? 'yes' : 'no'"
 *  - returns: AST object
 */
export function parseHtlExpression(exprString) {
  const parser = new Parser(compiledGrammar);
  parser.feed(exprString);

  // nearley는 여러 parse 결과가 생길 수 있음. 보통 [0]만 사용
  const results = parser.results;
  if (results.length === 0) {
    throw new Error("Parsing failed (no parse found)");
  } else if (results.length > 1) {
    // Ambiguous grammar => 여러 파스 트리
    // HTL 스펙상 애매모호성이 크지 않다면 보통 1개
    // 여기서는 그냥 0번만 반환
    // 필요 시 모든 parse tree 비교 가능
  }
  return results[0];
}
