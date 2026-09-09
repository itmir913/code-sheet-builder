import {beforeEach, describe, expect, it} from 'vitest';
import {Store} from '../src/store/state.js';
import {DEFAULT_LANG_ID} from '../src/languages.js';

/* Store 는 모듈 하나짜리 싱글턴이라 테스트 사이에 상태가 남는다.
 * 매번 RESET 으로 초기 상태와 내부 카운터를 되돌린 뒤 시작한다. */
beforeEach(() => Store.dispatch({type: 'RESET'}));

/* 문제 하나 + 코드 블록 하나를 만들고 그 id 를 돌려주는 헬퍼 */
function addProblem() {
    Store.dispatch({type: 'ADD_PROBLEM'});
    const prob = Store.currentProb();
    return {probId: prob.id, blockId: prob.codeBlocks[0].id};
}

describe('ADD_PROBLEM', () => {
    it('코드 블록 하나를 함께 만들고 새 문제를 선택 상태로 둔다', () => {
        const {probId} = addProblem();
        expect(Store.state.problems).toHaveLength(1);
        expect(Store.state.problems[0].codeBlocks).toHaveLength(1);
        expect(Store.state.currentProblemId).toBe(probId);
    });

    it('학습지 기본 언어를 새 문제의 언어로 쓴다', () => {
        Store.dispatch({type: 'WS_SET_FIELD', field: 'defaultLang', value: 'python'});
        addProblem();
        const prob = Store.currentProb();
        expect(prob.lang).toBe('python');
        expect(prob.codeBlocks[0].lang).toBe('python');
    });
});

describe('DELETE_PROBLEM', () => {
    it('선택된 문제를 지우면 앞 문제로 선택이 옮겨간다', () => {
        const a = addProblem();
        const b = addProblem();
        Store.dispatch({type: 'DELETE_PROBLEM', id: b.probId});
        expect(Store.state.currentProblemId).toBe(a.probId);
    });

    it('마지막 문제를 지우면 선택이 없어진다', () => {
        const {probId} = addProblem();
        Store.dispatch({type: 'DELETE_PROBLEM', id: probId});
        expect(Store.state.problems).toHaveLength(0);
        expect(Store.state.currentProblemId).toBeNull();
    });

    it('없는 id 는 무시한다', () => {
        addProblem();
        const before = Store.state;
        Store.dispatch({type: 'DELETE_PROBLEM', id: 'prob_없는것'});
        expect(Store.state).toBe(before);
    });
});

describe('REORDER_PROBLEMS', () => {
    it('순서를 바꾼다', () => {
        const a = addProblem();
        const b = addProblem();
        Store.dispatch({type: 'REORDER_PROBLEMS', from: 0, to: 1});
        expect(Store.state.problems.map(p => p.id)).toEqual([b.probId, a.probId]);
    });

    /* SortableJS 가 목록 밖으로 놓은 항목을 넘기면 from 이 범위를 벗어날 수 있다.
     * 그때 splice 가 undefined 를 끼워 넣어 목록이 깨지던 적이 있다. */
    it('범위를 벗어난 from 은 상태를 바꾸지 않는다', () => {
        addProblem();
        const before = Store.state;
        Store.dispatch({type: 'REORDER_PROBLEMS', from: 5, to: 0});
        expect(Store.state).toBe(before);
    });

    it('범위를 넘는 to 는 끝으로 잘라 넣는다', () => {
        const a = addProblem();
        const b = addProblem();
        Store.dispatch({type: 'REORDER_PROBLEMS', from: 0, to: 99});
        expect(Store.state.problems.map(p => p.id)).toEqual([b.probId, a.probId]);
    });
});

describe('UPDATE_BLOCK_CODE', () => {
    it('CRLF 를 LF 로 정규화한다', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'a\r\nb\r\nc'});
        expect(Store.getBlock(probId, blockId).code).toBe('a\nb\nc');
    });

    /* 마스크는 문자 오프셋으로 저장된다. 코드가 짧아지면 오프셋이 코드 밖을
     * 가리키게 되므로, 범위를 벗어난 마스크는 버리고 남은 것은 새 코드 기준으로
     * text 를 다시 잘라야 한다. */
    it('코드가 짧아지면 범위를 벗어난 마스크를 버린다', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'abcdefghij'});
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 8, end: 10, maskType: 'blank'});
        expect(Store.getBlock(probId, blockId).masks).toHaveLength(1);

        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'abcde'});
        expect(Store.getBlock(probId, blockId).masks).toHaveLength(0);
    });

    it('남은 마스크의 text 를 새 코드에서 다시 잘라 온다', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'abcdefghij'});
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 0, end: 3, maskType: 'blank'});
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'XYZdefghij'});
        expect(Store.getBlock(probId, blockId).masks[0].text).toBe('XYZ');
    });
});

