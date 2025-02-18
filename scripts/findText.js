const fs = require("fs");
const path = require("path");

/**
 * 폴더 내의 `.htl` 파일을 재귀적으로 검색하여 특정 문자열을 포함하는 줄을 찾고 저장하는 함수
 * @param {string} folderPath - 검색할 최상위 폴더 경로
 * @param {string} searchText - 검색할 문자열
 * @param {string} outputFilePath - 결과를 저장할 파일 경로
 */
function searchInHTLFilesRecursive(folderPath, searchText, outputFilePath) {
  let result = "";

  /**
   * 특정 폴더를 탐색하여 `.htl` 파일을 찾고, 내용을 검사하는 재귀 함수
   * @param {string} currentPath - 현재 탐색 중인 폴더 경로
   */
  function scanDirectory(currentPath) {
    const files = fs.readdirSync(currentPath);

    files.forEach((file) => {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // 📂 하위 폴더라면 재귀적으로 탐색
        scanDirectory(filePath);
      } else if (stat.isFile() && file.endsWith(".htl")) {
        // 📄 `.htl` 파일이라면 검색 수행
        const lines = fs.readFileSync(filePath, "utf-8").split("\n");
        const matchedLines = lines.filter((line) => line.includes(searchText));

        if (matchedLines.length > 0) {
          result += `\n📂 ${path.relative(folderPath, filePath)}\n`;
          matchedLines.forEach((line) => {
            result += `- ${line.trim()}\n`;
          });
        }
      }
    });
  }

  // 🔍 탐색 시작
  scanDirectory(folderPath);

  // 결과 저장
  if (result) {
    fs.writeFileSync(outputFilePath, result, "utf-8");
    console.log(`✅ 검색된 결과가 저장되었습니다: ${outputFilePath}`);
  } else {
    console.log("🔍 검색된 내용이 없습니다.");
  }
}

// CLI 실행을 위한 코드
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log("⚠️ 사용법: node search_htl_nested.js <폴더 경로> <검색어>");
  process.exit(1);
}

const [folderPath, searchText] = args;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFilePath = path.join(__dirname, `output-${timestamp}.txt`);

// 🏁 실행
searchInHTLFilesRecursive(folderPath, searchText, outputFilePath);
