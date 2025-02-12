// HtlExpressionVisitor.js
export default class HtlExpressionVisitor {
  /**
   * parse tree의 각 노드를 방문하여 JavaScript 표현식 문자열로 변환합니다.
   * (여기서는 단순하게 노드의 value와 자식들을 연결하는 기본 구현입니다.)
   */
  visit(node) {
    if (!node) return "";
    if (!node.children || node.children.length === 0) {
      return node.value || "";
    }
    return node.children.map((child) => this.visit(child)).join("");
  }
}
