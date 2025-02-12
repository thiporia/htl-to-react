import { parseHTMLtoCheerioDom } from "./parseHTML.js";
import { buildHTLAst } from "./parseHTLExpression.js";

/**
 * HTML + HTL 결합 AST를 만들어 반환
 */
export function generateAST(filePath) {
  const $ = parseHTMLtoCheerioDom(filePath);

  // cheerio의 root에서 body까지 순회(혹은 전체)
  const rootNodes = $.root().children();

  function traverseCheerio($node) {
    // 1) 엘리먼트인지 텍스트인지 판별
    if ($node.type === "tag") {
      return {
        type: "Element",
        tagName: $node.name,
        attrs: extractAttributes($node),
        children: $node
          .contents()
          .map((i, childNode) => traverseCheerio($(childNode)))
          .get(),
      };
    } else if ($node.type === "text") {
      return {
        type: "Text",
        contentSegments: extractTextSegments($node.data),
      };
    }
    // 그 외(sly, comment 등) 필요한 경우 처리
    return null;
  }

  function extractAttributes($node) {
    const attrObj = {};
    const attrMap = $node.attribs || {};
    for (const [key, val] of Object.entries(attrMap)) {
      // HTL 표현식이 들어있는지 검사(ex: data-sly-test="${...}")
      if (val && val.includes("${")) {
        // 실제로 정교하게 정규식으로 여러 개 표현식 파싱 가능
        // 여기서는 간단히 하나만 있다고 가정
        attrObj[key] = {
          type: "HTLExpression",
          raw: val,
          ast: buildHTLAst(val), // ANTLR parse result
        };
      } else {
        attrObj[key] = val;
      }
    }
    return attrObj;
  }

  function extractTextSegments(text) {
    // 정규식으로 "${...}" 패턴을 찾아 분할
    // 예) "Hi ${name}, welcome!"
    // 출력: [ {type:'PlainText', value:'Hi '}, {type:'HTLExpression', raw:'${name}'}, {type:'PlainText', value:', welcome!'} ]
    const segments = [];
    const regex = /\$\{[^}]+\}/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      if (start > lastIndex) {
        segments.push({
          type: "PlainText",
          value: text.slice(lastIndex, start),
        });
      }
      const exprRaw = text.slice(start, end); // '${...}'
      segments.push({
        type: "HTLExpression",
        raw: exprRaw,
        ast: buildHTLAst(exprRaw),
      });
      lastIndex = end;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "PlainText", value: text.slice(lastIndex) });
    }
    return segments;
  }

  // cheerio collection은 여러 루트 노드를 가질 수 있으므로 배열 형태
  const ast = rootNodes.map((i, el) => traverseCheerio($(el))).get();
  return ast;
}
