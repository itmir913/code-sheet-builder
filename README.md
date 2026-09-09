# CodeSheet Builder

> 코드에 빈칸을 뚫어 인쇄용 코딩 학습지를 만드는 웹 앱입니다. Monaco 에디터로 코드를 쓰고, 가릴 부분을 드래그로 지정하고, A4에 맞춰 학생용과 정답지를 뽑습니다.

작성한 내용은 브라우저 밖으로 나가지 않습니다. 저장은 JSON 파일 내려받기, 불러오기는 그 파일을 다시 읽는 방식이고, 서버로 아무것도 전송하지 않습니다.

이 저장소는 [teacher-utility-kit](https://github.com/itmir913/teacher-utility-kit)의 `code-sheet-builder` 폴더를 커밋 이력째 분리한 것입니다. 2026년 3월 '코드 학습지 메이커 초안' 시절부터의 이력을 담고 있습니다.

---

## 시작하기

```bash
npm ci
npm run dev
```

명령은 셋뿐입니다.

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | `dist/` 에 배포용 정적 파일 생성 |
| `npm run ci` | 린트 → 테스트 → 빌드. CI가 돌리는 것과 같은 명령 |

`npm run ci` 는 `eslint . && vitest run && vite build` 입니다. 로컬에서 이게 통과하면 CI에서도 통과합니다.

## 배포

`master` 에 push해도 배포되지 않습니다. GitHub Actions 탭에서 **Deploy to GitHub Pages** 를 직접 실행할 때에만 사이트가 갱신되고, 같은 실행에서 오프라인 번들 `code-sheet-builder.zip` 이 `latest` 릴리스에 올라갑니다.

push와 PR에는 `CI` 워크플로만 돌아서 검사만 합니다.

## 오프라인 번들

`latest` 릴리스의 zip을 받아 압축을 풀고 `index.html` 을 더블클릭하면 그대로 실행됩니다. 네트워크가 없어도 됩니다.

그래서 **실행 시점에 CDN을 부르는 코드를 넣으면 안 됩니다.** 폰트도 라이브러리도 전부 npm으로 받아 번들에 넣습니다.

`file://` 로 열리는 환경을 위해 빌드 설정에 몇 가지 제약이 걸려 있는데, 이유는 `vite.config.js` 주석에 적어 두었습니다.

예외가 하나 있습니다. 상단 '예제코드' 버튼은 네트워크가 있어야 동작합니다. 예제코드 zip은 바이너리라 저장소에 두지 않고 `latest` 릴리스 자산으로만 배포하기 때문입니다.

## 구조

```
index.html          단일 페이지 앱의 마크업. Vite의 진입 HTML이다.
src/
  main.js           진입점. 폰트·스타일을 불러오고 DOM 이벤트를 연결한다.
  languages.js      지원 언어 레지스트리
  store/state.js    단일 상태 저장소 + 리듀서
  services/         마스크 오프셋 계산과 렌더링
  components/       사이드바, 문제 편집기, 인쇄
  monaco/setup.js   Monaco 로딩과 테마 매핑
  ui/, utils/, data/, styles/
tests/              Vitest 테스트
```

| 파일 | 역할 |
| --- | --- |
| `src/store/state.js` | 상태와 리듀서. 문제·코드블록·마스크의 모든 변경이 여기를 지난다 |
| `src/services/mask.service.js` | 마스크 오프셋 계산, 가리기 모드 HTML 렌더링, Monaco 데코레이션 |
| `src/components/problem-editor.js` | 문제 카드 렌더링, Monaco 인스턴스 관리, 드래그 선택 |
| `src/components/print.js` | 인쇄용 A4 레이아웃 생성 |
| `src/components/sidebar.js` | 문제 목록과 순서 변경(SortableJS) |

## 마스크와 줄바꿈

가려진 영역은 코드 문자열의 **문자 오프셋**(`start`, `end`)으로 저장합니다. `\r\n` 이 섞여 들어오면 오프셋이 줄마다 한 칸씩 밀려 엉뚱한 글자가 가려집니다.

그래서 코드가 상태에 들어가는 길목(`UPDATE_BLOCK_CODE`, `LOAD_STATE`)에서 `\r\n` 을 `\n` 으로 정규화하고, `.gitattributes` 로 저장소의 줄바꿈도 LF로 고정합니다.

## 의존성

외부 라이브러리는 모두 npm으로 관리하며 빌드 시 번들에 포함됩니다.

Monaco Editor, SortableJS, Plus Jakarta Sans, DM Mono.

## 라이선스

[LICENSE.md](LICENSE.md) 참고.
