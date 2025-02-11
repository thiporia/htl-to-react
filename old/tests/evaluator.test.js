// 일반 구조의 type에 따른 AST 노드 평가 테스트
import { evaluateAST, setGlobalDI } from "../src/evaluator.js";

describe("evaluateAST with global DI", () => {
  // 더미 DI 함수들
  const dummyTranslate = (value, locale) => `translate(${value}, ${locale})`;
  const dummyEscape = (value, ctx) => `escape(${value}, ${ctx})`;
  const dummyFormat = (value, fmt) => `format(${value}, ${fmt})`;
  const localeForCtx = "en_US";

  beforeAll(() => {
    // 전역 DI 객체 설정
    setGlobalDI({
      translate: dummyTranslate,
      escapeForContext: dummyEscape,
      format: dummyFormat,
      localeForCtx,
    });
  });

  test("throws error if global DI is not set", () => {
    // 임시로 전역 DI를 null로 설정한 후, 에러 발생 여부 테스트
    setGlobalDI(null);
    const ast = {
      type: "HTLExpression",
      expression: { type: "Literal", value: "hello" },
      options: { i18n: true },
    };
    expect(() => evaluateAST(ast, {})).toThrow("Global DI not set");
    // 다시 전역 DI를 복구
    setGlobalDI({
      translate: dummyTranslate,
      escapeForContext: dummyEscape,
      format: dummyFormat,
      localeForCtx,
    });
  });

  test("evaluates a Literal node", () => {
    const node = { type: "Literal", value: "hello" };
    expect(evaluateAST(node)).toBe("hello");
  });

  test("evaluates an Identifier node", () => {
    const node = { type: "Identifier", name: "x" };
    const env = { x: 42 };
    expect(evaluateAST(node, env)).toBe(42);
  });

  test("evaluates a UnaryExpression (not)", () => {
    const node = {
      type: "UnaryExpression",
      operator: "!",
      argument: { type: "Literal", value: false },
    };
    expect(evaluateAST(node)).toBe(true);
  });

  test("evaluates a BinaryExpression with '=='", () => {
    const node = {
      type: "BinaryExpression",
      operator: "==",
      left: { type: "Literal", value: 10 },
      right: { type: "Literal", value: "10" },
    };
    // 10 == "10" is true (비교는 느슨한 비교)
    expect(evaluateAST(node)).toBe(true);
  });

  test("evaluates a BinaryExpression with '<'", () => {
    const node = {
      type: "BinaryExpression",
      operator: "<",
      left: { type: "Literal", value: 5 },
      right: { type: "Literal", value: 10 },
    };
    expect(evaluateAST(node)).toBe(true);
  });

  test("evaluates a BinaryExpression with 'in' operator (array)", () => {
    const node = {
      type: "BinaryExpression",
      operator: "in",
      left: { type: "Literal", value: 3 },
      right: { type: "Literal", value: [1, 2, 3, 4] },
    };
    expect(evaluateAST(node)).toBe(true);
  });

  test("evaluates a BinaryExpression with 'in' operator (object)", () => {
    const node = {
      type: "BinaryExpression",
      operator: "in",
      left: { type: "Literal", value: "prop" },
      right: { type: "Literal", value: { prop: "value" } },
    };
    expect(evaluateAST(node)).toBe(true);
  });

  test("evaluates a LogicalExpression with '||'", () => {
    const node = {
      type: "LogicalExpression",
      operator: "||",
      left: { type: "Literal", value: false },
      right: { type: "Literal", value: "fallback" },
    };
    expect(evaluateAST(node)).toBe("fallback");
  });

  test("evaluates a LogicalExpression with '&&'", () => {
    const node = {
      type: "LogicalExpression",
      operator: "&&",
      left: { type: "Literal", value: "first" },
      right: { type: "Literal", value: "second" },
    };
    expect(evaluateAST(node)).toBe("second");
  });

  test("evaluates a TernaryExpression", () => {
    const node = {
      type: "TernaryExpression",
      condition: { type: "Literal", value: true },
      trueExpr: { type: "Literal", value: "yes" },
      falseExpr: { type: "Literal", value: "no" },
    };
    expect(evaluateAST(node)).toBe("yes");
  });

  test("Comparison operator (==)", () => {
    // 표현식: 10 == "10" → 느슨한 비교이므로 true
    const ast = {
      type: "BinaryExpression",
      operator: "==",
      left: { type: "Literal", value: 10 },
      right: { type: "Literal", value: "10" },
    };
    expect(evaluateAST(ast, {})).toBe(true);
  });

  test("Relational operator (<)", () => {
    // 표현식: 5 < 10
    const ast = {
      type: "BinaryExpression",
      operator: "<",
      left: { type: "Literal", value: 5 },
      right: { type: "Literal", value: 10 },
    };
    expect(evaluateAST(ast, {})).toBe(true);
  });

  test("Relational operator (>=)", () => {
    // 표현식: 10 >= 10
    const ast = {
      type: "BinaryExpression",
      operator: ">=",
      left: { type: "Literal", value: 10 },
      right: { type: "Literal", value: 10 },
    };
    expect(evaluateAST(ast, {})).toBe(true);
  });

  test("in operator with array", () => {
    // 표현식: 3 in [1,2,3,4]
    const ast = {
      type: "BinaryExpression",
      operator: "in",
      left: { type: "Literal", value: 3 },
      right: { type: "Literal", value: [1, 2, 3, 4] },
    };
    expect(evaluateAST(ast, {})).toBe(true);
  });

  test("in operator with object", () => {
    // 표현식: "prop" in { prop: "value" }
    const ast = {
      type: "BinaryExpression",
      operator: "in",
      left: { type: "Literal", value: "prop" },
      right: { type: "Literal", value: { prop: "value" } },
    };
    expect(evaluateAST(ast, {})).toBe(true);
  });

  test("evaluates a MemberExpression with dot notation", () => {
    const node = {
      type: "MemberExpression",
      computed: false,
      object: { type: "Identifier", name: "obj" },
      property: { type: "Identifier", name: "prop" },
    };
    const env = { obj: { prop: 123 } };
    expect(evaluateAST(node, env)).toBe(123);
  });

  test("evaluates a MemberExpression with bracket notation", () => {
    const node = {
      type: "MemberExpression",
      computed: true,
      object: { type: "Identifier", name: "obj" },
      property: { type: "Literal", value: "key" },
    };
    const env = { obj: { key: "value" } };
    expect(evaluateAST(node, env)).toBe("value");
  });

  it("evaluates HTLExpression with i18n option only", () => {
    const ast = {
      type: "HTLExpression",
      // 내부 expression이 Literal 노드라고 가정 (이미 파싱된 AST)
      expression: { type: "Literal", value: "hello" },
      options: { i18n: true },
    };

    const result = evaluateAST(ast, {});
    expect(result).toBe("translate(hello, en_US)");
  });

  it("evaluates HTLExpression with format option only", () => {
    const ast = {
      type: "HTLExpression",
      expression: { type: "Literal", value: "12345" },
      options: { format: "myFormat" },
    };

    const result = evaluateAST(ast, {});
    // format 옵션만 있으면, 먼저 평가된 값 "12345"에 대해 dummyFormat 적용
    expect(result).toBe("format(12345, myFormat)");
  });

  it("evaluates HTLExpression with both i18n and format options", () => {
    const ast = {
      type: "HTLExpression",
      expression: { type: "Literal", value: "hello" },
      options: { i18n: true, format: "myFormat" },
    };

    const result = evaluateAST(ast, {});
    // 순서: 먼저 translate -> dummyTranslate("hello", "en_US") = "translated(hello, en_US)"
    // 그리고 format 적용: dummyFormat("translated(hello, en_US)", "myFormat") = "formatted(translated(hello, en_US), myFormat)"
    expect(result).toBe("format(translate(hello, en_US), myFormat)");
  });

  it("evaluates HTLExpression with no options", () => {
    const ast = {
      type: "HTLExpression",
      expression: { type: "Literal", value: "no options" },
      options: {},
    };

    const result = evaluateAST(ast, {});
    expect(result).toBe("no options");
  });
});
