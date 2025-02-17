// import { formatString, formatDate, formatNumber } from "./formatUtils";
/**
 * 포맷 패턴에 따라 기본 타입(string, date, number)을 결정하는 함수.
 * - {0}와 같이 플레이스홀더가 있으면 문자열 포맷팅
 * - 날짜 관련 문자(y, M, d, E, a, H, m, s, S, z, Z, X)가 있으면 date
 * - 숫자 전용 기호(#, 0, ., -, ,, E, ;, %)가 있으면 number
 * - 그 외는 기본적으로 문자열로 처리
 */
function detectFormatType(basePattern) {
  console.log("basepattenr", basePattern);
  if (/\{[0-9]+\}/.test(basePattern)) {
    return "string";
  }
  if (/[yMdEahHmmsSzZX]/.test(basePattern)) {
    return "date";
  }
  if (/[#0\.\-,E;%]/.test(basePattern)) {
    return "number";
  }
  return "string";
}

/**
 * HTL Format 옵션을 파싱하여 formatString, formatDate, formatNumber 호출 코드를 생성하는 함수.
 * 지원:
 *  - base: 포맷 패턴 (예: 'Asset {0}' 또는 '#.00' 또는 'yyyy-MM-dd')가 반드시 문자열 리터럴로 주어진다.
 *  - format 값: 단일 값 또는 배열 표기 (예: properties.assetName 또는 [properties.current, properties.total])
 *  - 추가 옵션: 쉼표로 구분된 key=value 쌍 (예: , type='date', timezone='GMT+00:30', locale='de', i18n)
 */
export function processFormatOption(expr) {
  // 먼저, base 부분(포맷 패턴)은 따옴표로 감싸진 전체 문자열을 캡처합니다.
  // 예: 'Asset {0} out of {1}'를 전체로 캡처하도록 함.
  const regex =
    /^(['"])([\s\S]*?)\1\s*@\s*format\s*=\s*(\[[^\]]+\]|[^,]+)(.*)$/;
  const match = expr.match(regex);
  if (!match) {
    return expr;
  }

  // match[1]: 인용 부호, match[2]: 내부 문자열, match[3]: format 값, match[4]: 나머지 옵션
  let baseLiteral = match[1] + match[2] + match[1]; // 전체 문자열 리터럴 보존
  let base = baseLiteral; // base는 그대로 유지
  let formatVal = match[3].trim();
  let remaining = match[4].trim();

  const options = {};
  const optRegex = /,\s*([a-zA-Z]+)\s*=\s*(['"]?)(.*?)\2(?=$|,)/g;
  let opt;
  while ((opt = optRegex.exec(remaining)) !== null) {
    options[opt[1]] = opt[3];
  }

  // type 옵션이 없으면 detectFormatType을 통해 결정 (내부 문자열인 match[2] 사용)
  if (!options.type) {
    options.type = detectFormatType(match[2]);
  } else {
    options.type = options.type.toLowerCase();
  }

  if (options.type === "date") {
    return `formatDate(${base}, ${formatVal}, ${JSON.stringify(options)})`;
  } else if (options.type === "number") {
    return `formatNumber(${base}, ${formatVal}, ${JSON.stringify(options)})`;
  } else {
    return `formatString(${base}, ${formatVal}, ${JSON.stringify(options)})`;
  }
}
