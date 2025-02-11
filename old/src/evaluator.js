// 전역 DI 객체 (초기에는 null로 설정)
let globalDI = null;

/**
 * setGlobalDI: 전역 DI 객체를 설정합니다.
 * @param {object} di - { translate, escapeForContext, format, localeForCtx }
 */
export function setGlobalDI(di) {
  globalDI = di;
}

/**
 * evaluateAST: 주어진 AST 노드를 env와 전역 DI 객체를 이용해 평가하여 최종 값을 반환합니다.
 * DI가 전역에 설정되어 있지 않으면 에러를 발생시킵니다.
 * @param {object} node - AST 노드
 * @param {object} env  - 환경 객체 (식별자 매핑)
 * @returns {any}       - 평가 결과
 */
export function evaluateAST(node, env = {}) {
  // 전역 DI 객체가 필요한 경우 미리 체크합니다.
  if (!globalDI) {
    throw new Error(
      "Global DI not set. Please set global DI using setGlobalDI()."
    );
  }

  const { translate, escapeForContext, format, localeForCtx } = globalDI;

  switch (node.type) {
    case "Literal":
      return node.value;

    case "Identifier":
      if (node.name in env) {
        return env[node.name];
      }
      throw new Error(`Identifier "${node.name}" not found in environment`);

    case "UnaryExpression": {
      const arg = evaluateAST(node.argument, env);
      if (node.operator === "!") {
        return !arg;
      }
      throw new Error(`Unsupported unary operator: ${node.operator}`);
    }

    case "BinaryExpression": {
      const left = evaluateAST(node.left, env);
      const right = evaluateAST(node.right, env);
      switch (node.operator) {
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case "<":
          return left < right;
        case "<=":
          return left <= right;
        case ">":
          return left > right;
        case ">=":
          return left >= right;
        case "in":
          if (Array.isArray(right)) {
            return right.includes(left);
          } else if (right !== null && typeof right === "object") {
            return left in right;
          }
          throw new Error(`Right operand of "in" must be an array or object`);
        default:
          throw new Error(`Unsupported binary operator: ${node.operator}`);
      }
    }

    case "LogicalExpression": {
      const left = evaluateAST(node.left, env);
      if (node.operator === "||") {
        return left || evaluateAST(node.right, env);
      } else if (node.operator === "&&") {
        return left && evaluateAST(node.right, env);
      }
      throw new Error(`Unsupported logical operator: ${node.operator}`);
    }

    case "TernaryExpression": {
      const condition = evaluateAST(node.condition, env);
      return condition
        ? evaluateAST(node.trueExpr, env)
        : evaluateAST(node.falseExpr, env);
    }

    case "MemberExpression": {
      const obj = evaluateAST(node.object, env);
      let prop;
      if (node.computed) {
        prop = evaluateAST(node.property, env);
      } else {
        prop = node.property.name;
      }
      return obj[prop];
    }

    // HTLExpression 노드 처리: 내부 expression 평가 후, 옵션에 따라 DI 함수 적용
    case "HTLExpression": {
      let value = evaluateAST(node.expression, env);
      if (node.options) {
        if (node.options.i18n) {
          if (typeof translate !== "function") {
            throw new Error("translate function is required for i18n option");
          }
          value = translate(value, localeForCtx);
        }
        if (node.options.context) {
          if (typeof escapeForContext !== "function") {
            throw new Error(
              "escapeForContext function is required for context option"
            );
          }
          value = escapeForContext(value, node.options.context);
        }
        if (node.options.format) {
          if (typeof format !== "function") {
            throw new Error("format function is required for format option");
          }
          value = format(value, node.options.format);
        }
        // join 등의 옵션도 추가 가능
      }
      return value;
    }

    case "ArrayExpression": {
      return node.elements.map((el) => evaluateAST(el, env));
    }

    default:
      throw new Error(`Unsupported AST node type: ${node.type}`);
  }
}
