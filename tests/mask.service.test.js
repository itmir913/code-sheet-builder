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

/* 마스크가 겹치거나 마스크 안에 빈 줄이 있으면, 렌더러가 원본에 없는 코드를
 * 지어내거나 채울 것 없는 빈칸을 그렸다. 두 렌더러(편집기 <pre> 와 인쇄본)가
 * 같은 규칙을 따라야 화면과 종이가 같아 보인다. */
describe('render - 어긋난 마스크 방어', () => {
    const text = (html) => html.replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    it('겹치는 마스크가 들어와도 코드를 중복 출력하지 않는다', () => {
        const masks = [
            {id: 'm1', start: 0, end: 6, type: 'blank', text: 'abcdef'},
            {id: 'm2', start: 2, end: 4, type: 'blank', text: 'cd'},
        ];
        expect(text(MaskService.render('abcdefgh', masks, 'answer'))).toBe('abcdefgh');
    });

    it('앞 마스크에 완전히 삼켜진 마스크는 무시한다', () => {
        const masks = [
            {id: 'm1', start: 0, end: 6, type: 'blank', text: 'abcdef'},
            {id: 'm2', start: 2, end: 4, type: 'blank', text: 'cd'},
        ];
        expect(MaskService.render('abcdefgh', masks, 'student').match(/mask-blank/g)).toHaveLength(1);
    });

    /* 줄 끝까지 드래그하면 마스크가 개행으로 끝난다. 예전에는 다음 줄 맨 앞에
     * 유령 '???' 가 하나 더 생겼고, 인쇄본에는 없어 화면과 종이가 달랐다. */
    it('개행으로 끝나는 마스크는 다음 줄에 자리표시자를 남기지 않는다', () => {
        const html = MaskService.render('a\nb', [{id: 'm1', start: 0, end: 2, type: 'blank', text: 'a\n'}], 'student');
        expect(html.match(/mask-blank/g)).toHaveLength(1);
        expect(text(html)).toBe('???\nb');
    });

    it('개행만 덮는 마스크는 아무 자리표시자도 그리지 않는다', () => {
        const html = MaskService.render('aa\nbb', [{id: 'm1', start: 2, end: 3, type: 'blank', text: '\n'}], 'student');
        expect(html).not.toContain('mask-blank');
        expect(text(html)).toBe('aa\nbb');
    });

    it('마스크 안의 빈 줄에는 자리표시자를 그리지 않는다', () => {
        const html = MaskService.render('a\n\nb', [{id: 'm1', start: 0, end: 4, type: 'blank', text: 'a\n\nb'}], 'student');
        expect(html.match(/mask-blank/g)).toHaveLength(2);
        expect(text(html)).toBe('???\n\n???');
    });
});

/* 강조 span 은 어떤 입력에서도 연 만큼 닫혀야 한다. 하나라도 새면 그 아래
 * 코드가 전부 강조색으로 물든다. */
