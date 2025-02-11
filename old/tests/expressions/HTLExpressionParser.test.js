// tests/expressions/HTLExpressionParser.full.test.js
import { HTLExpressionParser } from "../../src/expressions/HTLExpressionParser.js";

describe("HTLExpressionParser - Full Parsing", () => {
  // parseString: 따옴표로 묶인 문자열 리터럴 파싱
  describe("parseString", () => {
    it("parses a simple string literal", () => {
      const parser = new HTLExpressionParser(`'hello'`);
      const node = parser.parseString();
      expect(node).toEqual({ type: "Literal", value: "hello" });
    });

    it("parses a string literal with escaped quotes", () => {
      const parser = new HTLExpressionParser(`"He said, \\"Hi!\\""`);
      const node = parser.parseString();
      expect(node).toEqual({ type: "Literal", value: 'He said, "Hi!"' });
    });
  });

  // parseNumber: 숫자 리터럴 파싱
  describe("parseNumber", () => {
    it("parses an integer literal", () => {
      const parser = new HTLExpressionParser("12345");
      const node = parser.parseNumber();
      expect(node).toEqual({ type: "Literal", value: 12345 });
    });

    it("parses a floating point literal", () => {
      const parser = new HTLExpressionParser("3.14");
      const node = parser.parseNumber();
      expect(node).toEqual({ type: "Literal", value: 3.14 });
    });
  });

  // parseArray: 배열 리터럴 파싱
  describe("parseArray", () => {
    it("parses a simple array literal", () => {
      const parser = new HTLExpressionParser("['a','b','c']");
      const node = parser.parseArray();
      expect(node).toEqual({
        type: "ArrayExpression",
        elements: [
          { type: "Literal", value: "a" },
          { type: "Literal", value: "b" },
          { type: "Literal", value: "c" },
        ],
      });
    });
  });

  // parseIdentifierOrBoolean: 식별자와 불리언 리터럴 파싱
  describe("parseIdentifierOrBoolean", () => {
    it("parses an identifier", () => {
      const parser = new HTLExpressionParser("myVar");
      const node = parser.parseIdentifierOrBoolean();
      expect(node).toEqual({ type: "Identifier", name: "myVar" });
    });

    it("parses the boolean literal true", () => {
      const parser = new HTLExpressionParser("true");
      const node = parser.parseIdentifierOrBoolean();
      expect(node).toEqual({ type: "Literal", value: true });
    });

    it("parses the boolean literal false", () => {
      const parser = new HTLExpressionParser("false");
      const node = parser.parseIdentifierOrBoolean();
      expect(node).toEqual({ type: "Literal", value: false });
    });
  });

  // parsePrimary: primary 표현식(문자열, 숫자, 배열, 괄호, 부정, 식별자/불리언)
  describe("parsePrimary", () => {
    it("parses a string literal", () => {
      const parser = new HTLExpressionParser(`'world'`);
      const node = parser.parsePrimary();
      expect(node).toEqual({ type: "Literal", value: "world" });
    });

    it("parses a number literal", () => {
      const parser = new HTLExpressionParser("987");
      const node = parser.parsePrimary();
      expect(node).toEqual({ type: "Literal", value: 987 });
    });

    it("parses an array literal", () => {
      const parser = new HTLExpressionParser("['x','y']");
      const node = parser.parsePrimary();
      expect(node).toEqual({
        type: "ArrayExpression",
        elements: [
          { type: "Literal", value: "x" },
          { type: "Literal", value: "y" },
        ],
      });
    });

    it("parses a parenthesized expression", () => {
      const parser = new HTLExpressionParser("(true)");
      const node = parser.parsePrimary();
      expect(node).toEqual({ type: "Literal", value: true });
    });

    it("parses a unary expression", () => {
      const parser = new HTLExpressionParser("!false");
      const node = parser.parsePrimary();
      expect(node).toEqual({
        type: "UnaryExpression",
        operator: "!",
        argument: { type: "Literal", value: false },
      });
    });
  });

  // parseEquality: 등가 비교 (==) 파싱
  describe("parseEquality", () => {
    it("parses an equality expression", () => {
      const parser = new HTLExpressionParser("a == b");
      const node = parser.parseEquality();
      expect(node).toEqual({
        type: "BinaryExpression",
        operator: "==",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      });
    });
  });

  // parseAnd: 논리 AND (&&) 파싱
  describe("parseAnd", () => {
    it("parses a logical AND expression", () => {
      const parser = new HTLExpressionParser("a && b");
      const node = parser.parseAnd();
      expect(node).toEqual({
        type: "LogicalExpression",
        operator: "&&",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      });
    });
  });

  // parseOr: 논리 OR (||) 파싱
  describe("parseOr", () => {
    it("parses a logical OR expression", () => {
      const parser = new HTLExpressionParser("a || b");
      const node = parser.parseOr();
      expect(node).toEqual({
        type: "LogicalExpression",
        operator: "||",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      });
    });
  });

  // parseTernary: 삼항 연산자 파싱
  describe("parseTernary", () => {
    it("parses a ternary expression", () => {
      const parser = new HTLExpressionParser("cond ? 'yes' : 'no'");
      const node = parser.parseTernary();
      expect(node).toEqual({
        type: "TernaryExpression",
        condition: { type: "Identifier", name: "cond" },
        trueExpr: { type: "Literal", value: "yes" },
        falseExpr: { type: "Literal", value: "no" },
      });
    });
  });

  // parseExpression (최상위): 전체 "${ ... }" 형식의 표현식 파싱
  describe("parseExpression (top-level)", () => {
    it("parses a full expression with options", () => {
      const parser = new HTLExpressionParser(
        "${ 'hello' @ i18n, locale='en_US' }"
      );
      const node = parser.parseExpression();
      expect(node).toEqual({
        type: "HTLExpression",
        expression: "'hello'",
        options: { i18n: true, locale: "'en_US'" },
      });
    });

    it("parses a full expression without options", () => {
      const parser = new HTLExpressionParser("${ someValue }");
      const node = parser.parseExpression();
      expect(node).toEqual({
        type: "HTLExpression",
        expression: "someValue",
        options: {},
      });
    });
  });
});
