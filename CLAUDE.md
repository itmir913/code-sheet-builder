# CLAUDE.md

이 저장소에서 작업할 때 반드시 지키는 규칙이다.

## 명령

```bash
npm run dev      # 개발 서버
npm run build    # dist/ 생성
npm run ci       # eslint → vitest → vite build
```

- `package.json` 의 스크립트는 이 셋뿐이다. `lint`, `test`, `preview` 같은 스크립트를 더하지 않는다. 린트만 돌릴 때는 `npx eslint .` 처럼 직접 부른다.
- 검사 명령은 세 곳에서 같아야 한다 - 로컬의 `npm run ci`, `.idea/runConfigurations/ci.xml`, 두 워크플로의 검사 스텝. 한 곳만 바꾸지 않는다.
- 워크플로의 검사 스텝은 `npm run ci` 하나만 부른다. `npm run lint` / `npm test` 로 쪼개지 않는다.
- 워크플로의 `npm ci` 스텝은 npm 의 클린 설치 명령이다. 검사 스크립트와 중복으로 보고 지우지 않는다.
- 작업을 끝내기 전에 `npm run ci` 가 통과하는지 확인한다.

## 배포

- `.github/workflows/deploy-pages.yml` 의 트리거는 `workflow_dispatch:` 하나다. `on: push` 를 더하지 않는다.
- `release` 잡은 `deploy` 잡을 기다린다. 이 순서를 풀지 않는다.
- `workflow_dispatch` 전용 워크플로가 Actions 탭에 등록되지 않으면, 그 워크플로 파일 자체를 고친 커밋을 push 한다. YAML 을 고치려 들지 않는다.

## 오프라인 zip (file://)

- 실행 시점에 네트워크를 부르지 않는다. CDN 링크, Google Fonts `<link>`, 원격 이미지를 넣지 않는다. 폰트와 라이브러리는 npm 으로 받아 번들에 넣는다.
- 빌드 결과에 `<script type="module">` 과 `crossorigin` 이 남지 않게 한다 (`vite.config.js` 의 `fileProtocolSafeHtml`).
- 번들은 iife 한 덩어리다. 코드 분할을 켜지 않는다.
- 경로는 상대 경로다 (`base: './'`).
- 빌드 설정을 바꾸기 전에 `vite.config.js` 주석을 읽는다.
- 빌드 설정을 바꾼 뒤에는 `npm run build` 하고 `dist/index.html` 을 `file://` 로 직접 열어 확인한다.
- 네트워크가 필요한 곳은 릴리스를 가리키는 '예제코드'·'오프라인 버전' 두 링크뿐이어야 한다.

## 마스크 오프셋

- 코드가 상태로 들어가는 길목(`UPDATE_BLOCK_CODE`, `LOAD_STATE`)의 `\r\n` → `\n` 정규화를 유지한다.
- `.gitattributes` 의 `eol=lf` 를 풀지 않는다.
- 오프셋을 다루는 코드(`mask.service.js` 의 `render`·`mapHtmlToRaw`, `print.js` 의 줄 단위 분할)를 고치면 경계값 테스트를 함께 고친다. `render` 와 `mapHtmlToRaw` 는 자리표시자 길이 규칙이 같아야 한다.

## 테스트

- 테스트는 `tests/` 에 Vitest 로 둔다.
- 상태 리듀서, 마스크 오프셋 계산, 인쇄용 렌더링을 고치면 테스트를 함께 고친다.
- Monaco 인스턴스 생성과 DOM 이벤트 배선은 브라우저에서 직접 확인한다.

## 코드

- ES 모듈만 쓴다. `window.X = ...` 로 전역에 올리지 않는다.
- 문자열로 HTML 을 만드는 자리의 사용자 입력은 반드시 `esc()` 를 거친다.
- 상태 변경은 전부 `Store.dispatch` 를 지난다. 상태 객체를 바깥에서 직접 고치지 않는다.
- 주석은 "왜"를 적는다. 코드를 보면 아는 것을 다시 쓰지 않는다.
- 4칸 들여쓰기, 한글 주석을 따른다.

## 커밋

- 커밋 메시지와 PR 본문에 AI 관련 문구(`Co-Authored-By: Claude ...`, `Generated with Claude Code`, `🤖`)를 넣지 않는다.
- 메시지는 한국어 한 줄로, 기존 이력의 말투(`~한다`, `~수정`)를 따른다.
- 커밋과 push 는 사용자가 요청할 때만 한다.

## 바이너리

- 바이너리를 저장소에 커밋하지 않는다.
- 예제코드 zip(`CodeSheet_Example_Code.zip`)은 `latest` 릴리스 자산으로만 둔다. 바꿀 때는 `gh release upload latest <파일> --clobber` 로 자산만 갈아 끼운다.