describe('ADD_MASK', () => {
    function withCode(code) {
        const ids = addProblem();
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', ...ids, code});
        return ids;
    }

    it('선택 영역을 마스크로 만들고 start 순으로 정렬해 둔다', () => {
        const {probId, blockId} = withCode('abcdefghij');
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 5, end: 7, maskType: 'blank'});
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 0, end: 2, maskType: 'comment'});
        expect(Store.getBlock(probId, blockId).masks.map(m => m.start)).toEqual([0, 5]);
    });

    it('이미 가려진 영역과 겹치면 마스크를 만들지 않고 오류 표시를 남긴다', () => {
        const {probId, blockId} = withCode('abcdefghij');
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 2, end: 6, maskType: 'blank'});
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 4, end: 8, maskType: 'blank'});

        const block = Store.getBlock(probId, blockId);
        expect(block.masks).toHaveLength(1);
        expect(block._maskError).toBe('overlap');
    });

    it('공백만 선택하면 무시한다', () => {
        const {probId, blockId} = withCode('ab    cd');
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 2, end: 6, maskType: 'blank'});
        expect(Store.getBlock(probId, blockId).masks).toHaveLength(0);
    });

    it('코드 길이를 넘는 끝 오프셋은 잘라서 받는다', () => {
        const {probId, blockId} = withCode('abcde');
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 3, end: 999, maskType: 'blank'});
        expect(Store.getBlock(probId, blockId).masks[0]).toMatchObject({start: 3, end: 5, text: 'de'});
    });
});

/* 저장 파일은 사람이 손으로 고칠 수 있고 예전 버전이 쓴 것일 수도 있다.
 * 여기를 통과한 뒤로는 상태가 앱이 만든 것과 같은 모양이어야 한다 - 렌더링 쪽에
 * "이 필드가 있나" 를 묻는 코드를 흩뿌리지 않는 것이 이 정규화의 목적이다. */
