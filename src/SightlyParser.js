// SightlyParser.js
import { TOKEN_TYPES } from "./SightlyLexer.js";

/**
 * createParser 함수는 lexer (함수형 객체)를 받아 재귀 하강 파서를 클로저로 생성합니다.
 * 반환되는 객체는 expression() 함수를 포함하며, 이는 최상위 파싱 규칙(예: '${' exprNode '}' )을 실행합니다.
 */
export function createParser(lexer) {
  console.log("gave lexer", lexer);
  // 현재 토큰: lexer.nextToken()으로 얻은 토큰
  let currentToken = lexer.nextToken();

  // eat 함수: 현재 토큰이 기대한 타입이면 소비(consumes)하고, 아니라면 에러 발생
  function eat(type) {
    if (currentToken && currentToken.type === type) {
      const token = currentToken;
      currentToken = lexer.nextToken();
      return token;
    } else {
      throw new Error(
        `Unexpected token: expected ${type}, got ${
          currentToken ? currentToken.type : "null"
        } at position ${currentToken ? currentToken.index : "EOF"}`
      );
    }
  }

  // 최상위 규칙: expression = '${' exprNode '}'
  function expression() {
    eat(TOKEN_TYPES.EXPR_START);
    const node = exprNode();
    eat(TOKEN_TYPES.EXPR_END);
    return { type: "expression", children: [node] };
  }

  // exprNode = orExpression (삼항 연산자 등은 미구현)
  function exprNode() {
    return orExpression();
  }

  // orExpression = andExpression ( '||' andExpression )*
  function orExpression() {
    let node = andExpression();
    while (currentToken && currentToken.type === TOKEN_TYPES.OR_OP) {
      const opToken = eat(TOKEN_TYPES.OR_OP);
      const right = andExpression();
      node = { type: "or", value: opToken.value, children: [node, right] };
    }
    return node;
  }

  // andExpression = equalityExpression ( '&&' equalityExpression )*
  function andExpression() {
    let node = equalityExpression();
    while (currentToken && currentToken.type === TOKEN_TYPES.AND_OP) {
      const opToken = eat(TOKEN_TYPES.AND_OP);
      const right = equalityExpression();
      node = { type: "and", value: opToken.value, children: [node, right] };
    }
    return node;
  }

  // equalityExpression = relationalExpression ( ('==' | '!=') relationalExpression )*
  function equalityExpression() {
    let node = relationalExpression();
    while (
      currentToken &&
      (currentToken.value === "==" || currentToken.value === "!=")
    ) {
      const opToken = currentToken;
      eat(currentToken.type);
      const right = relationalExpression();
      node = {
        type: "equality",
        value: opToken.value,
        children: [node, right],
      };
    }
    return node;
  }

  // relationalExpression = additiveExpression ( ('<' | '<=' | '>' | '>=') additiveExpression )*
  function relationalExpression() {
    let node = additiveExpression();
    while (
      currentToken &&
      (currentToken.value === "<" ||
        currentToken.value === "<=" ||
        currentToken.value === ">" ||
        currentToken.value === ">=")
    ) {
      const opToken = currentToken;
      eat(currentToken.type);
      const right = additiveExpression();
      node = {
        type: "relational",
        value: opToken.value,
        children: [node, right],
      };
    }
    return node;
  }

  // additiveExpression = multiplicativeExpression ( ('+' | '-') multiplicativeExpression )*
  function additiveExpression() {
    let node = multiplicativeExpression();
    while (
      currentToken &&
      (currentToken.value === "+" || currentToken.value === "-")
    ) {
      const opToken = currentToken;
      eat(currentToken.type);
      const right = multiplicativeExpression();
      node = {
        type: "additive",
        value: opToken.value,
        children: [node, right],
      };
    }
    return node;
  }

  // multiplicativeExpression = unaryExpression ( ('*' | '/') unaryExpression )*
  function multiplicativeExpression() {
    let node = unaryExpression();
    while (
      currentToken &&
      (currentToken.value === "*" || currentToken.value === "/")
    ) {
      const opToken = currentToken;
      eat(currentToken.type);
      const right = unaryExpression();
      node = {
        type: "multiplicative",
        value: opToken.value,
        children: [node, right],
      };
    }
    return node;
  }

  // unaryExpression = ( '!' )? primary
  function unaryExpression() {
    if (currentToken && currentToken.type === TOKEN_TYPES.NOT) {
      const opToken = eat(TOKEN_TYPES.NOT);
      const node = unaryExpression();
      return { type: "not", value: opToken.value, children: [node] };
    }
    return primary();
  }

  // primary = literal | identifier ( ('.' identifier)* ) | '(' exprNode ')' | arrayLiteral
  function primary() {
    const token = currentToken;
    if (!token) {
      throw new Error("Unexpected end of input in primary");
    }
    if (token.type === TOKEN_TYPES.INT) {
      eat(TOKEN_TYPES.INT);
      return { type: "int", value: token.value };
    } else if (token.type === TOKEN_TYPES.FLOAT) {
      eat(TOKEN_TYPES.FLOAT);
      return { type: "float", value: token.value };
    } else if (token.type === TOKEN_TYPES.STRING) {
      eat(TOKEN_TYPES.STRING);
      let strVal = token.value;
      if (strVal[0] === '"' || strVal[0] === "'") {
        strVal = strVal.slice(1, -1);
      }
      return { type: "string", value: strVal };
    } else if (token.type === TOKEN_TYPES.BOOL_CONSTANT) {
      eat(TOKEN_TYPES.BOOL_CONSTANT);
      return { type: "bool", value: token.value };
    } else if (token.type === TOKEN_TYPES.ID) {
      // 식별자 및 프로퍼티 접근
      let node = { type: "identifier", value: token.value };
      eat(TOKEN_TYPES.ID);
      while (currentToken && currentToken.type === TOKEN_TYPES.DOT) {
        eat(TOKEN_TYPES.DOT);
        const propToken = eat(TOKEN_TYPES.ID);
        node = { type: "property", value: propToken.value, children: [node] };
      }
      return node;
    } else if (token.type === TOKEN_TYPES.LPAR) {
      eat(TOKEN_TYPES.LPAR);
      const node = exprNode();
      eat(TOKEN_TYPES.RPAR);
      return node;
    } else if (token.type === TOKEN_TYPES.LBRACKET) {
      // 배열 리터럴
      eat(TOKEN_TYPES.LBRACKET);
      const elements = [];
      if (currentToken && currentToken.type !== TOKEN_TYPES.RBRACKET) {
        elements.push(exprNode());
        while (currentToken && currentToken.type === TOKEN_TYPES.COMMA) {
          eat(TOKEN_TYPES.COMMA);
          elements.push(exprNode());
        }
      }
      eat(TOKEN_TYPES.RBRACKET);
      return { type: "array", children: elements };
    } else {
      throw new Error(
        `Unexpected token in primary: ${token.type} ("${token.value}") at position ${token.index}`
      );
    }
  }

  return { expression };
}
