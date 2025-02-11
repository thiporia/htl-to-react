import * as cheerio from "cheerio";
import antlr4 from "antlr4";
import { createLexer } from "./SightlyLexer.js"; // ANTLR4로 생성된 Lexer (ESM 형식)
import { createParser } from "./SightlyParser.js"; // ANTLR4로 생성된 Parser (ESM 형식)
import HtlExpressionVisitor from "./HtlExpressionVisitor.js";

/**
 * HTL 표현식 문자열을 파싱하여 JavaScript 표현식으로 변환하는 함수
 * @param {string} exprStr - HTL 표현식 (예: "user.name")
 * @returns {string} - 변환된 JavaScript 코드 (예: "user.name")
 */
function parseHTLExpression(exprStr) {
  // ANTLR4 InputStream을 사용하여 입력 문자열을 파싱합니다.
  const chars = new antlr4.InputStream(exprStr);
  const lexer = createLexer(chars);

  // const tokens = new antlr4.CommonTokenStream(lexer);
  // const parser = createParser(tokens);
  const parser = createParser(lexer);

  // 'expression' 규칙을 시작 규칙으로 사용하여 parse tree 생성
  const tree = parser.expression();
  const visitor = new HtlExpressionVisitor();
  return visitor.visit(tree);
}

/**
 * HTL 템플릿(HTML 문자열)을 React 컴포넌트 코드로 변환하는 함수
 * @param {string} templateStr - HTL 템플릿 (HTML + HTL 지시어 포함)
 * @returns {string} - 변환된 React 컴포넌트 코드 (JSX)
 */
function convertHTLTemplateToReact(templateStr) {
  const $ = cheerio.load(templateStr, {
    xmlMode: false,
    decodeEntities: false,
  });

  // --- data-sly-test 처리 ---
  // HTL의 data-sly-test="condition"은 React 조건부 렌더링 { condition && (...) }으로 변환합니다.
  $("[data-sly-test]").each(function () {
    const testExprRaw = $(this).attr("data-sly-test").trim();
    const testExpr = parseHTLExpression(testExprRaw);
    $(this).removeAttr("data-sly-test");

    // 기존 요소의 HTML을 조건부 주석으로 감싸는 예시
    const originalHtml = $.html(this);
    $(this).replaceWith(
      `{/* HTL Test 시작: ${testExpr} */}${originalHtml}{/* HTL Test 끝 */}`
    );
  });

  // --- data-sly-text 처리 ---
  // data-sly-text="expression"은 해당 요소의 내부 텍스트를 {expression}으로 대체합니다.
  $("[data-sly-text]").each(function () {
    const textExprRaw = $(this).attr("data-sly-text").trim();
    const textExpr = parseHTLExpression(textExprRaw);
    $(this).empty();
    $(this).append(`{${textExpr}}`);
    $(this).removeAttr("data-sly-text");
  });

  // --- data-sly-list 처리 ---
  // data-sly-list="items"는 리스트 반복 구문으로 변환합니다.
  $("[data-sly-list]").each(function () {
    const listExprRaw = $(this).attr("data-sly-list").trim();
    const listExpr = parseHTLExpression(listExprRaw);
    $(this).removeAttr("data-sly-list");

    // 현재 요소의 태그 이름과 내부 HTML을 가져옵니다.
    const tagName = $(this)[0].tagName;
    const innerHtml = $(this).html();

    // 예시: items.map((item, index) => (<태그 key={index}> ... </태그>))
    const newHtml = `{${listExpr}.map((item, index) => (
      <${tagName} key={index}>
        ${innerHtml.replace(/\$\{item\}/g, "{item}")}
      </${tagName}>
    ))}`;
    $(this).replaceWith(newHtml);
  });

  // --- data-sly-use 처리 ---
  // HTL의 data-sly-use는 외부 모듈이나 로직을 가져와 변수에 할당하는 역할을 합니다.
  // 예: <div data-sly-use.myVar="SomeModule">...</div>
  // 변환 예시: 요소 앞에 주석으로 "HTL use: myVar = SomeModule" 정보를 삽입합니다.
  $("[data-sly-use]").each(function () {
    const attribs = this.attribs;
    let useDirectives = [];
    for (const attrName in attribs) {
      if (attrName.startsWith("data-sly-use")) {
        const value = attribs[attrName].trim();
        // 기본 속성이면 기본 변수 이름 사용, 아니면 점(.) 뒤의 이름 사용
        let varName = "useBean";
        if (attrName.includes(".")) {
          varName = attrName.split(".")[1];
        }
        const moduleExpr = parseHTLExpression(value);
        useDirectives.push(`${varName} = ${moduleExpr}`);
        $(this).removeAttr(attrName);
      }
    }
    if (useDirectives.length > 0) {
      const comment = `{/* HTL use: ${useDirectives.join(", ")} */}`;
      $(this).before(comment);
    }
  });

  // --- data-sly-attribute 처리 ---
  // (1) data-sly-attribute (객체 형태로 여러 속성을 한 번에 지정)
  $("[data-sly-attribute]").each(function () {
    const attrValue = $(this).attr("data-sly-attribute").trim();
    const attributesExpr = parseHTLExpression(attrValue);
    // JSX에서는 {...attributesExpr} 형태로 스프레드 적용할 수 있으므로, 주석으로 남깁니다.
    $(this).before(`{/* HTL attribute (object): {...${attributesExpr}} */}`);
    $(this).removeAttr("data-sly-attribute");
  });

  // (2) 개별 data-sly-attribute.* 처리 (예: data-sly-attribute.class="someClass")
  // 모든 요소를 순회하여 해당 속성이 존재하는지 확인합니다.
  $("*").each(function () {
    const attribs = this.attribs;
    for (const attrName in attribs) {
      if (attrName.startsWith("data-sly-attribute.")) {
        const targetAttr = attrName.split(".")[1]; // 예: "class"
        const attrValueRaw = attribs[attrName].trim();
        const attrValueExpr = parseHTLExpression(attrValueRaw);
        // React에서는 class -> className 변환
        let reactAttrName = targetAttr;
        if (reactAttrName === "class") {
          reactAttrName = "className";
        }
        // 새 속성 추가: reactAttrName={...} (여기서는 문자열로 변환)
        $(this).attr(reactAttrName, `{${attrValueExpr}}`);
        $(this).removeAttr(attrName);
      }
    }
  });

  // --- data-sly-include 처리 ---
  // data-sly-include는 외부 템플릿 파일의 내용을 포함하는 역할을 합니다.
  // 간단 예시: 포함 파일 경로 정보를 주석으로 삽입합니다.
  $("[data-sly-include]").each(function () {
    const includePathRaw = $(this).attr("data-sly-include").trim();
    const includeExpr = parseHTLExpression(includePathRaw);
    $(this).before(`{/* HTL include: ${includeExpr} */}`);
    $(this).removeAttr("data-sly-include");
  });

  // --- 기타 data-sly-* 처리 ---
  // data-sly-resource, data-sly-repeat 등 추가 HTL 지시어가 있다면
  // 유사한 방식으로 처리할 수 있으며, 필요에 따라 확장 가능합니다.

  // 최종 변환된 HTML(실제로는 JSX 코드 조각)을 가져옵니다.
  const transformedTemplate = $.html();

  // React 컴포넌트 코드로 감싸기
  const componentCode = `
import React from 'react';

const GeneratedComponent = () => {
  return (
    <>
      ${transformedTemplate}
    </>
  );
};

export default GeneratedComponent;
  `;
  return componentCode;
}

export { convertHTLTemplateToReact };
