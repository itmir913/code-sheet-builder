import {describe, expect, it} from 'vitest';
import {MaskService} from '../src/services/mask.service.js';

const mask = (over = {}) => ({id: 'm1', blockId: 'b1', start: 0, end: 1, type: 'blank', text: 'x', ...over});

describe('lineNumbers', () => {
    it('줄 수만큼 번호를 만든다', () => {
        expect(MaskService.lineNumbers('a\nb\nc')).toBe('1\n2\n3');
    });

    it('빈 코드도 1줄로 센다', () => {
        expect(MaskService.lineNumbers('')).toBe('1');
    });

    it('끝의 개행은 빈 줄 하나를 더 만든다', () => {
        expect(MaskService.lineNumbers('a\n')).toBe('1\n2');
    });
});

describe('render', () => {
    it('마스크가 없으면 코드를 그대로 이스케이프한다', () => {
        expect(MaskService.render('a < b', [])).toBe('a &lt; b');
    });

    it('학생용에서는 빈칸을 ??? 로 가린다', () => {
        const masks = [mask({start: 8, end: 9, text: '1'})];
        expect(MaskService.render('int a = 1;', masks, 'student'))
            .toBe('int a = <span class="mask-blank" data-mask-id="m1">???</span>;');
    });

    it('정답지에서는 원래 내용을 보여 준다', () => {
        const masks = [mask({start: 8, end: 9, text: '1'})];
        expect(MaskService.render('int a = 1;', masks, 'answer'))
            .toBe('int a = <span class="mask-answer" data-mask-id="m1">1</span>;');
    });

    it('마스크 유형마다 다른 클래스를 쓴다', () => {
        const at = (type) => MaskService.render('abc', [mask({start: 0, end: 3, type, text: 'abc'})], 'student');
        expect(at('blank')).toContain('class="mask-blank"');
        expect(at('comment')).toContain('class="mask-comment"');
        expect(at('hidden')).toContain('class="mask-hidden"');
    });

    /* 마스크가 여러 줄에 걸치면 줄마다 따로 가려야 한다.
     * 한 덩어리로 처리하면 줄바꿈이 사라져 아래 줄들이 위로 붙어 버린다. */
    it('여러 줄 마스크는 줄마다 따로 가린다', () => {
        const masks = [mask({start: 0, end: 3, text: 'a\nb'})];
        const html = MaskService.render('a\nb', masks, 'student');
        expect(html.match(/mask-blank/g)).toHaveLength(2);
        expect(html).toContain('\n');
    });

    it('마스크 안의 정답 텍스트도 이스케이프한다', () => {
        const masks = [mask({start: 0, end: 7, text: '<img/>'})];
        const html = MaskService.render('<img/>', masks, 'answer');
        expect(html).not.toContain('<img/>');
        expect(html).toContain('&lt;img/&gt;');
    });

    it('강조 줄을 span 으로 감싸고 줄이 끝나면 닫는다', () => {
        const html = MaskService.render('a\nb', [], 'student', [1]);
        expect(html).toBe('<span class="hl-line">a</span>\nb');
    });

    it('마지막 줄이 강조 대상이어도 span 을 닫는다', () => {
        const html = MaskService.render('a\nb', [], 'student', [2]);
        expect(html).toBe('a\n<span class="hl-line">b</span>');
    });
});

