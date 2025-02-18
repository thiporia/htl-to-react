const fs = require("fs");
const path = require("path");

/**
 * 특정 폴더 내의 .htl 파일을 검색하여 특정 문자열이 포함된 줄을 추출하는 함수
 * @param {string} folderPath - 검색할 폴더 경로
 * @param {string} searchText - 검색할 텍스트
 */
function searchInHTLFiles(folderPath, searchText) {
  if (!fs.existsSync(folderPath)) {
    console.error("❌ 폴더가 존재하지 않습니다:", folderPath);
    process.exit(1);
  }

  const outputFilePath = path.join(__dirname, "output.txt");
  let result = "";

  // 폴더 내 파일을 읽음
  const files = fs.readdirSync(folderPath);

  files.forEach((file) => {
    const filePath = path.join(folderPath, file);

    // .htl 파일만 처리
    if (fs.statSync(filePath).isFile() && file.endsWith(".htl")) {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");

      // 특정 문자열이 포함된 줄 필터링
      const matchedLines = lines.filter((line) => line.includes(searchText));

      if (matchedLines.length > 0) {
        result += `\n📄 ${file}\n`;
        matchedLines.forEach((line) => {
          result += `- ${line.trim()}\n`;
        });
      }
    }
  });

  if (result) {
    fs.writeFileSync(outputFilePath, result, "utf-8");
    console.log(`✅ 결과가 저장되었습니다: ${outputFilePath}`);
  } else {
    console.log("🔍 검색된 내용이 없습니다.");
  }
}

// CLI 실행을 위한 코드
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log("⚠️ 사용법: node search_htl.js <폴더 경로> <검색어>");
  process.exit(1);
}

const [folderPath, searchText] = args;
searchInHTLFiles(folderPath, searchText);
