/* ═══════════════════════════════════════════════════════════
   utils/html.js — HTML 이스케이프
═══════════════════════════════════════════════════════════ */

/* 이 앱은 문자열을 이어 붙여 HTML을 만드는 곳이 많다(문제 카드, 인쇄 화면,
 * 마스크 렌더링). 사용자가 입력한 제목·설명·코드가 그대로 들어가므로, 삽입 전에
 * 반드시 이 함수를 거쳐야 한다.
 *
 * 값이 문자열이라고 믿지 않는 이유: 학습지 JSON 은 사람이 손으로 고칠 수 있고
 * LOAD_STATE 가 그 값을 그대로 상태에 넣는다. title 이 숫자인 파일 하나에
 * `str.replace is not a function` 으로 렌더링 전체가 죽던 자리다. null/undefined
 * 만 빈 문자열로 접고, 나머지는 String() 으로 받아 낸다. 예전의 `if (!str)` 는
 * 숫자 0 과 false 까지 삼켜서 값이 조용히 사라졌다. */
export function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* TYPE_LABELS 같은 표를 사용자 값으로 조회할 때 쓴다. 대괄호 조회는 프로토타입
 * 체인까지 올라가므로 type 이 'constructor' 인 파일 하나로 인쇄본에
 * `function Object() { [native code] }` 가 찍힌다. */
export function ownLabel(table, key, fallback = '') {
    return Object.hasOwn(table, key) ? table[key] : fallback;
}