describe('LOAD_STATE 정규화', () => {
    const load = (data) => Store.dispatch({type: 'LOAD_STATE', data});
    const firstBlock = () => Store.state.problems[0].codeBlocks[0];

    describe('빠진 필드', () => {
        beforeEach(() => load({problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: 'x = 1'}]}]}));

        /* lang 이 없으면 sidebar 의 p.lang.toUpperCase() 가 TypeError 를 던졌다.
         * 예외가 렌더링 도중에 나므로 상태만 교체된 채 앱이 먹통이 됐다. */
        it('lang 이 빠지면 학습지 기본 언어로 채운다', () => {
            expect(Store.state.problems[0].lang).toBe(DEFAULT_LANG_ID);
            expect(firstBlock().lang).toBe(DEFAULT_LANG_ID);
        });

        /* editorMode 가 undefined 면 'edit' 이 아니므로 조용히 가리기 모드로 열렸다. */
        it('editorMode 가 빠지면 편집 모드로 연다', () => {
            expect(firstBlock().editorMode).toBe('edit');
        });

        it('type 이 빠지면 fill 로 채운다', () => {
            expect(Store.state.problems[0].type).toBe('fill');
        });

        it('masks 와 highlightLines 를 빈 배열로 채운다', () => {
            expect(firstBlock().masks).toEqual([]);
            expect(firstBlock().highlightLines).toEqual([]);
        });
    });

    it('id 가 없는 문제에도 id 를 만들어 선택까지 맞춰 둔다', () => {
        load({problems: [{codeBlocks: []}]});
        const prob = Store.state.problems[0];
        expect(prob.id).toBeTruthy();
        expect(Store.state.currentProblemId).toBe(prob.id);
    });

    it('선택된 문제가 없으면 첫 문제를 고른다', () => {
        load({problems: [{id: 'p1', codeBlocks: []}]});
        expect(Store.state.currentProblemId).toBe('p1');
    });

    it('상태에 없는 currentProblemId 는 첫 문제로 되돌린다', () => {
        load({problems: [{id: 'p1', codeBlocks: []}], currentProblemId: 'p_없는것'});
        expect(Store.state.currentProblemId).toBe('p1');
    });

    it('알 수 없는 최상위 키를 상태에 섞지 않는다', () => {
        load({problems: [], 악의적키: 1});
        expect(Store.state).not.toHaveProperty('악의적키');
    });

    it('빠진 설정을 기본값으로 채우고 넘겨준 값은 살린다', () => {
        load({problems: [], settings: {fontSize: 12}});
        expect(Store.state.settings.fontSize).toBe(12);
        expect(Store.state.settings.margin).toBe(15);
    });

    it('알 수 없는 viewMode 는 학생용으로 접는다', () => {
        load({problems: [], viewMode: '이상한값'});
        expect(Store.state.viewMode).toBe('student');
    });

    /* 여기가 CLAUDE.md 가 경고하는 자리다. 코드만 정규화하고 그 코드를 가리키는
     * 마스크를 그대로 두면 오프셋이 줄마다 한 칸씩 밀린다. */
    describe('CRLF 정규화와 마스크 오프셋', () => {
        it('저장 파일의 CRLF 를 LF 로 정규화한다', () => {
            load({problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: 'a\r\nb'}]}]});
            expect(firstBlock().code).toBe('a\nb');
        });

        /* CRLF 기준으로는 slice(16,19) 가 'ans' 였다. 오프셋을 함께 당기지
         * 않으면 'ns ' 를 덮어 정답의 첫 글자가 학생용에 노출된다. */
        it('CRLF 파일의 마스크 오프셋을 함께 당긴다', () => {
            load({problems: [{id: 'p1', codeBlocks: [{
                id: 'b1',
                code: 'int a = 1;\r\nint ans = 42;',
                masks: [{id: 'm1', start: 16, end: 19, type: 'blank', text: 'ans'}],
            }]}]});
            const block = firstBlock();
            const m = block.masks[0];
            expect(block.code.slice(m.start, m.end)).toBe('ans');
        });

        it('줄이 여러 개여도 오프셋이 누적으로 밀리지 않는다', () => {
            load({problems: [{id: 'p1', codeBlocks: [{
                id: 'b1',
                code: 'a\r\nb\r\nc\r\nTARGET',
                masks: [{id: 'm1', start: 9, end: 15, type: 'blank', text: 'TARGET'}],
            }]}]});
            const block = firstBlock();
            expect(block.code.slice(block.masks[0].start, block.masks[0].end)).toBe('TARGET');
        });
    });

    describe('마스크 정제', () => {
        const withMasks = (code, masks) =>
            load({problems: [{id: 'p1', codeBlocks: [{id: 'b1', code, masks}]}]});

        /* 범위를 벗어난 마스크는 인쇄에서 조용히 사라진다 - 답이 그대로 찍힌다. */
        it('코드 밖을 가리키는 마스크는 버린다', () => {
            withMasks('ab', [{id: 'm1', start: 50, end: 90, type: 'blank', text: 'zz'}]);
            expect(firstBlock().masks).toEqual([]);
        });

        it('start 가 end 이상인 마스크는 버린다', () => {
            withMasks('abcdef', [{id: 'm1', start: 4, end: 2, type: 'blank', text: 'x'}]);
            expect(firstBlock().masks).toEqual([]);
        });

        it('start / end 가 정수가 아니면 버린다', () => {
            withMasks('abcdef', [{id: 'm1', start: '0', end: 3, type: 'blank', text: 'abc'}]);
            expect(firstBlock().masks).toEqual([]);
        });

        /* 렌더러는 마스크가 겹치지 않는다고 전제하고 pos 를 되돌리지 않는다.
         * 겹친 채로 통과시키면 'abcdef' 가 'abcdcdef' 로 중복 출력된다. */
        it('겹치는 마스크는 앞의 것만 남긴다', () => {
            withMasks('abcdef', [
                {id: 'm1', start: 0, end: 4, type: 'blank', text: 'abcd'},
                {id: 'm2', start: 2, end: 6, type: 'blank', text: 'cdef'},
            ]);
            expect(firstBlock().masks).toHaveLength(1);
            expect(firstBlock().masks[0]).toMatchObject({start: 0, end: 4});
        });

        it('start 순으로 정렬해 둔다', () => {
            withMasks('abcdef', [
                {id: 'm2', start: 4, end: 6, type: 'blank', text: 'ef'},
                {id: 'm1', start: 0, end: 2, type: 'blank', text: 'ab'},
            ]);
            expect(firstBlock().masks.map(m => m.start)).toEqual([0, 4]);
        });

        /* text 가 코드와 어긋나면 mapHtmlToRaw 의 줄 수 계산이 통째로 빗나가고,
         * 아예 없으면 거기서 예외가 났다. 저장 파일의 값을 믿지 않는다. */
        it('text 를 코드에서 다시 잘라 온다', () => {
            withMasks('abcdef', [{id: 'm1', start: 0, end: 3, type: 'blank', text: '엉뚱한값'}]);
            expect(firstBlock().masks[0].text).toBe('abc');
        });

        it('text 가 없는 마스크에도 text 를 채워 넣는다', () => {
            withMasks('abcdef', [{id: 'm1', start: 0, end: 3, type: 'blank'}]);
            expect(firstBlock().masks[0].text).toBe('abc');
        });

        it('알 수 없는 마스크 유형은 blank 로 되돌린다', () => {
            withMasks('abcdef', [{id: 'm1', start: 0, end: 3, type: '<img src=x>', text: 'abc'}]);
            expect(firstBlock().masks[0].type).toBe('blank');
        });

        it('id 가 없는 마스크에도 id 를 만들어 준다', () => {
            withMasks('abcdef', [{start: 0, end: 3, type: 'blank'}]);
            expect(firstBlock().masks[0].id).toBeTruthy();
        });
    });

    describe('배열이 아닌 값', () => {
        it('problems 가 배열이 아니면 빈 목록으로 연다', () => {
            load({problems: {}});
            expect(Store.state.problems).toEqual([]);
        });

        /* codeBlocks 가 객체인 파일에서 (p.codeBlocks || []).map is not a function
         * 으로 리듀서가 통째로 터졌다. */
        it('codeBlocks 가 배열이 아니어도 던지지 않는다', () => {
            expect(() => load({problems: [{id: 'p1', codeBlocks: {}}]})).not.toThrow();
            expect(Store.state.problems[0].codeBlocks).toEqual([]);
        });

        it('code 가 문자열이 아니어도 던지지 않는다', () => {
            expect(() => load({problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: {}}]}]})).not.toThrow();
            expect(firstBlock().code).toBe('');
        });

        it('highlightLines 의 정수 아닌 값을 걸러 낸다', () => {
            load({problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: 'a', highlightLines: [1, '2', -3, null]}]}]});
            expect(firstBlock().highlightLines).toEqual([1]);
        });
    });

    /* 카운터를 개수로 되돌리면 중간을 지우고 저장한 파일에서 제목이 겹친다. */
    it('불러온 뒤 추가한 문제의 제목이 기존과 겹치지 않는다', () => {
        Store.dispatch({type: 'ADD_PROBLEM'});
        const first = Store.currentProb().id;
        Store.dispatch({type: 'ADD_PROBLEM'});
        Store.dispatch({type: 'ADD_PROBLEM'});
        Store.dispatch({type: 'DELETE_PROBLEM', id: first});

        load(JSON.parse(JSON.stringify(Store.toJSON())));
        Store.dispatch({type: 'ADD_PROBLEM'});

        const titles = Store.state.problems.map(p => p.title);
        expect(new Set(titles).size).toBe(titles.length);
    });
});

