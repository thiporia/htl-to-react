#!/usr/bin/env node
import fs from "fs";
import { convertHTLTemplateToReact } from "./src/HtlTemplateConverter.js";

// 전달해주신 HTL 템플릿이 담긴 input.html 파일을 읽어옵니다.
const inputFilePath = "input.html"; // 해당 파일에 전달해주신 HTL 템플릿을 저장했다고 가정합니다.
let htlTemplate = "";

try {
  htlTemplate = fs.readFileSync(inputFilePath, "utf8");
} catch (err) {
  console.error(
    `입력 파일(${inputFilePath})을 읽는 중 오류 발생: ${err.message}`
  );
  process.exit(1);
}

console.log("----- 입력 HTL 템플릿 -----");
console.log(htlTemplate);
console.log("-----------------------------\n");

// 변환 함수를 호출하여 React 컴포넌트 코드로 변환합니다.
let reactComponentCode = "";
try {
  reactComponentCode = convertHTLTemplateToReact(htlTemplate);
} catch (err) {
  console.error("err stack trace", err);
  console.error(`HTL 템플릿 변환 중 오류 발생: ${err.message}`);
  process.exit(1);
}

console.log("----- 변환된 React 컴포넌트 코드 -----");
console.log(reactComponentCode);
console.log("---------------------------------------\n");

// 결과를 GeneratedComponent.jsx 파일로 저장합니다.
try {
  fs.writeFileSync("GeneratedComponent.jsx", reactComponentCode, "utf8");
  console.log(
    "변환된 React 컴포넌트 코드가 'GeneratedComponent.jsx' 파일로 저장되었습니다."
  );
} catch (err) {
  console.error(`출력 파일 저장 중 오류 발생: ${err.message}`);
  process.exit(1);
}
