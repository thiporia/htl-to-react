// HtlExpressionVisitor.js
export default class HtlExpressionVisitor {
  /**
   * parse tree의 각 노드를 방문하여 JavaScript 표현식 문자열로 변환
   * @param {ParserNode} node - SightlyParser에서 생성된 구문 트리 노드
   * @returns {string} - 변환된 JavaScript 표현식
   */
  visit(node) {
    if (!node) return "";
    switch (node.type) {
      case "expression":
        // expression 노드의 자식(실제 표현식)을 방문
        return this.visit(node.children[0]);
      case "or":
        return `(${this.visit(node.children[0])} || ${this.visit(
          node.children[1]
        )})`;
      case "and":
        return `(${this.visit(node.children[0])} && ${this.visit(
          node.children[1]
        )})`;
      case "equality":
        return `(${this.visit(node.children[0])} ${node.value} ${this.visit(
          node.children[1]
        )})`;
      case "relational":
        return `(${this.visit(node.children[0])} ${node.value} ${this.visit(
          node.children[1]
        )})`;
      case "additive":
        return `(${this.visit(node.children[0])} ${node.value} ${this.visit(
          node.children[1]
        )})`;
      case "multiplicative":
        return `(${this.visit(node.children[0])} ${node.value} ${this.visit(
          node.children[1]
        )})`;
      case "not":
        return `(!${this.visit(node.children[0])})`;
      case "int":
      case "float":
      case "string":
      case "bool":
        return node.value;
      case "identifier":
        return node.value;
      case "property":
        // 프로퍼티 접근: base.property
        return `${this.visit(node.children[0])}.${node.value}`;
      case "array":
        // 배열 리터럴: 각 요소를 방문하여 쉼표로 구분하여 출력
        return `[${node.children
          .map((child) => this.visit(child))
          .join(", ")}]`;
      default:
        // 기타 노드: 자식 노드를 모두 방문하여 연결
        return node.children.map((child) => this.visit(child)).join(" ");
    }
  }
}
