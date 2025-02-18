// formatUtils.js
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import advancedFormat from "dayjs/plugin/advancedFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// dayjs 플러그인 확장
dayjs.extend(localizedFormat);
dayjs.extend(advancedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 문자열 포맷팅 함수
 * - pattern: 포맷 패턴 (예: 'Asset {0} out of {1}')
 * - value: 단일 값 또는 배열
 */
export function formatString(pattern, value, options) {
  const args = Array.isArray(value) ? value : [value];
  return pattern.replace(/\{(\d+)\}/g, (match, index) => {
    const idx = parseInt(index, 10);
    return args[idx] !== undefined ? args[idx] : "";
  });
}

/**
 * 숫자 포맷팅 함수
 * - pattern: 숫자 포맷 패턴 (예: '#.00', '#,###.00')
 * - numberValue: 숫자
 * - options: 추가 옵션, locale가 있으면 Intl.NumberFormat 사용
 */
export function formatNumber(pattern, numberValue, options) {
  let decimals = 0;
  const decimalMatch = pattern.match(/\.(0+)/);
  if (decimalMatch) {
    decimals = decimalMatch[1].length;
  }
  if (options.locale) {
    return new Intl.NumberFormat(options.locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numberValue);
  }
  return numberValue.toFixed(decimals);
}

/**
 * 날짜 포맷팅 함수
 * - pattern: 날짜 포맷 패턴 (예: 'yyyy-MM-dd', 'EEEE, dd MMMM yyyy')
 * - dateValue: Date 객체 또는 날짜 문자열
 * - options: 추가 옵션, timezone 및 locale 지원
 */
export function formatDate(pattern, dateValue, options) {
  let d = dayjs(dateValue);
  if (options.timezone) {
    d = dayjs.tz(dateValue, options.timezone);
  }
  if (options.locale) {
    d = d.locale(options.locale); // 주의: dayjs locale은 미리 import되어야 함
  }
  return d.format(pattern);
}
