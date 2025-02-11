// jest.config.cjs
module.exports = {
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  testEnvironment: "node",
  // 테스트 파일 패턴 설정 (필요 시)
  testMatch: ["**/tests/**/*.test.js"],
};