describe('mapHtmlToRaw', () => {
    /* 가리기 모드의 <pre> 는 마스크를 '???' 같은 자리표시자로 그린다. 그래서 화면에서
     * 잰 오프셋과 원본 코드의 오프셋이 어긋난다. 이 함수가 그 차이를 되돌린다.
     * 오프셋이 한 칸이라도 밀리면 엉뚱한 글자가 가려지므로 경계를 촘촘히 본다. */
    const block = {
        code: 'int a = 1;',
        masks: [{id: 'm1', start: 8, end: 9, type: 'blank', text: '1'}],
    };
    // 학생용 렌더 결과: 'int a = ???;'  (마스크 1글자 → 자리표시자 3글자)

    it('마스크가 없으면 오프셋을 그대로 돌려준다', () => {
        const plain = {code: 'abc', masks: []};
        expect(MaskService.mapHtmlToRaw(plain, {start: 0, end: 3})).toEqual({start: 0, end: 3});
    });

    it('마스크 앞쪽은 오프셋이 그대로다', () => {
        expect(MaskService.mapHtmlToRaw(block, {start: 0, end: 3}, 'student')).toEqual({start: 0, end: 3});
    });

    it('마스크 뒤쪽은 자리표시자와의 길이 차이만큼 당겨진다', () => {
        // html 의 ';' 는 11..12, 원본에서는 9..10
        expect(MaskService.mapHtmlToRaw(block, {start: 11, end: 12}, 'student')).toEqual({start: 9, end: 10});
    });

    it('정답지에서는 자리표시자가 없으므로 오프셋이 어긋나지 않는다', () => {
        expect(MaskService.mapHtmlToRaw(block, {start: 9, end: 10}, 'answer')).toEqual({start: 9, end: 10});
    });

    it('빈 선택은 null 을 준다', () => {
        expect(MaskService.mapHtmlToRaw(block, {start: 3, end: 3}, 'student')).toBeNull();
    });
});

describe('getMaskDecorations', () => {
    /* Monaco 를 통째로 띄우지 않고, 이 함수가 부르는 것만 흉내 낸 대역이다. */
    const monacoStub = {
        Range: class {
            constructor(sl, sc, el, ec) {
                Object.assign(this, {sl, sc, el, ec});
            }
        },
        editor: {TrackedRangeStickiness: {NeverGrowsWhenTypingAtEdges: 1}},
    };
    const modelStub = {getPositionAt: (o) => ({lineNumber: 1, column: o + 1})};

    it('마스크 유형마다 다른 클래스를 준다', () => {
        const masks = [
            {id: 'm1', start: 0, end: 1, type: 'blank', text: 'a'},
            {id: 'm2', start: 2, end: 3, type: 'comment', text: 'b'},
            {id: 'm3', start: 4, end: 5, type: 'hidden', text: 'c'},
        ];
        const decors = MaskService.getMaskDecorations(monacoStub, modelStub, masks, 'student');
        expect(decors.map(d => d.options.inlineClassName))
            .toEqual(['monaco-mask-blank', 'monaco-mask-comment', 'monaco-mask-hidden']);
    });

    it('정답지에서는 유형과 무관하게 정답 배색을 쓴다', () => {
        const masks = [{id: 'm1', start: 0, end: 1, type: 'blank', text: 'a'}];
        const decors = MaskService.getMaskDecorations(monacoStub, modelStub, masks, 'answer');
        expect(decors[0].options.inlineClassName).toBe('monaco-mask-answer');
    });
});

/* 마스크 id 는 사용자가 준 JSON 에서 그대로 넘어온다. 속성값 자리에 들어가므로
 * 따옴표 하나로 임의의 속성(핸들러 포함)을 붙일 수 있었다.
 * 문자열을 눈으로 보면 이스케이프한 결과에도 'onmouseover=' 가 남아 있어 헷갈린다.
 * 실제로 속성이 생겼는지를 DOM 에 넣어 확인한다. */
describe('마스크 id 이스케이프', () => {
    const evil = 'x" onmouseover="boom()';

    const firstSpan = (html) => {
        const host = document.createElement('div');
        host.innerHTML = html;
        return host.querySelector('span');
    };

    it('학생용에서 id 로 속성을 심을 수 없다', () => {
        const span = firstSpan(MaskService.render('int a = 1;', [mask({id: evil, start: 8, end: 9, text: '1'})], 'student'));
        expect(span.hasAttribute('onmouseover')).toBe(false);
        expect(span.dataset.maskId).toBe(evil);
    });

    it('정답지에서도 마찬가지다', () => {
        const span = firstSpan(MaskService.render('int a = 1;', [mask({id: evil, start: 8, end: 9, text: '1'})], 'answer'));
        expect(span.hasAttribute('onmouseover')).toBe(false);
        expect(span.dataset.maskId).toBe(evil);
    });
});
