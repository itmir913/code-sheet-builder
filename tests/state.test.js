import {beforeEach, describe, expect, it} from 'vitest';
import {Store} from '../src/store/state.js';

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

describe('LOAD_STATE', () => {
    it('저장 파일의 CRLF 를 LF 로 정규화한다', () => {
        Store.dispatch({
            type: 'LOAD_STATE',
            data: {problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: 'a\r\nb'}]}]},
        });
        expect(Store.state.problems[0].codeBlocks[0].code).toBe('a\nb');
    });

    it('빠진 필드를 기본값으로 채운다', () => {
        Store.dispatch({
            type: 'LOAD_STATE',
            data: {problems: [{id: 'p1', codeBlocks: [{id: 'b1', code: 'x'}]}], settings: {fontSize: 12}},
        });
        const block = Store.state.problems[0].codeBlocks[0];
        expect(block.masks).toEqual([]);
        expect(block.highlightLines).toEqual([]);
        // 넘겨준 설정은 살리고 나머지는 기본값을 쓴다
        expect(Store.state.settings.fontSize).toBe(12);
        expect(Store.state.settings.margin).toBe(15);
    });

    it('선택된 문제가 없으면 첫 문제를 고른다', () => {
        Store.dispatch({type: 'LOAD_STATE', data: {problems: [{id: 'p1', codeBlocks: []}]}});
        expect(Store.state.currentProblemId).toBe('p1');
    });

    it('알 수 없는 최상위 키를 상태에 섞지 않는다', () => {
        Store.dispatch({type: 'LOAD_STATE', data: {problems: [], 악의적키: 1}});
        expect(Store.state).not.toHaveProperty('악의적키');
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
