const { parseDocument } = require("htmlparser2");

/**
 * 원본 노드를 문자열로 생성하는 헬퍼 함수.
 * 태그명, 속성, 자식 노드를 그대로 결합합니다.
 */
function originalNodeString(elem) {
  let attrs = "";
  for (let key in elem.attribs) {
    attrs += ` ${key}="${elem.attribs[key]}"`;
  }
  let children = "";
  if (elem.childNodes && elem.childNodes.length > 0) {
    children = elem.childNodes
      .map((child) => {
        if (child.type === "text") return child.data;
        if (child.type === "tag") return originalNodeString(child);
        return "";
      })
      .join("");
  }
  return `<${elem.name}${attrs}>${children}</${elem.name}>`;
}

/**
 * HTML 속성명을 JSX 규칙에 맞게 변환하는 함수
 * (예: class → className, for → htmlFor, srcset → srcSet 등)
 */
function transformAttrName(attr) {
  if (attr === "class") return "className";
  if (attr === "for") return "htmlFor";
  if (attr.toLowerCase() === "srcset") return "srcSet";
  return attr;
}

/**
 * 주어진 문자열이 동적 표현식(예: ${ ... })이면 내부를 반환
 */
function extractDynamicExpression(str) {
  return str.slice(2, -1).trim();
}

/**
 * 주어진 동적 표현식에 "@ context='scriptString'", "@ context='html'" 또는 "@ i18n"이 포함되어 있으면
 * 해당 패턴을 제거하거나 필요한 경우 함수를 호출하도록 치환하는 함수
 *
 * 예:
 *   - "ctaItems.ctaUrl @ context='scriptString'" → "ctaItems.ctaUrl"
 *   - "'Play video' @ i18n" → "t('Play video')"
 *   - "nuggetItems.nuggetEyebrow @ context='html'" → "parse(nuggetItems.nuggetEyebrow)"
 */
