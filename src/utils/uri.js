// client 에서 재정의 해야함
export function manipulateUri(uri, options) {
  // 1. URL 객체 생성: 절대 URI가 아니면 임시 dummy base를 사용
  let dummy = false;
  let url;
  try {
    url = new URL(uri);
  } catch (e) {
    url = new URL(uri, "http://dummy");
    dummy = true;
  }

  // 2. scheme 처리: scheme 옵션이 있으면, 값이 있으면 교체, 빈 문자열이면 그대로 둠
  if ("scheme" in options) {
    const scheme = options.scheme;
    if (scheme) {
      url.protocol = scheme + ":";
    }
  }

  // 3. domain 처리: domain 옵션이 있으면 host 교체
  if ("domain" in options) {
    const domain = options.domain;
    if (domain) {
      url.host = domain;
    }
  }

  // 4. path 옵션: path 옵션이 있으면 pathname을 완전히 교체
  if ("path" in options) {
    let newPath = options.path;
    if (!newPath.startsWith("/")) {
      newPath = "/" + newPath;
    }
    url.pathname = newPath;
  }

  // 5. prependPath: 기존 pathname 앞에 추가 (예: prependPath='foo' → '/foo' + 기존 path)
  if ("prependPath" in options) {
    let prepend = options.prependPath;
    prepend = prepend.replace(/\/+$/, ""); // 끝의 슬래시 제거
    // ensure there's exactly one slash between
    url.pathname = "/" + prepend + url.pathname;
  }

  // 6. appendPath: 기존 pathname 뒤에 추가
  if ("appendPath" in options) {
    let append = options.appendPath;
    append = append.replace(/^\/+/, ""); // 앞의 슬래시 제거
    if (!url.pathname.endsWith("/")) {
      url.pathname += "/";
    }
    url.pathname += append;
  }

  // 7. selectors, extension, suffix 처리
  //    마지막 path segment를 분해: 형식은 baseName[.selector*][.extension]
  let segments = url.pathname.split("/");
  let lastSegment = segments.pop() || "";
  // 만약 lastSegment이 빈 문자열이면(즉, trailing slash) 이전 segment 사용
  if (!lastSegment && segments.length > 0) {
    lastSegment = segments.pop();
  }
  // 분해: 점(.)으로 구분
  const parts = lastSegment.split(".");
  let baseName = parts[0];
  let selectors = [];
  let extension = "";
  if (parts.length > 1) {
    extension = parts[parts.length - 1];
    if (parts.length > 2) {
      selectors = parts.slice(1, parts.length - 1);
    }
  }

  // selectors 옵션: 지정되면 기존 선택자 전체를 대체
  if ("selectors" in options) {
    const sel = options.selectors;
    if (Array.isArray(sel)) {
      selectors = sel;
    } else if (typeof sel === "string") {
      selectors = sel === "" ? [] : sel.split(".").filter((s) => s);
    } else {
      // 문자열이 아닌 경우 강제 문자열 변환 후 처리
      selectors = String(sel)
        .split(".")
        .filter((s) => s);
    }
  }

  // addSelectors 옵션: 추가
  if ("addSelectors" in options) {
    const addSel = Array.isArray(options.addSelectors)
      ? options.addSelectors
      : options.addSelectors.split(".").filter((s) => s);
    selectors = selectors.concat(addSel);
  }
  // removeSelectors 옵션: 삭제
  if ("removeSelectors" in options) {
    const remSel = Array.isArray(options.removeSelectors)
      ? options.removeSelectors
      : options.removeSelectors.split(".").filter((s) => s);
    selectors = selectors.filter((s) => !remSel.includes(s));
  }

  // extension 옵션: 수정(빈 문자열이면 제거)
  if ("extension" in options) {
    extension = options.extension;
  }

  // suffix 옵션 처리
  // suffix는 리소스 경로의 끝에 붙는 추가 경로 (예: /my/suffix)
  let suffix = "";
  if ("suffix" in options) {
    suffix = options.suffix;
  }
  if ("prependSuffix" in options) {
    suffix = options.prependSuffix + (suffix ? "/" + suffix : "");
  }
  if ("appendSuffix" in options) {
    suffix = suffix + (suffix ? "/" : "") + options.appendSuffix;
  }

  // 재조합: baseName + (선택자 있으면 .join) + (확장자 있으면 .extension)
  let newLastSegment = baseName;
  if (selectors.length > 0) {
    newLastSegment += "." + selectors.join(".");
  }
  if (extension) {
    newLastSegment += "." + extension;
  }
  // suffix 붙이기: 있으면, '/' + suffix를 붙임
  if (suffix) {
    newLastSegment += "/" + suffix;
  }
  // 다시 조합
  segments.push(newLastSegment);
  url.pathname = segments.join("/");

  // 8. Query 옵션 처리
  const params = new URLSearchParams(url.search);
  // 8. Query 옵션 처리
  if ("query" in options) {
    // qStr가 문자열이 아닐 경우 강제 문자열 변환
    let qStr = options.query;
    if (typeof qStr !== "string") {
      qStr = String(qStr);
    }
    const newParams = new URLSearchParams();
    qStr.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key) {
        newParams.set(key, value || "");
      }
    });
    url.search = newParams.toString() ? "?" + newParams.toString() : "";
  }

  if ("addQuery" in options) {
    const addStr = options.addQuery;
    addStr.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key) {
        params.append(key, value || "");
      }
    });
    url.search = params.toString() ? "?" + params.toString() : "";
  }
  if ("removeQuery" in options) {
    let rem = options.removeQuery;
    if (!Array.isArray(rem)) {
      rem = rem.split(",").map((s) => s.trim());
    }
    rem.forEach((key) => params.delete(key));
    url.search = params.toString() ? "?" + params.toString() : "";
  }

  // 9. Fragment 옵션 처리
  if ("fragment" in options) {
    const frag = options.fragment;
    url.hash = frag ? "#" + frag : "";
  }

  // 10. 최종 결과: dummy base 제거
  let finalUri = url.toString();
  if (dummy) {
    finalUri = finalUri.replace(/^http:\/\/dummy/, "");
  }
  return finalUri;
}
