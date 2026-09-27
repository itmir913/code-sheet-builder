/* ═══════════════════════════════════════════════════════════
   monaco/setup.js — Monaco 에디터 로딩과 테마
═══════════════════════════════════════════════════════════ */

/* Monaco 는 npm 패키지를 번들에 넣는다.
 *
 * editor.main 대신 editor.api 를 쓰는 이유:
 *   editor.main 은 TypeScript/JSON/CSS/HTML 언어 서비스까지 등록한다. 이 앱은
 *   자동완성도 타입검사도 쓰지 않으므로 전부 군더더기고, 번들만 몇 배로 불린다.
 *   editor.api 는 에디터 코어만 담는다. 여기에 basic-languages 의 문법
 *   강조(Monarch, 메인 스레드에서 돈다)만 붙이면 이 앱이 쓰는 기능은 다 채워진다.
 *
 * 워커에 대해: 코어에도 편집기 워커가 남아 있어서 단어 기반 제안 같은 기능이
 * 이따금 워커를 요청한다. 오프라인 zip 은 file:// 로 열리고 브라우저는 file://
 * 출처에서 워커 생성을 막는데, Monaco 는 그때 경고 한 줄을 남기고 같은 코드를
 * 메인 스레드에서 돌린다. 편집과 문법 강조는 그대로 동작한다.
 *
 * 언어는 LANGUAGES 에 있는 넷만 등록한다. 전부 등록하면 번들이 몇 배가 된다.
 * (C 는 cpp 기여 파일이 'c' 와 'cpp' 를 함께 등록한다) */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';

/* editor.api 는 편집 동작(contrib)을 하나도 등록하지 않아서, 그대로 두면
 * Ctrl+/ 주석 토글, Alt+↑↓ 줄 이동, Shift+Alt+↓ 줄 복제, Ctrl+D 다중 선택,
 * Ctrl+←→ 단어 이동이 조용히 없다. 코드를 받아 적는 데 쓰는 것만 골라 붙인다. 찾기(Ctrl+F)는 아이콘 폰트가
 * 필요한 위젯이 딸려 오고 이 앱의 짧은 코드에는 값어치가 적어 넣지 않는다. */
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
/* 마스크 데코레이션의 hoverMessage(정답·유형 안내)를 띄운다. 이것이 없으면
 * getMaskDecorations 가 붙이는 안내가 한 번도 보이지 않는다. */
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hover.js';

export {monaco};

/* 디자인 설정의 '코드 테마'는 인쇄 화면의 배색 이름이지 Monaco 테마 이름이
 * 아니다. 등록되지 않은 이름을 넘기면 Monaco 는 조용히 기본 테마로 되돌리는데,
 * 그러면 설정과 화면이 어긋난 이유를 찾기 어렵다. 매핑을 한 곳에 두고
 * 에디터 생성 시점과 설정 변경 시점이 같은 표를 보게 한다. */
const THEME_MAP = {
    light: 'vs',
    github: 'vs',
    minimal: 'vs',
    dark: 'vs-dark',
};

export function monacoTheme(codeTheme) {
    return THEME_MAP[codeTheme] || 'vs';
}

export function setMonacoTheme(codeTheme) {
    monaco.editor.setTheme(monacoTheme(codeTheme));
}
