export const TOKEN_TYPES = {
  EXPR_START: "EXPR_START",
  EXPR_END: "EXPR_END",
  BOOL_CONSTANT: "BOOL_CONSTANT",
  FLOAT: "FLOAT",
  INT: "INT",
  STRING: "STRING",
  ID: "ID",
  DOT: "DOT",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  LPAR: "LPAR",
  RPAR: "RPAR",
  COMMA: "COMMA",
  COLON: "COLON",
  QUESTION: "QUESTION",
  NOT: "NOT",
  AND_OP: "AND_OP",
  OR_OP: "OR_OP",
  ASSIGN: "ASSIGN",
  WS: "WS",
  UNKNOWN: "UNKNOWN",
  EOF: "EOF",
  EQ: "EQ", // "=="
  NEQ: "NEQ", // "!="
};

const tokenSpecs = [
  { type: TOKEN_TYPES.WS, regex: /^[ \t\n\r]+/ },
  { type: TOKEN_TYPES.EXPR_START, regex: /^\$\{/ },
  { type: TOKEN_TYPES.EXPR_END, regex: /^\}/ },
  { type: TOKEN_TYPES.BOOL_CONSTANT, regex: /^(true|false)\b/ },
  { type: TOKEN_TYPES.FLOAT, regex: /^-?(?:[1-9]\d*\.\d+|0\.\d+)/ },
  { type: TOKEN_TYPES.INT, regex: /^-?(?:[1-9]\d*|0)\b/ },
  {
    type: TOKEN_TYPES.STRING,
    regex: /^"([^"\\]*(\\.[^"\\]*)*)"|^'([^'\\]*(\\.[^'\\]*)*)'/,
  },
  { type: TOKEN_TYPES.ID, regex: /^[a-zA-Z_][a-zA-Z0-9_]*/ },

  // 다중 문자 연산자를 단일 문자 연산자보다 먼저 매칭하도록 한다.
  { type: TOKEN_TYPES.EQ, regex: /^==/ },
  { type: TOKEN_TYPES.NEQ, regex: /^!=/ },

  { type: TOKEN_TYPES.DOT, regex: /^\./ },
  { type: TOKEN_TYPES.LBRACKET, regex: /^\[/ },
  { type: TOKEN_TYPES.RBRACKET, regex: /^\]/ },
  { type: TOKEN_TYPES.LPAR, regex: /^\(/ },
  { type: TOKEN_TYPES.RPAR, regex: /^\)/ },
  { type: TOKEN_TYPES.COMMA, regex: /^,/ },
  { type: TOKEN_TYPES.COLON, regex: /^:/ },
  { type: TOKEN_TYPES.QUESTION, regex: /^\?/ },
  { type: TOKEN_TYPES.NOT, regex: /^!/ },
  { type: TOKEN_TYPES.AND_OP, regex: /^&&/ },
  { type: TOKEN_TYPES.OR_OP, regex: /^\|\|/ },
  { type: TOKEN_TYPES.ASSIGN, regex: /^=/ },
];

export function createLexer(input) {
  const inputStr = typeof input === "string" ? input : input.strdata || "";
  let pos = 0;
  const tokens = [];

  function tokenize() {
    while (pos < inputStr.length) {
      let match = null;
      let matchedType = null;
      for (const spec of tokenSpecs) {
        match = inputStr.slice(pos).match(spec.regex);
        if (match) {
          matchedType = spec.type;
          break;
        }
      }
      if (match) {
        const tokenValue = match[0];
        if (matchedType !== TOKEN_TYPES.WS) {
          tokens.push({ type: matchedType, value: tokenValue, index: pos });
        }
        pos += tokenValue.length;
      } else {
        tokens.push({
          type: TOKEN_TYPES.UNKNOWN,
          value: inputStr[pos],
          index: pos,
        });
        pos++;
      }
    }
    tokens.push({ type: TOKEN_TYPES.EOF, value: "<EOF>", index: pos });
  }

  tokenize();

  let index = 0;
  const lexerObj = {
    nextToken: () => {
      if (index < tokens.length) {
        return tokens[index++];
      } else {
        return { type: TOKEN_TYPES.EOF, value: "<EOF>", index: pos };
      }
    },
    peekToken: () => tokens[index],
    getAllTokens: () => tokens.slice(),
    reset: () => {
      index = 0;
    },
  };

  return lexerObj;
}
