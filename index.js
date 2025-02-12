// import { parseHtlHtmlFile } from "./src/parseHTML.js";

// const ast = parseHtlHtmlFile("input.html");
// console.log(JSON.stringify(ast, null, 2));

import { parseHtlExpression } from "./src/htlExpressionParser.js";

const expr = "myVar && myVar < 10 ? 'yes' : 'no'";
const ast = parseHtlExpression(expr);

console.log("Expression:", expr);
console.log("AST:", JSON.stringify(ast, null, 2));

// import { generateAST } from "./src/generateAST.js";
// import { generateRSX } from "./src/generateRSX.js";
// import fs from "fs";

// const inputFile = "./input.html";
// const outputFile = "./ConvertedComponent.jsx";

// // 1) AST 생성
// const ast = generateAST(inputFile);

// // 2) React JSX 생성
// const rsx = generateRSX(ast, { componentName: "HeroImageConverted" });

// // 3) 결과를 파일로 저장
// fs.writeFileSync(outputFile, rsx, "utf-8");

// console.log("React component created at", outputFile);
