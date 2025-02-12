import SightlyLexer from "./SightlyLexer.js";

class SightlyParser {
  constructor(input) {
    this.lexer = new SightlyLexer(input);
    this.tokens = this.lexer.tokenize();
    this.currentTokenIndex = 0;
  }

  match(expectedType) {
    if (
      this.currentTokenIndex < this.tokens.length &&
      this.tokens[this.currentTokenIndex].type === expectedType
    ) {
      return this.tokens[this.currentTokenIndex++];
    }
    return null;
  }

  parseExpression() {
    let expression = [];
    if (this.match("EXPRESSION_START")) {
      while (
        this.currentTokenIndex < this.tokens.length &&
        this.tokens[this.currentTokenIndex].type !== "EXPRESSION_END"
      ) {
        expression.push(this.tokens[this.currentTokenIndex++].value);
      }
      this.match("EXPRESSION_END");
    }
    return { type: "Expression", value: expression.join("") };
  }

  parse() {
    let ast = { type: "HTLDocument", body: [] };

    while (this.currentTokenIndex < this.tokens.length) {
      if (this.tokens[this.currentTokenIndex].type === "EXPRESSION_START") {
        ast.body.push(this.parseExpression());
      } else {
        ast.body.push({
          type: "Text",
          value: this.tokens[this.currentTokenIndex++].value,
        });
      }
    }
    return ast;
  }
}

export default SightlyParser;
