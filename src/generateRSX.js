/**
 * AST를 입력받아 React 컴포넌트 코드를 문자열로 생성
 * 여기서는 간단히 "return (<>{...}</>);" 형태의 바디만 만들고,
 * 최종적으로 export default function MyComponent() { ... } 로 감싼다고 가정
 */
export function generateRSX(
  astNodes,
  { componentName = "ConvertedComponent" } = {}
) {
  // astNodes는 배열(루트 노드 여러 개). 재귀 탐색
  const body = astNodes.map((node) => visitNode(node, 0)).join("\n");

  // 기본 골격
  return `
  import React from 'react';
  
  export default function ${componentName}(props) {
    const { heroImage, wcmmode, ...rest } = props; // 예시
    return (
      <>
        ${body}
      </>
    );
  }
  `;
}

// depth는 들여쓰기 용도
function visitNode(node, depth) {
  if (!node) return "";

  switch (node.type) {
    case "Element":
      return renderElement(node, depth);
    case "Text":
      return renderText(node, depth);
    default:
      return "";
  }
}

function renderElement(node, depth) {
  const tag = node.tagName || "div";

  // data-sly-* 속성 처리(조건, 반복 등)는 여기서
  // 단순 attrs => JSX props 변환
  const { conditionJSX, repeatJSX, normalAttrs } = transformHtlAttributes(
    node.attrs
  );

  const indent = "  ".repeat(depth);
  const children = (node.children || [])
    .map((child) => visitNode(child, depth + 1))
    .join("");

  // (1) 조건부인 경우 => { condition && <tag ...>...</tag> }
  if (conditionJSX) {
    return `
  ${indent}{ ${conditionJSX} && (
  ${indent}  <${tag} ${normalAttrs}>
  ${children}
  ${indent}  </${tag}>
  ${indent}) }
  `;
  }

  // (2) 반복문인 경우 => { array.map(...) }
  if (repeatJSX) {
    // repeatJSX 예: "heroImage.ctaList.map((item,idx)=>...)"
    return `
  ${indent}{ ${repeatJSX} => (
  ${indent}  <${tag} ${normalAttrs}>
  ${children}
  ${indent}  </${tag}>
  ${indent}) }
  `;
  }

  // (3) 그냥 일반 노드
  return `
  ${indent}<${tag} ${normalAttrs}>
  ${children}
  ${indent}</${tag}>
  `;
}

function renderText(node, depth) {
  const indent = "  ".repeat(depth);
  // segment를 JS 배열로 구성
  // PlainText => string 그대로
  // HTLExpression => {JS 표현}
  const textOutput = node.contentSegments
    .map((seg) => {
      if (seg.type === "PlainText") {
        return seg.value; // 그대로
      } else if (seg.type === "HTLExpression") {
        // 실제 AST -> JS 변환 로직 필요
        // 여기선 간단히 seg.raw 대체
        // 예) '${heroImage.someVar}' -> {heroImage.someVar}
        const expr = htlExpressionToJs(seg.raw);
        return `\${${expr}}`; // 템플릿 리터럴에서
      }
      return "";
    })
    .join("");

  // JSX에서 <></> 없이 단순 텍스트만 출력할 수도, <span> 감쌀 수도.
  // 여기서는 그냥 {"some text"} 식으로 처리
  return `
  ${indent}{\`${textOutput}\`}
  `;
}

/** data-sly-* 속성 등을 해석해서 React 로직에 맞게 변환 */
function transformHtlAttributes(attrs = {}) {
  let conditionJSX = null;
  let repeatJSX = null;
  const normalAttrList = [];

  for (const [key, val] of Object.entries(attrs)) {
    if (key.startsWith("data-sly-test")) {
      // 예) data-sly-test="${heroImage.variantType}" -> conditionJSX = "heroImage.variantType"
      conditionJSX = htlExpressionToJs(val.raw);
    } else if (key.startsWith("data-sly-list")) {
      // data-sly-list="${heroImage.ctaList}"
      const arrExpr = htlExpressionToJs(val.raw);
      // 예: "heroImage.ctaList.map( (item,idx)=> ... )"
      // 일단 간단히 아래 식 저장해둠
      repeatJSX = `${arrExpr}.map((item, idx)`;
    } else {
      // 일반 속성
      if (typeof val === "string") {
        // 그냥 key="val"
        normalAttrList.push(`${key}="${val}"`);
      } else if (val.type === "HTLExpression") {
        // key={ heroImage.someProp }
        const exprJs = htlExpressionToJs(val.raw);
        normalAttrList.push(`${key}={${exprJs}}`);
      }
    }
  }
  const normalAttrs = normalAttrList.join(" ");
  return { conditionJSX, repeatJSX, normalAttrs };
}

/** 실제 HTL 표현식 -> JS 식으로 간단 변환: 여기서는 raw "${var}" --> "var" 정도로 대체 */
function htlExpressionToJs(rawStr) {
  // 아주 단순: '${heroImage.something}' -> 'heroImage.something'
  // 실제로는 ANTLR Visitor 결과를 이용해 더욱 정교화 가능
  const inner = rawStr.replace(/^\$\{/, "").replace(/\}$/, "").trim();
  return inner;
}
