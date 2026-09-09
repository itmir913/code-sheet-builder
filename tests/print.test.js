import {beforeEach, describe, expect, it} from 'vitest';
import {PrintMgr} from '../src/components/print.js';
import {Store} from '../src/store/state.js';
import {MaskService} from '../src/services/mask.service.js';

/* esc() 자체의 계약은 tests/html.test.js 에 있다. 여기서는 인쇄 렌더링이
 * 그 함수를 실제로 거치는지만 본다. */

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

/* prepare() 는 학습지 전체를 문자열로 이어 붙여 #print-area 에 넣는다.
 * 불러온 파일의 값이 그 문자열에 그대로 들어가면 인쇄 미리보기를 여는 것만으로
 * 태그가 심긴다. jsdom 에 실제로 넣어 보고 요소가 생겼는지로 판정한다. */
/* 인쇄본과 편집기 <pre> 는 같은 마스크를 같은 규칙으로 그려야 한다.
 * 한쪽에만 빈칸이 생기면 화면에서 확인한 것과 다른 종이가 나온다. */
describe('_renderBlock - 어긋난 마스크 방어', () => {
    const block = (over = {}) => ({
        id: 'b1', title: '', lang: 'c', masks: [], highlightLines: [], code: '', ...over,
    });
    const lines = (html) => html.split('pcl-wrap').slice(1)
        .map(chunk => chunk.match(/<div class="pcl-code[^"]*">([\s\S]*?)<\/div>/)[1]);

    /* 함수 본문 가운데의 빈 줄은 아주 흔하다. 빈 줄은 lineStart === lineEnd 라
     * 걸쳐 가는 마스크에도 걸려서 길이 0 짜리 조각이 됐고, 그걸 그리면 원본에
     * 없던 빈칸이 생겨 학생이 채울 것 없는 칸을 채우려 한다. */
    it('마스크 안의 빈 줄에는 빈칸을 만들지 않는다', () => {
        const code = 'int f() {\n    int s = 0;\n\n    return s;\n}';
        const masks = [{id: 'm1', start: 10, end: 34, type: 'blank', text: code.slice(10, 34)}];
        const out = lines(PrintMgr._renderBlock(block({code, masks}), 'student'));

        expect(out[2]).toBe('&nbsp;');
        expect(out[2]).not.toContain('pb-blank');
    });

    it('개행 하나만 덮는 마스크는 어느 줄에도 빈칸을 남기지 않는다', () => {
        const masks = [{id: 'm1', start: 2, end: 3, type: 'blank', text: '\n'}];
        const html = PrintMgr._renderBlock(block({code: 'aa\nbb', masks}), 'student');
        expect(html).not.toContain('pb-blank');
    });

    it('개행으로 끝나는 마스크는 첫 줄만 가린다', () => {
        const masks = [{id: 'm1', start: 0, end: 2, type: 'blank', text: 'a\n'}];
        const out = lines(PrintMgr._renderBlock(block({code: 'a\nb', masks}), 'student'));
        expect(out[0]).toContain('pb-blank');
        expect(out[1]).toBe('b');
    });

    it('끝 개행이 만든 마지막 빈 줄은 &nbsp; 로 채운다', () => {
        const out = lines(PrintMgr._renderBlock(block({code: 'aa\n'}), 'student'));
        expect(out).toHaveLength(2);
        expect(out[1]).toBe('&nbsp;');
        // 줄 수는 편집기 쪽 줄 번호와 같아야 한다
        expect(MaskService.lineNumbers('aa\n').split('\n')).toHaveLength(out.length);
    });
});

describe('_renderLineMasks - 어긋난 마스크 방어', () => {
    const text = (html) => html.replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    it('겹치는 마스크에서 코드를 중복 출력하지 않는다', () => {
        const masks = [{start: 0, end: 6, type: 'blank'}, {start: 2, end: 4, type: 'blank'}];
        expect(text(PrintMgr._renderLineMasks('abcdefgh', masks, 'answer'))).toBe('abcdefgh');
    });

    /* 상한이 없으면 긴 식 하나를 가렸을 때 밑줄이 줄을 넘겨 접히고,
     * 그러면 줄 번호와 코드가 시각적으로 어긋난다. */
    it('밑줄 길이에 상한이 있다', () => {
        const line = 'result = compute(alpha, beta, gamma) + delta * epsilon;';
        const html = PrintMgr._renderLineMasks(line, [{start: 0, end: line.length, type: 'blank'}], 'student');
        expect((html.match(/_/g) || []).length).toBeLessThanOrEqual(24);
    });

    it('밑줄 길이의 하한은 그대로 4칸이다', () => {
        expect(PrintMgr._renderLineMasks('a', [{start: 0, end: 1, type: 'blank'}], 'student'))
            .toBe('<span class="pb-blank">____</span>');
    });
});

describe('prepare', () => {
    beforeEach(() => {
        Store.dispatch({type: 'RESET'});
        document.body.innerHTML = '<div id="print-area"></div>';
    });

    const printArea = () => document.getElementById('print-area');

    it('settings.codeTheme 을 이스케이프한다', () => {
        Store.dispatch({type: 'ADD_PROBLEM'});
        Store.dispatch({type: 'SET_SETTING', key: 'codeTheme', value: 'vs"><img src=x onerror="boom()'});
        PrintMgr.prepare();
        expect(printArea().querySelector('img')).toBeNull();
    });

    it('학습지 제목을 이스케이프한다', () => {
        Store.dispatch({type: 'ADD_PROBLEM'});
        Store.dispatch({type: 'WS_SET_FIELD', field: 'title', value: '<img src=x onerror="boom()">'});
        PrintMgr.prepare();
        expect(printArea().querySelector('img')).toBeNull();
        expect(printArea().querySelector('.ph-title').textContent).toContain('<img');
    });

    /* TYPE_LABELS 를 대괄호로 조회하면 프로토타입 체인까지 올라간다.
     * type 이 'constructor' 인 파일 하나로 배지에 함수 소스가 찍혔다. */
    it('알 수 없는 문제 유형은 빈 배지를 쓴다', () => {
        Store.dispatch({type: 'ADD_PROBLEM'});
        Store.dispatch({type: 'UPDATE_PROBLEM', id: Store.currentProb().id, field: 'type', value: 'constructor'});
        PrintMgr.prepare();
        expect(printArea().querySelector('.pprob-typebadge').textContent.trim()).toBe('');
    });
});
