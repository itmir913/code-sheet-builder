import globals from 'globals';

/* 이 설정의 목적은 스타일 검사가 아니라 no-undef 하나다.
 * 전역 스크립트에서 ES 모듈로 옮기면서 파일 간 import를 기계적으로 넣었는데,
 * 하나라도 빠지면 빌드는 통과하고 그 코드를 실제로 실행할 때만 ReferenceError가
 * 난다. no-undef가 그걸 정적으로 잡아준다. */
export default [
    {
        ignores: ['dist/', 'node_modules/'],
    },
    {
        files: ['src/**/*.js', 'tests/**/*.js', '*.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.browser},
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', {args: 'none', varsIgnorePattern: '^_'}],
        },
    },
    {
        // 테스트는 node 위에서 돌아간다.
        files: ['tests/**/*.js'],
        languageOptions: {globals: {...globals.node}},
    },
];