describe('render - 강조 span 균형', () => {
    const codes = ['', 'a', 'a\n', '\n\n', 'a\n\nb', 'aa\nbb\ncc'];
    const hlSets = [[], [1], [2], [3], [1, 3], [99], [2, 2]];

    it('열고 닫은 수가 언제나 같다', () => {
        for (const code of codes) {
            for (const hl of hlSets) {
                for (const masks of [[], [{id: 'm1', start: 0, end: Math.max(1, code.length), type: 'blank', text: code}]]) {
                    if (masks.length && !code.length) continue;
                    for (const mode of ['student', 'answer']) {
                        const html = MaskService.render(code, masks, mode, hl);
                        const open = (html.match(/<span class="hl-line">/g) || []).length;
                        const close = (html.match(/<\/span>/g) || []).length;
                        const maskSpans = (html.match(/<span class="mask-/g) || []).length;
                        expect(close - maskSpans, `${JSON.stringify(code)} hl=${hl} mode=${mode}`).toBe(open);
                    }
                }
            }
        }
    });
});

/* 가리기 모드의 <pre> 는 마스크를 '???' 같은 자리표시자로 그린다. 화면에서 잰
 * 오프셋을 원본 오프셋으로 되돌릴 때, 마스크 구간은 두 길이가 다르다는 것을
 * 고려해야 한다. 예전에는 평문과 똑같이 델타를 더해서 좌표계가 섞였다. */
describe('mapHtmlToRaw - 자리표시자 경계', () => {
    // 'sum = a + b;' 의 'a' 를 주석으로 가리면 화면은 "sum = // ... + b;" 가 된다.
    const commentBlock = {
        code: 'sum = a + b;',
        masks: [{id: 'm1', start: 6, end: 7, type: 'comment', text: 'a'}],
    };
    // 'int a = 1;' 의 '1' 을 빈칸으로 가리면 화면은 "int a = ???;" 가 된다.
    const blankBlock = {
        code: 'int a = 1;',
        masks: [{id: 'm1', start: 8, end: 9, type: 'blank', text: '1'}],
    };

    /* 예전에는 {start:8, end:12} 를 그대로 돌려줘 원본의 '+ b;' 를 가렸다.
     * 기존 마스크와 겹치지도 않아 겹침 검사에도 안 걸리고 경고 없이 뚫렸다. */
    it('자리표시자 안에서 시작한 선택은 마스크 시작으로 스냅한다', () => {
        const raw = MaskService.mapHtmlToRaw(commentBlock, {start: 8, end: 12}, 'student');
        expect(raw.start).toBe(6);
    });

    it('자리표시자 안에서 끝난 선택은 마스크 끝으로 스냅한다', () => {
        const raw = MaskService.mapHtmlToRaw(blankBlock, {start: 7, end: 10}, 'student');
        expect(raw).toEqual({start: 7, end: 9});
    });

    /* 스냅한 결과는 기존 마스크를 통째로 덮으므로 ADD_MASK 의 겹침 검사에 걸린다.
     * 사용자에게 "겹칩니다" 를 알려 주는 편이 조용히 엉뚱한 곳을 뚫는 것보다 낫다. */
    it('자리표시자에 걸친 선택은 기존 마스크를 온전히 포함한다', () => {
        const raw = MaskService.mapHtmlToRaw(commentBlock, {start: 8, end: 15}, 'student');
        expect(raw.start).toBeLessThanOrEqual(6);
        expect(raw.end).toBeGreaterThanOrEqual(7);
    });

    it('자리표시자를 통째로 고른 선택은 마스크 범위 그대로다', () => {
        // 화면의 '???' 는 8..11
        expect(MaskService.mapHtmlToRaw(blankBlock, {start: 8, end: 11}, 'student'))
            .toEqual({start: 8, end: 9});
    });

    it('정답지에서는 두 길이가 같으므로 스냅해도 결과가 같다', () => {
        expect(MaskService.mapHtmlToRaw(blankBlock, {start: 8, end: 9}, 'answer'))
            .toEqual({start: 8, end: 9});
    });
});

describe('mapHtmlToRaw - mask.text 를 믿지 않는다', () => {
    /* text 는 저장 파일에서 그대로 넘어올 수 있다. render() 는 코드에서 잘라
     * 그리는데 여기서만 text 로 줄 수를 세면 예측 길이가 통째로 빗나간다. */
    it('text 가 코드와 어긋나도 render 와 같은 기준으로 줄 수를 센다', () => {
        const block = {code: 'a\nb\nc', masks: [{id: 'm1', start: 1, end: 4, type: 'blank', text: 'xyz'}]};

        // 화면 오프셋을 매직 넘버로 두지 않고 render() 의 실제 출력에서 잰다.
        const shown = MaskService.render(block.code, block.masks, 'student').replace(/<[^>]*>/g, '');
        // 마스크 뒤 마지막 글자 'c' 를 고른다
        expect(MaskService.mapHtmlToRaw(block, {start: shown.length - 1, end: shown.length}, 'student'))
            .toEqual({start: 4, end: 5});
    });

    it('text 가 없는 마스크에서도 던지지 않는다', () => {
        const block = {code: 'abc', masks: [{id: 'm1', start: 0, end: 1, type: 'blank'}]};
        expect(() => MaskService.mapHtmlToRaw(block, {start: 4, end: 5}, 'student')).not.toThrow();
    });
});

/* 자리표시자 길이 예측식('???' 4n-1 / '// ...' 7n-1 / ' ' 2n-1)은 render() 가
 * 실제로 뱉는 글자 수와 한 글자도 어긋나면 안 된다. 두 함수가 각자 상수를 들고
 * 있어서, 한쪽만 고치면 조용히 어긋난다. 여기가 그 잠금장치다. */
describe('render 와 mapHtmlToRaw 의 길이 계약', () => {
    const strip = (html) => html
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&');

    const codes = ['int a = 1;', 'a\nb\nc', 'x\n', 'aa\nbb\ncc\ndd'];
    const types = ['blank', 'comment', 'hidden'];
    const modes = ['student', 'answer'];

    it('마스크 뒤 평문의 raw→html→raw 왕복이 항등이다', () => {
        for (const code of codes) {
            for (const type of types) {
                for (const viewMode of modes) {
                    // 코드 한가운데를 덮는 마스크 하나
                    const start = 1;
                    const end = Math.max(2, Math.floor(code.length / 2));
                    const block = {code, masks: [{id: 'm1', start, end, type, text: code.slice(start, end)}]};

                    const htmlLen = strip(MaskService.render(code, block.masks, viewMode)).length;
                    // 마스크 뒤 마지막 한 글자를 화면 기준으로 고른다
                    if (end >= code.length) continue;
                    const raw = MaskService.mapHtmlToRaw(block, {start: htmlLen - 1, end: htmlLen}, viewMode);

                    expect(raw, `${JSON.stringify(code)} ${type} ${viewMode}`)
                        .toEqual({start: code.length - 1, end: code.length});
                }
            }
        }
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
