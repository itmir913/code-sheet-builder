import {defineConfig} from 'vite';

/* 오프라인 zip은 압축을 풀고 index.html을 그냥 더블클릭해서 여는 용도다.
 * 그때 주소는 file:// 이 되는데, 브라우저는 file:// 을 출처 null로 보기 때문에
 *   - <script type="module">  → 모듈 파일을 CORS로 가로막는다
 *   - crossorigin 속성이 붙은 <link>/<script> → 마찬가지로 막힌다
 * 둘 다 걸리면 화면이 하얗게 뜬다. 분리 전에는 평범한 <script> 태그였기 때문에
 * 이 문제가 없었고, 빌드를 넣으면서 깨뜨리지 않으려면 아래 둘이 필요하다.
 *   1. 번들을 iife로 내보내 모듈 문법 없이 실행되게 한다
 *   2. 생성된 태그에서 type="module"과 crossorigin을 걷어낸다
 * defer를 붙이는 이유는 이 스크립트가 <head>에 있어서다. 없으면 DOM이 만들어지기
 * 전에 실행된다. type="module"이 원래 defer처럼 동작했으므로 그 자리를 메운다. */
function fileProtocolSafeHtml() {
    return {
        name: 'file-protocol-safe-html',
        enforce: 'post',
        transformIndexHtml(html) {
            return html
                .replace(/<script\s+([^>]*)><\/script>/g, (tag, attrs) => {
                    if (!/type="module"/.test(attrs)) return tag;
                    const src = attrs.match(/src="([^"]+)"/);
                    return src ? `<script defer src="${src[1]}"></script>` : tag;
                })
                .replace(/(<link\b[^>]*?)\s+crossorigin(?=[\s>])/g, '$1');
        },
    };
}

/* postcss.config.js 가 @font-face 에서 woff 폴백을 지워도 파일 자체는 여전히 나온다.
 * Vite 가 CSS 를 처리하면서 url() 을 먼저 asset 으로 등록해 두고, 그 뒤에 PostCSS 가
 * 선언을 지우기 때문이다. 등록만 남고 참조가 없는 상태가 된다.
 *
 * 그래서 번들을 내보내기 직전에, 아무 데서도 참조하지 않는 폰트 파일을 뺀다.
 * 이름으로 지우지 않고 참조 여부로 판단하므로, 폴백을 되살리면 파일도 같이 돌아온다. */
function dropUnreferencedFonts() {
    return {
        name: 'drop-unreferenced-fonts',
        enforce: 'post',
        generateBundle(_options, bundle) {
            // 폰트를 가리키는 곳은 CSS뿐이지만, 나중에 JS가 참조해도 안전하도록 함께 훑는다.
            const isReferenced = (name) => Object.values(bundle).some((c) =>
                c.type === 'chunk'
                    ? c.code.includes(name)
                    : /[.](css|html|svg|json)$/.test(c.fileName) && String(c.source).includes(name));

            for (const [fileName, chunk] of Object.entries(bundle)) {
                if (chunk.type !== 'asset') continue;
                if (!/[.](ttf|eot|woff|otf)$/.test(fileName)) continue;
                if (isReferenced(fileName.split('/').pop())) continue;
                delete bundle[fileName];
                this.warn(`참조 없는 폰트 제외: ${fileName}`);
            }
        },
    };
}

export default defineConfig({
    // 상대 경로로 내보낸다. GitHub Pages의 하위 경로에서도, 오프라인 zip을 풀어
    // file:// 로 열어도 똑같이 동작하게 하려는 것이다. 절대 경로면 둘 중 하나가 깨진다.
    base: './',

    plugins: [fileProtocolSafeHtml(), dropUnreferencedFonts()],

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Monaco 하나만으로 1MB를 넘는다. 에디터를 통째로 쓰는 앱이라 쪼갤 실익이
        // 없고(어차피 첫 화면에서 필요하다) 경고선만 올린다.
        chunkSizeWarningLimit: 3000,
        // modulepreload 링크는 모듈 전용이라 iife에서는 쓸모가 없다.
        modulePreload: false,
        // iife로 내보내면 Vite가 CSS를 JS 안에 넣고 실행 시점에 <style>로 주입한다.
        // 그러면 JS를 다 읽을 때까지 스타일 없는 화면이 보인다.
        // 한 덩어리로 뽑아 <link>로 먼저 걸리게 한다.
        cssCodeSplit: false,
        rollupOptions: {
            // Monaco의 basic-languages는 언어별 파일을 동적 import로 불러온다.
            // iife는 코드 분할을 못 하므로 전부 한 파일에 넣는다. file:// 에서
            // 청크를 따로 fetch 못 하는 문제도 이걸로 같이 사라진다.
            output: {format: 'iife', inlineDynamicImports: true},
        },
    },

    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
    },
});
