import antlr4 from "antlr4";

export const TOKEN_TYPES = {
  EXPR_START: "EXPR_START", // "${"
  EXPR_END: "EXPR_END", // "}"
  BOOL_CONSTANT: "BOOL_CONSTANT", // "true", "false"
  FLOAT: "FLOAT", // 부동소수점 숫자
  INT: "INT", // 정수
  STRING: "STRING", // 따옴표로 묶인 문자열
  ID: "ID", // 식별자 (알파벳, _로 시작)
  DOT: "DOT", // "."
  LBRACKET: "LBRACKET", // "["
  RBRACKET: "RBRACKET", // "]"
  LPAR: "LPAR", // "("
  RPAR: "RPAR", // ")"
  COMMA: "COMMA", // ","
  COLON: "COLON", // ":"
  QUESTION: "QUESTION", // "?"
  NOT: "NOT", // "!"
  AND_OP: "AND_OP", // "&&"
  OR_OP: "OR_OP", // "||"
  ASSIGN: "ASSIGN", // "="
  WS: "WS", // 공백 (스킵)
  UNKNOWN: "UNKNOWN", // 알 수 없는 토큰
  EOF: "EOF",
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

/**
 * createLexer 함수는 입력(문자열 또는 antlr4.InputStream 객체)을 받아
 * 내부 토큰 배열을 생성한 후, nextToken, peekToken 등의 함수형 인터페이스를 반환합니다.
 */
export function createLexer(input) {
  // input이 문자열이면 그대로 사용, 그렇지 않으면 input.strdata 속성을 사용
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
        // WS 토큰은 건너뜁니다.
        if (matchedType !== TOKEN_TYPES.WS) {
          tokens.push({ type: matchedType, value: tokenValue, index: pos });
        }
        pos += tokenValue.length;
      } else {
        // 매칭되지 않는 경우 UNKNOWN 토큰 생성
        tokens.push({
          type: TOKEN_TYPES.UNKNOWN,
          value: inputStr[pos],
          index: pos,
        });
        pos++;
      }
    }
    // 입력의 끝에 EOF 토큰 추가
    tokens.push({ type: TOKEN_TYPES.EOF, value: "<EOF>", index: pos });
  }

  tokenize();
  // 함수형 객체 생성
  const lexerObj = {
    nextToken: () => tokens.shift(),
    peekToken: () => tokens[0],
    getAllTokens: () => tokens.slice(),
  };

  // antlr4.Lexer의 프로토타입을 상속하도록 설정
  Object.setPrototypeOf(lexerObj, antlr4.Lexer.prototype);

  return lexerObj;
}
