import antlr4 from "antlr4";
import SightlyLexer from "../generated/SightlyLexer.js";
import SightlyParser from "../generated/SightlyParser.js";

/**
 * HTL 표현식(예: "${myVar && myVar > 0}")을 파싱하여
 * ANTLR parse tree (or AST)로 반환한다.
 */
export function parseHTLExpression(expressionString) {
  // 1) antlr4.InputStream으로 변환
  const chars = new antlr4.InputStream(expressionString);

  // 2) Lexer로 토큰 생성
  const lexer = new SightlyLexer(chars);
  const tokens = new antlr4.CommonTokenStream(lexer);

  // 3) Parser 생성 & parse tree 만들기
  const parser = new SightlyParser(tokens);
  parser.buildParseTrees = true;

  // interpolation 규칙(혹은 expression 규칙 등) 시작
  const tree = parser.interpolation();

  return tree;
}
