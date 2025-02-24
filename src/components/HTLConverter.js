const { parseDocument } = require("htmlparser2");
const { processFormatOption } = require("../utils/format");

/**
 * 주어진 문자열에서 동적 표현식(${...})을 추출하는 함수 (밸런스 고려)
 * 반환값: { expression: 추출된 표현식 (중괄호 포함), rest: 나머지 문자열 }
 * 동적 표현식이 없으면 null 반환
 */
function extractDynamicExpressionBalanced(str) {
  const start = str.indexOf("${");
  if (start === -1) return null;
  let index = start + 2;
  let braceCount = 1;
  while (index < str.length && braceCount > 0) {
    if (str[index] === "{") {
      braceCount++;
    } else if (str[index] === "}") {
      braceCount--;
    }
    index++;
  }
  if (braceCount !== 0) {
    throw new Error("Unbalanced braces in dynamic expression");
  }
  const expression = str.substring(start, index); // includes ${ ... }
  const rest = str.substring(index);
  return { expression, rest };
}

/**
 * 기존 extractDynamicExpression 대신, 동적 표현식의 내부 내용을 균형 있게 추출하는 함수
 */
function extractDynamicExpressionContent(str) {
  // 가정: str은 "${...}" 형태임
  if (!str.startsWith("${") || !str.endsWith("}")) {
    throw new Error("Invalid dynamic expression format");
  }
  // ${ 와 } 제거
  return str.substring(2, str.length - 1).trim();
}

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
  // format 옵션이 포함된 경우 처리
  if (expr.includes("@ format=")) {
    return processFormatOption(expr);
  }

  // (필요에 따라 join 옵션, equality operator 처리 등 다른 전처리 코드 포함)
  expr = expr.replace(
    /(\[[^\]]+\])\s*@\s*join\s*=\s*(['"])(.*?)\2/g,
    (match, arrLiteral, quote, joinStr) => {
      return `${arrLiteral}.join(${quote}${joinStr}${quote})`;
    }
  );

  const optionIndex = expr.indexOf("@");
  if (optionIndex !== -1) {
    let baseExpr = expr.substring(0, optionIndex).trim();
    const optionsStr = expr.substring(optionIndex + 1).trim();
    const uriOptionKeys = [
      "scheme",
      "domain",
      "path",
      "prependPath",
      "appendPath",
      "selectors",
      "addSelectors",
      "removeSelectors",
      "extension",
      "suffix",
      "prependSuffix",
      "appendSuffix",
      "query",
      "addQuery",
      "removeQuery",
      "fragment",
    ];
    const optionParts = optionsStr.split(",").map((part) => part.trim());
    const optionsObj = {};
    optionParts.forEach((part) => {
      const eqIndex = part.indexOf("=");
      if (eqIndex !== -1) {
        let key = part.substring(0, eqIndex).trim();
        let value = part.substring(eqIndex + 1).trim();
        value = value.replace(/^['"]|['"]$/g, "");
        optionsObj[key] = value;
      } else {
        optionsObj[part] = true;
      }
    });
    const hasUriOption = Object.keys(optionsObj).some((key) =>
      uriOptionKeys.includes(key)
    );
    if (hasUriOption) {
      const literalMatch = baseExpr.match(/^(['"])(.*)\1$/);
      if (!literalMatch) {
        throw new Error(
          `HTL 변환 오류: URI Manipulation의 기본 표현식은 반드시 문자열 리터럴이어야 합니다. (expr: ${baseExpr})`
        );
      }
      const literalValue = literalMatch[2];
      // const manipulatedUri = manipulateUri(literalValue, optionsObj);
      // 최종 결과를 문자열 리터럴로 반환 이건 client 에서 구현되어 있어야 함
      return `manipulateUri(literalValue, optionsObj)`;
    }
  }

  // 4. context, html, i18n 옵션 처리 (필요 시 기존 로직 적용)
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
  // const parts = value.split(/(\${[^}]+})/);
  // return parts
  //   .map((part) => {
  //     if (part.startsWith("${") && part.endsWith("}")) {
  //       let expr = extractDynamicExpression(part);
  //       expr = processDynamicExpression(expr);
  //       return `{${expr}}`;
  //     }
  //     return part;
  //   })
  //   .join("");
  let result = "";
  let remaining = value;
  while (true) {
    const extracted = extractDynamicExpressionBalanced(remaining);
    if (!extracted) {
      result += remaining;
      break;
    }
    // 앞부분 정적 텍스트
    result += remaining.substring(0, remaining.indexOf("${"));
    // 동적 표현식
    const dynExpr = extracted.expression; // e.g. "${ 'Asset {0} out of {1}' @ format=... }"
    const content = extractDynamicExpressionContent(dynExpr);
    const processed = processDynamicExpression(content);
    result += `{${processed}}`;
    remaining = extracted.rest;
  }
  return result;
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
            } else if (attr.startsWith("data-sly-repeat")) {
              // data-sly-repeat: 요소 자체를 반복합니다.
              const parts = attr.split(".");
              const identifier = parts.length > 1 ? parts[1] : "item";
              let expr = val;
              if (expr.startsWith("${") && expr.endsWith("}")) {
                expr = extractDynamicExpression(expr);
              }
              // 반복할 전체 엘리먼트를 대상으로, isRepeat 플래그 true 설정
              repeat = { expr, identifier, isRepeat: true };
              continue;
            }
            if (attr.startsWith("data-sly-list")) {
              // data-sly-list: 요소의 자식 콘텐츠만 반복합니다.
              const parts = attr.split(".");
              const identifier = parts.length > 1 ? parts[1] : "item";
              let expr = val;
              if (expr.startsWith("${") && expr.endsWith("}")) {
                expr = extractDynamicExpression(expr);
              }
              // 이 경우는 repeat 객체에 isRepeat 플래그 false로 설정하거나 별도 변수로 관리
              repeat = { expr, identifier, isRepeat: false };
              continue;
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
        if (repeat.isRepeat) {
          console.log("repeat", elementJSX);
          // data-sly-repeat: 요소 자체를 반복
          // elementJSX = `{(${repeat.expr}).map((${
          //   repeat.identifier
          // }, index) => (<React.Fragment key={index}>${
          //   /* 기존 elementJSX 내부 내용 */ elementJSX
          // }</React.Fragment>))}`;
          elementJSX = elementJSX.replace(/^<(\w+)/, "<$1 key={index}");
          // 2. 반복 처리: map을 사용하여 각 반복마다 elementJSX를 그대로 반환
          elementJSX = `{(${repeat.expr}).map((${repeat.identifier}, index) => (${elementJSX}))}`;
        } else {
          // data-sly-list: 요소의 자식만 반복, 현재 요소는 그대로 유지하고 자식 부분만 반복 처리하도록 구현해야 함.
          // 예시: elementJSX 내부의 children 부분에 대해 map 처리
          // (구현 방법은 컴포넌트 구조에 따라 다를 수 있습니다)
          elementJSX = `<${tagName}${attrString}>${
            childrenJSX &&
            `{(${repeat.expr}).map((${repeat.identifier}, index) => (<React.Fragment>${childrenJSX}</React.Fragment>))}`
          }</${tagName}>`;
        }
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
