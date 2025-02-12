// HtlTemplateConverter.js
import * as cheerio from "cheerio";
import { createLexer } from "./SightlyLexer.js";
import { createParser } from "./SightlyParser.js";
import HtlExpressionVisitor from "./HtlExpressionVisitor.js";

/**
 * HTL 표현식 문자열을 파싱하여 JavaScript 표현식으로 변환합니다.
 * 만약 입력이 올바른 HTL 표현식("${...}") 형태가 아니라면 원본 문자열을 반환합니다.
 */
function parseHTLExpression(exprStr) {
  exprStr = exprStr.trim();
  if (!exprStr.startsWith("${") || !exprStr.endsWith("}")) {
    console.warn("HTL 표현식 형식이 올바르지 않습니다:", exprStr);
    return exprStr;
  }
  // 매번 새로운 Lexer 인스턴스를 생성합니다.
  const lexer = createLexer(exprStr);
  const parser = createParser(lexer);
  const tree = parser.expression();
  const visitor = new HtlExpressionVisitor();
  return visitor.visit(tree);
}

/**
 * HTL 템플릿(HTML 문자열)을 React 컴포넌트 코드(함수형 컴포넌트)로 변환합니다.
 */
export function convertHTLTemplateToReact(templateStr) {
  const $ = cheerio.load(templateStr, {
    xmlMode: false,
    decodeEntities: false,
  });

  // --- data-sly-test 처리 ---
  $("[data-sly-test]").each(function () {
    const raw = ($(this).attr("data-sly-test") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).removeAttr("data-sly-test");
    const html = $.html(this);
    $(this).replaceWith(
      `{/* HTL test: ${transformed} */}${html}{/* End HTL test */}`
    );
  });

  // --- data-sly-text 처리 ---
  $("[data-sly-text]").each(function () {
    const raw = ($(this).attr("data-sly-text") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).empty().append(`{${transformed}}`);
    $(this).removeAttr("data-sly-text");
  });

  // --- data-sly-list 처리 ---
  $("[data-sly-list]").each(function () {
    const raw = ($(this).attr("data-sly-list") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).removeAttr("data-sly-list");
    const tag = $(this)[0].tagName;
    const innerHtml = $(this).html();
    const newHtml = `{${transformed}.map((item, index) => (<${tag} key={index}>${innerHtml.replace(
      /\$\{item\}/g,
      "{item}"
    )}</${tag}>))}`;
    $(this).replaceWith(newHtml);
  });

  // --- data-sly-use 처리 ---
  $("[data-sly-use]").each(function () {
    const attribs = this.attribs;
    let uses = [];
    for (const key in attribs) {
      if (key.startsWith("data-sly-use")) {
        const raw = (attribs[key] || "").trim();
        let varName = "useBean";
        if (key.includes(".")) {
          varName = key.split(".")[1];
        }
        const transformed = parseHTLExpression(raw);
        uses.push(`${varName} = ${transformed}`);
        $(this).removeAttr(key);
      }
    }
    if (uses.length > 0) {
      $(this).before(`{/* HTL use: ${uses.join(", ")} */}`);
    }
  });

  // --- data-sly-set 처리 ---
  $("[data-sly-set]").each(function () {
    const raw = ($(this).attr("data-sly-set") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).replaceWith(`{/* HTL set: ${transformed} */}`);
  });

  // --- data-sly-attribute (object 형태) 처리 ---
  $("[data-sly-attribute]").each(function () {
    const raw = ($(this).attr("data-sly-attribute") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).before(`{/* HTL attribute (object): {...${transformed}} */}`);
    $(this).removeAttr("data-sly-attribute");
  });

  // --- 개별 data-sly-attribute.* 처리 ---
  $("*").each(function () {
    const attribs = this.attribs;
    for (const key in attribs) {
      if (key.startsWith("data-sly-attribute.")) {
        const target = key.split(".")[1];
        const raw = (attribs[key] || "").trim();
        const transformed = parseHTLExpression(raw);
        const reactAttr = target === "class" ? "className" : target;
        $(this).attr(reactAttr, `{${transformed}}`);
        $(this).removeAttr(key);
      }
    }
  });

  // --- data-sly-include 처리 ---
  $("[data-sly-include]").each(function () {
    const raw = ($(this).attr("data-sly-include") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).before(`{/* HTL include: ${transformed} */}`);
    $(this).removeAttr("data-sly-include");
  });

  // --- data-sly-resource 처리 ---
  $("[data-sly-resource]").each(function () {
    const raw = ($(this).attr("data-sly-resource") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).before(`{/* HTL resource: ${transformed} */}`);
    $(this).removeAttr("data-sly-resource");
  });

  // --- data-sly-call 처리 ---
  $("[data-sly-call]").each(function () {
    const raw = ($(this).attr("data-sly-call") || "").trim();
    const transformed = parseHTLExpression(raw);
    $(this).before(`{/* HTL call: ${transformed} */}`);
    $(this).removeAttr("data-sly-call");
  });

  const transformedHtml = $.html();

  const componentCode = `
import React from 'react';

const GeneratedComponent = () => {
  return (
    <>
      ${transformedHtml}
    </>
  );
};

export default GeneratedComponent;
  `;
  return componentCode;
}
