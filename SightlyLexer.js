class SightlyLexer {
  constructor(input) {
    this.input = input;
    this.position = 0;
  }

  nextToken() {
    if (this.position >= this.input.length) {
      return null;
    }

    let char = this.input[this.position++];

    if (/\s/.test(char)) {
      return this.nextToken();
    }

    if (char === "$" && this.input[this.position] === "{") {
      this.position++;
      return { type: "EXPRESSION_START", value: "${" };
    }

    if (char === "}") {
      return { type: "EXPRESSION_END", value: "}" };
    }

    return { type: "TEXT", value: char };
  }

  tokenize() {
    let tokens = [];
    let token;
    while ((token = this.nextToken()) !== null) {
      if (token) {
        // **✅ token이 `null`이 아닌 경우만 추가**
        tokens.push(token);
      }
    }
    return tokens;
  }
}

export default SightlyLexer;
