// src/expressions/HTLExpressionParser.js
export class HTLExpressionParser {
  constructor(input) {
    this.input = input;
    this.pos = 0;
  }

  peek() {
    return this.input[this.pos];
  }

  consume() {
    return this.input[this.pos++];
  }

  eof() {
    return this.pos >= this.input.length;
  }

  skipWhitespace() {
    while (!this.eof() && /\s/.test(this.peek())) {
      this.consume();
    }
  }

  /**
   * parseExpression
   * 입력된 HTL 표현식 문자열에서 시작과 끝 구분자인 "${"와 "}"를 제거하고,
   * '@' 기호를 기준으로 메인 표현식과 옵션 부분을 분리한 후 AST 노드를 반환합니다.
   *
   * @returns {object} - { type: "HTLExpression", expression, options }
   */
  parseExpression() {
    // 전체 입력에서 양쪽 공백 제거 후, ${ 와 } 제거
    if (this.input.startsWith("${") && this.input.endsWith("}")) {
      this.input = this.input.slice(2, -1).trim();
      this.pos = 0;
    }

    // '@' 기호를 기준으로 메인 표현식과 옵션 부분 분리
    let mainExpression = "";
    let options = {};
    const atIndex = this.input.indexOf("@");
    if (atIndex !== -1) {
      mainExpression = this.input.substring(0, atIndex).trim();
      const optionsText = this.input.substring(atIndex + 1).trim();
      // 정규표현식을 사용하여 옵션 파싱: key[=value] 형태로, 값은 따옴표로 감싼 문자열이나 그렇지 않은 값
      const optionRegex = /(\w+)(?:=(('[^']*'|"[^"]*"|[^,]+)))?/g;
      let match;
      while ((match = optionRegex.exec(optionsText)) !== null) {
        const key = match[1].trim();
        const value = match[2] ? match[2].trim() : true;
        options[key] = value;
      }
    } else {
      mainExpression = this.input;
    }

    return {
      type: "HTLExpression",
      expression: mainExpression,
      options: options,
    };
  }

  // 삼항 연산자 파싱: expr ? expr : expr
  parseTernary() {
    let condition = this.parseOr();
    this.skipWhitespace();
    if (!this.eof() && this.peek() === "?") {
      this.consume(); // '?' 소비
      let trueExpr = this.parseExpression();
      this.skipWhitespace();
      if (this.consume() !== ":") {
        throw new Error("Expected ':' in ternary expression");
      }
      let falseExpr = this.parseExpression();
      return {
        type: "TernaryExpression",
        condition,
        trueExpr,
        falseExpr,
      };
    }
    return condition;
  }

  // 논리 OR 파싱
  parseOr() {
    let left = this.parseAnd();
    this.skipWhitespace();
    while (!this.eof() && this.input.startsWith("||", this.pos)) {
      this.pos += 2;
      let right = this.parseAnd();
      left = {
        type: "LogicalExpression",
        operator: "||",
        left,
        right,
      };
      this.skipWhitespace();
    }
    return left;
  }

  // 논리 AND 파싱
  parseAnd() {
    let left = this.parseEquality();
    this.skipWhitespace();
    while (!this.eof() && this.input.startsWith("&&", this.pos)) {
      this.pos += 2;
      let right = this.parseEquality();
      left = {
        type: "LogicalExpression",
        operator: "&&",
        left,
        right,
      };
      this.skipWhitespace();
    }
    return left;
  }

  // 등가 비교 파싱 (==)
  parseEquality() {
    let left = this.parsePrimary();
    this.skipWhitespace();
    if (!this.eof() && this.input.startsWith("==", this.pos)) {
      this.pos += 2;
      let right = this.parsePrimary();
      return {
        type: "BinaryExpression",
        operator: "==",
        left,
        right,
      };
    }
    return left;
  }

  // primary expression: 리터럴, 식별자, 배열, 괄호, 부정, 등
  parsePrimary() {
    this.skipWhitespace();
    if (this.eof()) {
      throw new Error("Unexpected end of input");
    }
    const char = this.peek();
    if (char === "'" || char === '"') {
      return this.parseString();
    } else if (/\d/.test(char)) {
      return this.parseNumber();
    } else if (char === "[") {
      return this.parseArray();
    } else if (char === "(") {
      this.consume(); // '(' 소비
      let expr = this.parseExpression();
      this.skipWhitespace();
      if (this.consume() !== ")") {
        throw new Error("Expected ')' after expression");
      }
      return expr;
    } else if (char === "!") {
      this.consume(); // '!' 소비
      let argument = this.parsePrimary();
      return {
        type: "UnaryExpression",
        operator: "!",
        argument,
      };
    } else if (/[a-zA-Z_]/.test(char)) {
      return this.parseIdentifierOrBoolean();
    }
    throw new Error("Unexpected character: " + char);
  }

  parseString() {
    const quote = this.consume(); // 따옴표 소비
    let str = "";
    while (!this.eof() && this.peek() !== quote) {
      let c = this.consume();
      if (c === "\\") {
        c = this.consume();
      }
      str += c;
    }
    if (this.eof() || this.consume() !== quote) {
      throw new Error("Unterminated string literal");
    }
    return { type: "Literal", value: str };
  }

  parseNumber() {
    let numStr = "";
    while (!this.eof() && /[\d.]/.test(this.peek())) {
      numStr += this.consume();
    }
    return { type: "Literal", value: Number(numStr) };
  }

  parseArray() {
    let elements = [];
    this.consume(); // '[' 소비
    this.skipWhitespace();
    while (!this.eof() && this.peek() !== "]") {
      let element = this.parseExpression();
      elements.push(element);
      this.skipWhitespace();
      if (!this.eof() && this.peek() === ",") {
        this.consume();
        this.skipWhitespace();
      } else {
        break;
      }
    }
    if (this.eof() || this.consume() !== "]") {
      throw new Error("Expected ']' at end of array literal");
    }
    return { type: "ArrayExpression", elements };
  }

  parseIdentifierOrBoolean() {
    let id = "";
    while (!this.eof() && /[a-zA-Z0-9_]/.test(this.peek())) {
      id += this.consume();
    }
    if (id === "true" || id === "false") {
      return { type: "Literal", value: id === "true" };
    }
    return { type: "Identifier", name: id };
  }
}
