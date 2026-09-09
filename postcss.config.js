/* @fontsource 의 @font-face 는 woff2 를 먼저 쓰고 woff 를 폴백으로 둔다.
 *
 * woff 파일들이 빌드에 100KB 가까이 얹히는데, woff2 를 못 읽는 브라우저는 이 앱의
 * 대상이 아니다. woff2 는 2015년 이후 주요 브라우저가 모두 지원하고, 이 앱은 이미
 * ES2022 문법과 Monaco 0.45 를 쓴다.
 *
 * 폴백 선언을 지우면 CSS 가 woff 를 참조하지 않게 되고, 그러면 Vite 가 그 파일들을
 * 아예 내보내지 않는다 - 고 하고 싶지만 그렇지는 않다. vite.config.js 의
 * dropUnreferencedFonts 주석을 함께 볼 것.
 */
const dropWoffFallback = () => ({
    postcssPlugin: 'drop-woff-fallback',
    Declaration: {
        src(decl) {
            if (!decl.value.includes("format('woff')")) return;
            const kept = splitTopLevel(decl.value).filter((s) => !s.includes("format('woff')"));
            // woff2 가 하나도 없으면 손대지 않는다. 폰트를 통째로 날리는 것보다는
            // 파일 몇 개가 더 나가는 편이 낫다.
            if (!kept.length) return;
            decl.value = kept.join(', ');
        },
    },
});
dropWoffFallback.postcss = true;

/* src 값은 "url(...) format('woff2'), url(...) format('woff')" 처럼 쉼표로 나뉜다.
 * 그런데 url() 안에도 쉼표가 들어갈 수 있어서(data: URI) 단순 split 은 위험하다.
 * 괄호 깊이를 세어 최상위 쉼표에서만 자른다. */
function splitTopLevel(value) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of value) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

export default {
    plugins: [dropWoffFallback()],
};
