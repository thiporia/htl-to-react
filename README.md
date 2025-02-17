# htl-to-react

## 개요

`htl-to-react`는 HTL (HTML Template Language) 파일을 React 컴포넌트로 변환하는 도구입니다.
이를 통해 기존 HTL 템플릿을 React 기반 프로젝트에 더 쉽게 통합할 수 있습니다.
**현재 일부 태그에 대해서만 동작합니다.**

## 기능

- HTL 파일을 React 컴포넌트로 변환
- 사용자 정의 태그 및 속성 지원

## 현재 지원

#### 속성 변환

- class -> className / for -> htmlFor / srcset -> srcSet

#### sly 문법

- data-sly-attribute
- data-sly-test
- data-sly-list
- data-sly-call(임시)
- data-sly-resource(임시)

#### 기타

- script 는 주석처리
- placeholder 조건 설명

## 사용법

1. https://thiporia.github.io/htl-to-react/ 경로 진입
2. Input 에 변경을 원하는 HTL 태그 입력
3. 변환 결과 확인
4. **Copy** 버튼을 통해 복사 후 사용

## issue

질문이나 피드백이 있으시면 [GitHub 저장소](https://github.com/thiporia/htl-to-react)에 이슈를 열어주세요.