function processDynamicExpression(expr) {
  const scriptStringMatch = expr.match(
    /^(.*?)\s*@\s*context=['"]scriptString['"]\s*$/
  );
  if (scriptStringMatch) {
    return scriptStringMatch[1].trim();
  }
  const htmlContextMatch = expr.match(/^(.*?)\s*@\s*context=['"]html['"]\s*$/);
  if (htmlContextMatch) {
    const inner = htmlContextMatch[1].trim();
    return `parse(${inner})`;
  }
  const i18nMatch = expr.match(/^(.*?)\s*@\s*i18n\s*$/);
  if (i18nMatch) {
    const inner = i18nMatch[1].trim();
    return `t(${inner})`;
  }
  return expr;
}

/**
 * 텍스트 노드 내의 동적 표현식(${ ... })을 처리하여 JSX 문자열로 변환하는 함수
 */
function processTextValue(value) {
  const parts = value.split(/(\${[^}]+})/);
  return parts
    .map((part) => {
      if (part.startsWith("${") && part.endsWith("}")) {
        let expr = extractDynamicExpression(part);
        expr = processDynamicExpression(expr);
        return `{${expr}}`;
      }
      return part;
    })
    .join("");
}

/**
 * HTML 속성값을 처리하는 함수
 * - 단일 동적 표현식이면 이를 처리하여 반환
 * - 혼합된 경우에는 각 동적 표현식을 처리한 후 템플릿 리터럴로 결합하여 반환
 * - 정적 값은 큰따옴표로 감싸 반환
 */
function processAttributeValue(value) {
  const parts = value.split(/(\${[^}]+})/);
  const meaningfulParts = parts.filter((p) => p !== "");
  const hasStatic = meaningfulParts.some(
    (part) => !(part.startsWith("${") && part.endsWith("}"))
  );
  if (!hasStatic && meaningfulParts.length === 1) {
    let expr = extractDynamicExpression(meaningfulParts[0]);
    expr = processDynamicExpression(expr);
    return `{${expr}}`;
  } else {
    const processed = meaningfulParts
      .map((part) => {
        if (part.startsWith("${") && part.endsWith("}")) {
          let expr = extractDynamicExpression(part);
          expr = processDynamicExpression(expr);
          return `\${${expr}}`;
        }
        return part;
      })
      .join("");
    return `{ \`${processed}\` }`;
  }
}

/**
 * HTL 전용 속성(data-sly-*) 여부를 판단하는 함수
 */
function isHTLAttribute(attr) {
  return attr.startsWith("data-sly-");
}

/**
 * 범용 HTL 파일을 React 컴포넌트 코드로 변환하는 converter 함수
 * - 입력: HTL 코드 문자열
 * - 출력: JSX 문법에 맞춘 React 컴포넌트 코드 문자열
 */
function convertHTLToReact(htlInput) {
  const document = parseDocument(htlInput, { lowerCaseAttributeNames: false });
  const vars = {};

  function parseNode(node) {
    if (!node) return "";
    if (node.type === "text") {
      return processTextValue(node.data);
    }

    if (node.type === "script") {
      // 만약 <script> 태그이면,
      // 해당 노드를 제거하지 않고 주석 처리하여 원본을 보존합니다.
      return `{/* 스크립트는 개발자가 직접 확인하고 반영해주세요.\n${originalNodeString(
        node
      )}\n*/}`;
    }

    if (node.type === "tag") {
      const elem = node;

      // data-sly-call + isEmpty 처리: 주석으로 남기고 설명 추가
      if (
        elem.attribs &&
        Object.keys(elem.attribs).some((key) => key.startsWith("data-sly-call"))
      ) {
        const callKey = Object.keys(elem.attribs).find((key) =>
          key.startsWith("data-sly-call")
        );
        const callVal = elem.attribs[callKey];
        let explanation = "";
        if (callVal.includes("isEmpty=")) {
          const conditionPart = callVal.split("isEmpty=")[1].trim();
          explanation = `config 에서 placeholder 노출 조건은 {${conditionPart}} 입니다.`;
        }
        return `{/* ${explanation}\n${originalNodeString(elem)}\n*/}`;
      }

      // data-sly-resource 처리: 주석으로 남기고, 개발자가 컴포넌트를 확인 후 주입하도록 안내
      if (
        elem.attribs &&
        Object.keys(elem.attribs).some((key) =>
          key.startsWith("data-sly-resource")
        )
      ) {
        return `{/*\n개발자가 컴포넌트를 확인하고 주입해주세요.\nOriginal: ${originalNodeString(
          elem
        )}\n*/}`;
      }

      const tagName = elem.name === "sly" ? null : elem.name;
      let attributes = [];
      let condition = null;
      let repeat = null;

      if (elem.attribs) {
        for (const [attr, val] of Object.entries(elem.attribs)) {
          // data-sly-attribute.<name>는 실제 태그 속성으로 포함
          if (attr.startsWith("data-sly-attribute.")) {
            const realAttrName = attr.split(".")[1];
            const processedVal = processAttributeValue(val);
            attributes.push(`${realAttrName}=${processedVal}`);
            continue;
          }
          if (isHTLAttribute(attr)) {
            if (attr.startsWith("data-sly-set.")) {
              const varName = attr.split(".")[1];
              let expr = val;
              if (expr.startsWith("${") && expr.endsWith("}")) {
                expr = extractDynamicExpression(expr);
                expr = processDynamicExpression(expr);
              } else if (expr.includes("${")) {
                expr = "`" + expr + "`";
              } else {
                expr = `"${expr}"`;
              }
              vars[varName] = expr;
            } else if (attr.startsWith("data-sly-test.")) {
              // 신규 기능: data-sly-test.[변수명] 형식이면 data-sly-set과 같이 변수 선언 처리
              const varName = attr.split(".")[1];
              let expr = val;
              if (expr.startsWith("${") && expr.endsWith("}")) {
                expr = extractDynamicExpression(expr);
                // 기존 data-sly-test의 경우 단순 비교 조건으로 사용되므로
                // '==' 연산자를 '==='로 변환하여 엄격한 비교를 수행하도록 합니다.
                expr = expr.replace(/==/g, "===");
                expr = processDynamicExpression(expr);
              } else if (expr.includes("${")) {
                expr = "`" + expr + "`";
              } else {
                expr = `"${expr}"`;
              }
              vars[varName] = expr;
            } else if (attr.startsWith("data-sly-test")) {
              // 기존 data-sly-test 처리: 태그 자체의 조건부 렌더링에 사용됨.
              condition = val;
              if (condition.startsWith("${") && condition.endsWith("}")) {
                condition = extractDynamicExpression(condition);
              }
            } else if (attr.startsWith("data-sly-list")) {
              const parts = attr.split(".");
              const identifier = parts.length > 1 ? parts[1] : "item";
              let expr = val;
              if (expr.startsWith("${") && expr.endsWith("}")) {
                expr = extractDynamicExpression(expr);
              }
              repeat = { expr, identifier };
            }
            // data-sly-use, data-sly-include 등은 제외
            continue;
          } else {
            const jsxAttrName = transformAttrName(attr);
            const processedVal = processAttributeValue(val);
            attributes.push(`${jsxAttrName}=${processedVal}`);
          }
        }
      }
      const attrString =
        attributes.length > 0 ? " " + attributes.join(" ") : "";
      let childrenJSX = "";
      if (elem.childNodes && elem.childNodes.length > 0) {
        childrenJSX = elem.childNodes.map((n) => parseNode(n)).join("");
      }
      let elementJSX = "";
      if (tagName) {
        const selfClosingTags = [
          "img",
          "source",
          "br",
          "hr",
          "input",
          "meta",
          "link",
        ];
        if (childrenJSX.trim() === "" && selfClosingTags.includes(tagName)) {
          elementJSX = `<${tagName}${attrString} />`;
        } else {
          elementJSX = `<${tagName}${attrString}>${childrenJSX}</${tagName}>`;
        }
      } else {
        elementJSX = childrenJSX;
      }
      if (condition) {
        elementJSX = `{(${condition}) && (<>${elementJSX}</>)}`;
      }
      if (repeat) {
        elementJSX = `{(${repeat.expr}).map((${repeat.identifier}, index) => (<Fragment key={index}>${elementJSX}</Fragment>))}`;
      }
      return elementJSX;
    }
    return "";
  }

  const jsxBody = document.children.map((n) => parseNode(n)).join("\n");
  const codeLines = [];
  codeLines.push(`import React, { Fragment } from "react";`);
  codeLines.push("");
  codeLines.push(
    "const t = (str: string) => str; // i18n dummy function 사용하지 않으면 지워주세요"
  );
  codeLines.push("");
  codeLines.push("// 개발자가 직접 타입을 정의해주세요");
  codeLines.push("export default function Component(props: any) {");
  codeLines.push("  const { /* add your props here */ } = props;");
  codeLines.push("");
  for (const [varName, expr] of Object.entries(vars)) {
    codeLines.push(`  const ${varName} = ${expr};`);
  }
  codeLines.push("");
  codeLines.push("  return (");
  codeLines.push("    <>");
  const indentedJSX = jsxBody
    .split("\n")
    .map((line) => "      " + line)
    .join("\n");
  codeLines.push(indentedJSX);
  codeLines.push("    </>");
  codeLines.push("  );");
  codeLines.push("}");
  return codeLines.join("\n");
}

module.exports = { convertHTLToReact };