describe('toJSON', () => {
    it('직렬화할 수 없는 런타임 필드를 뺀다', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'SET_PENDING_MASK', data: {probId, blockId, start: 0, end: 1}});

        const json = Store.toJSON();
        expect(json).not.toHaveProperty('_pendingMask');
        expect(json.problems[0].codeBlocks[0]).not.toHaveProperty('_monacoModel');
        expect(json.problems[0].codeBlocks[0]).not.toHaveProperty('_maskError');
    });
});

describe('DUPLICATE_PROBLEM', () => {
    it('복제본은 원본과 다른 id 를 쓴다 - 블록과 마스크까지', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId, code: 'abcdef'});
        Store.dispatch({type: 'ADD_MASK', probId, blockId, start: 0, end: 3, maskType: 'blank'});
        Store.dispatch({type: 'DUPLICATE_PROBLEM', id: probId});

        const [original, copy] = Store.state.problems;
        expect(copy.id).not.toBe(original.id);
        expect(copy.codeBlocks[0].id).not.toBe(original.codeBlocks[0].id);
        expect(copy.codeBlocks[0].masks[0].id).not.toBe(original.codeBlocks[0].masks[0].id);
        // 내용은 같아야 한다
        expect(copy.codeBlocks[0].code).toBe(original.codeBlocks[0].code);
    });
});

describe('DELETE_BLOCK', () => {
    it('마지막 한 블록은 지우지 않는다', () => {
        const {probId, blockId} = addProblem();
        Store.dispatch({type: 'DELETE_BLOCK', probId, blockId});
        expect(Store.currentProb().codeBlocks).toHaveLength(1);
    });
});

describe('UPDATE_PROB_LANG', () => {
    it('문제의 언어를 바꾸면 모든 코드 블록이 따라간다', () => {
        const {probId} = addProblem();
        Store.dispatch({type: 'ADD_BLOCK', probId});
        Store.dispatch({type: 'UPDATE_PROB_LANG', id: probId, lang: 'java'});

        const prob = Store.currentProb();
        expect(prob.lang).toBe('java');
        expect(prob.codeBlocks.every(b => b.lang === 'java')).toBe(true);
    });
});
