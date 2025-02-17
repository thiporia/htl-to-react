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
4. **Copy** 버튼을 통해 복사 후 {component}.tsx 파일에 저장
5. **const { /_ add your props here _/ } = props;** 에 props 를 채워넣음
6. 일부 타입스크립트 에러 제거 후 활용

**format**과 **manipulateUri** 등은 client 에서 상황에 맞게 직접 구현해야함

## 개선방안

#### 속성 추가가 필요하면?(HTLConverter.js)

- transformAttrName 에 조건 추가

#### Optional 정의가 추가로 필요하면?

- processDynamicExpression 에 조건 추가

#### Node 자체에 무언가 설정을 변경해야하면?

- parseNode 에 조건 추가

## issue

질문이나 피드백이 있으시면 [GitHub 저장소](https://github.com/thiporia/htl-to-react)에 이슈를 열어주세요.
