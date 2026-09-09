import {describe, expect, it} from 'vitest';
import {PrintMgr} from '../src/components/print.js';
import {esc} from '../src/utils/html.js';

describe('esc', () => {
    it('HTML 특수문자를 모두 바꾼다', () => {
        expect(esc(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#039;');
    });

    /* & 를 먼저 바꾸지 않으면 뒤에 만든 &lt; 의 & 를 다시 바꿔 &amp;lt; 가 된다. */
    it('이미 이스케이프한 문자열을 두 번 망가뜨리지 않는지 - 순서 확인', () => {
        expect(esc('<')).toBe('&lt;');
    });

    it('빈 값은 빈 문자열이다', () => {
        expect(esc('')).toBe('');
        expect(esc(undefined)).toBe('');
        expect(esc(null)).toBe('');
    });
});

describe('_renderLineMasks', () => {
    it('마스크가 없으면 줄을 그대로 이스케이프한다', () => {
        expect(PrintMgr._renderLineMasks('a < b', [], 'student')).toBe('a &lt; b');
    });

    /* 인쇄본에서 빈 줄이 높이 0 으로 찌그러지면 줄 번호와 코드가 어긋난다. */
    it('빈 줄은 &nbsp; 로 채워 높이를 지킨다', () => {
        expect(PrintMgr._renderLineMasks('', [], 'student')).toBe('&nbsp;');
    });

    it('정답지에서는 가려진 내용을 보여 준다', () => {
        const masks = [{start: 0, end: 3, type: 'blank'}];
        expect(PrintMgr._renderLineMasks('abc', masks, 'answer'))
            .toBe('<span class="pb-answer">abc</span>');
    });

    /* 밑줄이 너무 짧으면 학생이 답을 쓸 자리가 없다. 공백을 뺀 글자 수만큼,
     * 최소 4칸은 준다. */
    it('빈칸 밑줄은 최소 4칸이다', () => {
        const masks = [{start: 0, end: 1, type: 'blank'}];
        expect(PrintMgr._renderLineMasks('a', masks, 'student'))
            .toBe('<span class="pb-blank">____</span>');
    });

    it('빈칸 밑줄은 공백을 뺀 글자 수를 따른다', () => {
        const masks = [{start: 0, end: 8, type: 'blank'}];
        const html = PrintMgr._renderLineMasks('ab   cde', masks, 'student');
        expect(html).toBe('<span class="pb-blank">_____</span>');
    });

    it('주석 마스크는 길이와 무관하게 같은 표시를 쓴다', () => {
        const masks = [{start: 0, end: 3, type: 'comment'}];
        expect(PrintMgr._renderLineMasks('abc', masks, 'student'))
            .toBe('<span class="pb-comment">/* ? */</span>');
    });

    it('마스크 앞뒤의 코드는 남긴다', () => {
        const masks = [{start: 8, end: 9, type: 'blank'}];
        const html = PrintMgr._renderLineMasks('int a = 1;', masks, 'student');
        expect(html).toBe('int a = <span class="pb-blank">____</span>;');
    });
});

describe('_renderBlock', () => {
    const block = (over = {}) => ({
        id: 'b1', title: '', lang: 'c', masks: [], highlightLines: [], code: '', ...over,
    });

    /* 줄 번호 자리수가 줄마다 다르면 코드 왼쪽 끝이 들쭉날쭉해진다.
     * 가장 긴 줄 번호에 맞춰 0 을 채운다. */
    it('줄 번호를 가장 긴 번호의 자리수에 맞춰 0 으로 채운다', () => {
        const code = Array.from({length: 10}, (_, i) => `line${i}`).join('\n');
        const html = PrintMgr._renderBlock(block({code}), 'student');
        expect(html).toContain('<div class="pcl-num">01</div>');
        expect(html).toContain('<div class="pcl-num">10</div>');
    });

    it('9줄 이하면 0 을 채우지 않는다', () => {
        const html = PrintMgr._renderBlock(block({code: 'a\nb'}), 'student');
        expect(html).toContain('<div class="pcl-num">1</div>');
    });

    it('강조 줄에만 hl 클래스를 붙인다', () => {
        const html = PrintMgr._renderBlock(block({code: 'a\nb', highlightLines: [2]}), 'student');
        expect(html.match(/pcl-code hl/g)).toHaveLength(1);
    });

    /* 마스크는 블록 전체 기준 오프셋으로 저장되므로, 줄 단위로 그리려면
     * 줄의 시작 오프셋만큼 빼서 옮겨야 한다. 여기가 틀리면 두 번째 줄부터
     * 엉뚱한 자리가 가려진다. */
    it('여러 줄에 걸친 마스크를 줄마다 잘라서 그린다', () => {
        const code = 'abc\ndef';
        const masks = [{id: 'm1', start: 2, end: 5, type: 'blank', text: 'c\nd'}];
        const html = PrintMgr._renderBlock(block({code, masks}), 'answer');
        expect(html).toContain('ab<span class="pb-answer">c</span>');
        expect(html).toContain('<span class="pb-answer">d</span>ef');
    });

    it('블록 제목을 이스케이프해서 넣는다', () => {
        const html = PrintMgr._renderBlock(block({code: 'a', title: '<b>제목</b>'}), 'student');
        expect(html).toContain('&lt;b&gt;제목&lt;/b&gt;');
        expect(html).not.toContain('<b>제목</b>');
    });
});
