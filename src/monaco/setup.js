/* ═══════════════════════════════════════════════════════════
   monaco/setup.js — Monaco 에디터 로딩과 테마
═══════════════════════════════════════════════════════════ */

/* 분리 전에는 lib/monaco-editor/ 전체(16MB)를 저장소에 넣고 AMD 로더로
 * require(['vs/editor/editor.main']) 했다. 이제는 npm 패키지를 번들에 넣는다.
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
 * 메인 스레드에서 돌린다. 편집과 문법 강조는 그대로 동작한다. 분리 전 AMD 로더
 * 시절에도 사정은 같았으므로 오프라인 동작이 나빠지지는 않는다.
 *
 * 언어는 LANGUAGES 에 있는 넷만 등록한다. 전부 등록하면 번들이 몇 배가 된다.
 * (C 는 cpp 기여 파일이 'c' 와 'cpp' 를 함께 등록한다) */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';

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
