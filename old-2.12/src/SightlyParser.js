// SightlyParser.js
import { TOKEN_TYPES } from "./SightlyLexer.js";

export function createParser(lexer) {
  let currentToken = lexer.nextToken();

  function eat(expectedType) {
    if (!currentToken) {
      throw new Error(
        `Unexpected token: expected ${expectedType}, but reached end-of-input.`
      );
    }
    if (currentToken.type === TOKEN_TYPES.EOF) {
      if (expectedType === TOKEN_TYPES.EOF) {
        return currentToken;
      } else {
        throw new Error(
          `Unexpected token: expected ${expectedType}, got EOF at position ${currentToken.index}`
        );
      }
    }
    if (currentToken.type === expectedType) {
      const token = currentToken;
      currentToken = lexer.nextToken();
      return token;
    } else {
      throw new Error(
        `Unexpected token: expected ${expectedType}, got ${currentToken.type} at position ${currentToken.index}`
      );
    }
  }

  function expression() {
    eat(TOKEN_TYPES.EXPR_START);
    const node = exprNode();
    eat(TOKEN_TYPES.EXPR_END);
    return { type: "expression", children: [node] };
  }

  function exprNode() {
    let node = orExpression();
    // 삼항 연산자 처리: 만약 현재 토큰이 QUESTION이면,
    if (currentToken && currentToken.type === TOKEN_TYPES.QUESTION) {
      eat(TOKEN_TYPES.QUESTION);
      const thenExpr = orExpression();
      eat(TOKEN_TYPES.COLON);
      const elseExpr = orExpression();
      node = {
        type: "ternary",
        condition: node,
        then: thenExpr,
        else: elseExpr,
      };
    }
    return node;
  }

  function orExpression() {
    let node = andExpression();
    while (currentToken && currentToken.type === TOKEN_TYPES.OR_OP) {
      const opToken = eat(TOKEN_TYPES.OR_OP);
      const right = andExpression();
      node = { type: "or", value: opToken.value, children: [node, right] };
    }
    return node;
  }

  function andExpression() {
    let node = equalityExpression();
    while (currentToken && currentToken.type === TOKEN_TYPES.AND_OP) {
      const opToken = eat(TOKEN_TYPES.AND_OP);
      const right = equalityExpression();
      node = { type: "and", value: opToken.value, children: [node, right] };
    }
    return node;
  }

  function equalityExpression() {
    let node = relationalExpression();
    while (
      currentToken &&
      (currentToken.type === "EQ" || currentToken.type === "NEQ")
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

  function unaryExpression() {
    if (currentToken && currentToken.type === TOKEN_TYPES.NOT) {
      const opToken = eat(TOKEN_TYPES.NOT);
      const node = unaryExpression();
      return { type: "not", value: opToken.value, children: [node] };
    }
    return primary();
  }

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
