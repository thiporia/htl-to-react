// parseHtlHtml.js
import * as cheerio from "cheerio";
import fs from "fs";

/**
 * HTL 템플릿(HTML)을 읽어와서 “중간 AST” 구조로 변환
 * - Element 노드, Text 노드 구분
 * - data-sly-* 속성, 일반 속성 분리
 * - 텍스트 내 `${...}` 표현식 세그먼트로 분할
 */
export function parseHtlHtmlFile(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  return parseHtlHtmlString(html);
}

export function parseHtlHtmlString(htmlString) {
  const $ = cheerio.load(htmlString, { decodeEntities: false });

  // cheerio root의 자식들(HTML 문서에서 <html>, <body> 등)을 순회
  const rootNodes = $.root().children();

  // 재귀적으로 DOM -> AST 변환
  const ast = [];
  rootNodes.each((_, node) => {
    const converted = convertNode($(node));
    if (converted) {
      ast.push(converted);
    }
  });
  return ast;
}

/**
 * cheerio Node -> AST 노드
 */
function convertNode($node) {
  if (!$node || !$node[0]) return null;

  const node = $node[0];
  const type = node.type;

  // 1) Element (tag)
  if (type === "tag") {
    const tagName = node.name;
    const attribs = node.attribs || {};

    // data-sly-* 속성 / 일반 속성을 분리
    const dataSlyAttrs = {};
    const normalAttrs = {};

    Object.entries(attribs).forEach(([key, value]) => {
      if (key.startsWith("data-sly-")) {
        // HTL 전용 어트리뷰트
        dataSlyAttrs[key] = value;
      } else {
        normalAttrs[key] = value;
      }
    });

    // 자식 노드 처리
    const childrenAst = [];
    $node.contents().each((_, childNode) => {
      const childConverted = convertNode($node.find(childNode));
      if (childConverted) childrenAst.push(childConverted);
    });

    return {
      type: "Element",
      tagName,
      normalAttrs,
      dataSlyAttrs,
      children: childrenAst,
    };
  }

  // 2) Text
  if (type === "text") {
    const rawText = node.data || "";
    // 텍스트 중 '${...}' 표현식을 분할
    const contentSegments = splitTextSegments(rawText);
    return {
      type: "Text",
      segments: contentSegments,
    };
  }

  // 3) comment 등은 원하는 경우 처리
  if (type === "comment") {
    // HTL comment는 <!--/* ... */--> 형태. 필요하다면 파싱
    return {
      type: "Comment",
      content: node.data,
    };
  }

  // 기타 (directive 등) 무시
  return null;
}

/**
 * 텍스트에서 '${...}' 구문을 찾아 세그먼트로 분리
 * ex) "Hello ${name}, age ${age}"
 *
 * return 예:
 * [
 *   { type: 'PlainText', value: 'Hello ' },
 *   { type: 'HtlExpression', raw: '${name}' },
 *   { type: 'PlainText', value: ', age ' },
 *   { type: 'HtlExpression', raw: '${age}' },
 * ]
 */
function splitTextSegments(text) {
  const regex = /\$\{[^}]*\}/g; // '${'로 시작해서 '}'까지
  let lastIndex = 0;
  const result = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    // 이전 plain text
    if (start > lastIndex) {
      result.push({
        type: "PlainText",
        value: text.slice(lastIndex, start),
      });
    }
    // expression
    const expressionRaw = match[0]; // '${...}'
    result.push({
      type: "HtlExpression",
      raw: expressionRaw,
    });
    lastIndex = regex.lastIndex;
  }
  // 남은 뒤쪽 plain text
  if (lastIndex < text.length) {
    result.push({
      type: "PlainText",
      value: text.slice(lastIndex),
    });
  }

  return result;
}
