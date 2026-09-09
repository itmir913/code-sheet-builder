import {describe, expect, it} from 'vitest';
import {esc, ownLabel} from '../src/utils/html.js';

describe('esc', () => {
    it('HTML 특수문자를 모두 바꾼다', () => {
        expect(esc(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#039;');
    });

    /* & 를 먼저 바꾸지 않으면 뒤에 만든 &lt; 의 & 를 다시 바꿔 &amp;lt; 가 된다. */
    it('앰퍼샌드를 두 번 이스케이프하지 않는다', () => {
        expect(esc('a & <b>')).toBe('a &amp; &lt;b&gt;');
    });

    it('null 과 undefined 는 빈 문자열이다', () => {
        expect(esc(null)).toBe('');
        expect(esc(undefined)).toBe('');
    });

    /* 학습지 JSON 은 사람이 손으로 고칠 수 있어서 title 이 숫자로 들어오기도 한다.
     * 예전에는 그 파일 하나로 사이드바 렌더링이 통째로 죽었다. */
    it('문자열이 아닌 값도 던지지 않고 이스케이프한다', () => {
        expect(() => esc(123)).not.toThrow();
        expect(esc(123)).toBe('123');
        expect(esc(true)).toBe('true');
    });

    /* 예전 구현의 `if (!str) return ''` 는 falsy 를 전부 삼켜서
     * 숫자 0 이 화면에서 조용히 사라졌다. */
    it('0 과 false 를 빈 문자열로 지우지 않는다', () => {
        expect(esc(0)).toBe('0');
        expect(esc(false)).toBe('false');
    });
});

describe('ownLabel', () => {
    const table = {fill: '빈칸 채우기'};

    it('표에 있는 키는 그 값을 준다', () => {
        expect(ownLabel(table, 'fill')).toBe('빈칸 채우기');
    });

    /* 대괄호 조회는 프로토타입 체인까지 올라간다. 불러온 파일의 type 이
     * 'constructor' 이면 인쇄본에 함수 소스가 찍히던 자리다. */
    it('프로토타입 체인의 값을 꺼내 오지 않는다', () => {
        expect(ownLabel(table, 'constructor')).toBe('');
        expect(ownLabel(table, 'toString')).toBe('');
    });

    it('없는 키에는 넘겨준 대체값을 쓴다', () => {
        expect(ownLabel(table, '없음', 'X')).toBe('X');
    });
});
