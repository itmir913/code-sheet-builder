/* ═══════════════════════════════════════════════════════════
   store/state.js — Immutable State + Reducer
   Redux-style single source of truth
═══════════════════════════════════════════════════════════ */

import {DEFAULT_LANG_ID} from '../languages.js';

/* ── ID Generator ── */
const genId = (prefix) =>
    `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;

/* ── Counter Namespace ── */
let _pctr = 0;

/* ── TYPE LABELS ── */
export const TYPE_LABELS = {
    fill: '빈칸 채우기',
    output: '출력 예측',
    error: '오류 찾기',
    order: '순서 맞추기',
};

/* ═══════════════════════════════════════
   FACTORIES
═══════════════════════════════════════ */
function makeProb(lang = DEFAULT_LANG_ID) {
    _pctr++;
    return {
        id: genId('prob'),
        title: `문제 ${_pctr}`,
        type: 'fill',
        lang,
        description: '',
        hint: '',
        codeBlocks: [],
        answer: '',
    };
}

function makeBlock(lang = DEFAULT_LANG_ID, blockNum = 1) {
    return {
        id: genId('block'),
        blockNum: blockNum,
        title: `코드 블록 ${blockNum}`,
        lang,
        code: '',
        masks: [],
        highlightLines: [],
        editorMode: 'edit',   // 'edit' | 'select'
        _monacoModel: null,     // runtime only (not serialised)
    };
}

function makeMask(blockId, start, end, type, text) {
    return {id: genId('mask'), blockId, start, end, type, text};
}

/* ═══════════════════════════════════════
   LOAD 정규화

   저장 파일은 사람이 손으로 고칠 수 있고, 예전 버전이 쓴 것일 수도 있다.
   여기를 통과한 뒤로는 상태가 앱이 만든 것과 같은 모양이라고 믿는다 -
   렌더링 쪽에 `p.lang` 이 있는지 묻는 코드를 흩뿌리지 않으려는 것이다.
═══════════════════════════════════════ */
const MASK_TYPES = ['blank', 'comment', 'hidden'];

/* CRLF 를 LF 로 접으면 코드가 줄마다 한 글자씩 짧아진다. 마스크는 문자
 * 오프셋이므로 같이 당겨 주지 않으면 가리는 자리가 통째로 밀린다. 세 줄짜리
 * 파일에서 정답의 첫 글자가 노출되고, 줄이 많으면 오프셋이 코드 밖으로 나가
 * 인쇄에서 마스크가 사라진다 - 답이 그대로 찍힌다는 뜻이다. */
function crlfShifter(rawCode) {
    return (off) => rawCode.slice(0, Math.max(0, off)).replace(/\r\n/g, '\n').length;
}

function normalizeMasks(rawMasks, rawCode, code, blockId) {
    const shift = crlfShifter(rawCode);
    return (Array.isArray(rawMasks) ? rawMasks : [])
        .filter(m => m && Number.isInteger(m.start) && Number.isInteger(m.end))
        .map(m => ({...m, start: shift(m.start), end: shift(m.end)}))
        .filter(m => m.start >= 0 && m.start < m.end && m.end <= code.length)
        .sort((a, b) => a.start - b.start)
        /* 겹친 마스크는 렌더러가 전제하지 않는 모양이다. _buildSegments 와
         * _renderLineMasks 둘 다 pos 를 되돌리지 않아 겹친 만큼 코드를 두 번
         * 출력한다. ADD_MASK 가 UI 에서 막는 불변식을 여기서도 세운다. */
        .filter((m, i, arr) => i === 0 || m.start >= arr[i - 1].end)
        .map(m => ({
            id: m.id || genId('mask'),
            blockId,
            start: m.start,
            end: m.end,
            type: MASK_TYPES.includes(m.type) ? m.type : 'blank',
            /* text 는 저장 파일의 값을 믿지 않고 코드에서 다시 잘라 온다.
             * 어긋난 text 하나로 mapHtmlToRaw 의 줄 수 계산이 통째로 빗나간다. */
            text: code.slice(m.start, m.end),
        }));
}

function normalizeBlock(rawBlock, probLang, idx) {
    const b = rawBlock && typeof rawBlock === 'object' ? rawBlock : {};
    const base = makeBlock(b.lang || probLang, idx + 1);
    const rawCode = typeof b.code === 'string' ? b.code : '';
    const code = rawCode.replace(/\r\n/g, '\n');
    const id = b.id || base.id;

    return {
        ...base,
        ...b,
        id,
        lang: b.lang || probLang,
        title: typeof b.title === 'string' ? b.title : base.title,
        code,
        masks: normalizeMasks(b.masks, rawCode, code, id),
        highlightLines: (Array.isArray(b.highlightLines) ? b.highlightLines : [])
            .filter(n => Number.isInteger(n) && n > 0),
        /* 'edit' 이 아닌 값이면 가리기 모드로 열리므로, 모르는 값은 편집으로 접는다. */
        editorMode: b.editorMode === 'select' ? 'select' : 'edit',
        _maskError: null,
    };
}

function normalizeProblem(rawProb, defaultLang) {
    const p = rawProb && typeof rawProb === 'object' ? rawProb : {};
    const base = makeProb(p.lang || defaultLang);
    const lang = p.lang || defaultLang;
    const blocks = (Array.isArray(p.codeBlocks) ? p.codeBlocks : [])
        .map((b, i) => normalizeBlock(b, lang, i));

    return {
        ...base,
        ...p,
        id: p.id || base.id,
        lang,
        type: Object.hasOwn(TYPE_LABELS, p.type) ? p.type : 'fill',
        title: typeof p.title === 'string' ? p.title : base.title,
        codeBlocks: blocks,
    };
}

/* ═══════════════════════════════════════
   INITIAL STATE
═══════════════════════════════════════ */
const INIT_STATE = () => ({
    worksheetInfo: {
        title: '새 학습지',
        subject: '',
        grade: '',
        date: '',
        defaultLang: DEFAULT_LANG_ID,
    },
    problems: [],
    currentProblemId: null,
    viewMode: 'student',    // 'student' | 'answer'
    settings: {
        fontSize: 10,
        lineHeight: 1.6,
        layout: 'auto',
        codeTheme: 'light',
        margin: 15,
        answerLines: 2,
    },
    _pendingMask: null,    // { blockId, start, end }
});

/* ═══════════════════════════════════════
   STORE (pub/sub + reducer)
═══════════════════════════════════════ */
export const Store = (() => {
    let _state = INIT_STATE();
    const _subs = new Set();
    let _isDispatching = false;

    /* ── Publish ── */
    function _notify(action) {
        _subs.forEach(fn => fn(_state, action));
    }

    /* ── Reducer ── */
    function _reduce(state, action) {
        const s = state;

        switch (action.type) {

            /* ─── Worksheet ─── */
            case 'WS_SET_FIELD':
                return {...s, worksheetInfo: {...s.worksheetInfo, [action.field]: action.value}};

            case 'SET_VIEW_MODE':
                return {...s, viewMode: action.mode};

            case 'SET_SETTING':
                return {...s, settings: {...s.settings, [action.key]: action.value}};

            /* ─── Problems CRUD ─── */
            case 'ADD_PROBLEM': {
                const prob = makeProb(s.worksheetInfo.defaultLang || DEFAULT_LANG_ID);
                prob.codeBlocks.push(makeBlock(prob.lang, 1));
                return {...s, problems: [...s.problems, prob], currentProblemId: prob.id};
            }

            case 'SELECT_PROBLEM':
                return {...s, currentProblemId: action.id};

            case 'DELETE_PROBLEM': {
                const idx = s.problems.findIndex(p => p.id === action.id);
                if (idx === -1) return s;
                const probs = s.problems.filter(p => p.id !== action.id);
                let cur = s.currentProblemId;
                if (cur === action.id) {
                    cur = probs.length > 0 ? probs[Math.max(0, idx - 1)].id : null;
                }
                return {...s, problems: probs, currentProblemId: cur};
            }

            case 'DUPLICATE_PROBLEM': {
                const prob = s.problems.find(p => p.id === action.id);
                if (!prob) return s;
                const copy = JSON.parse(JSON.stringify(prob));
                copy.id = genId('prob');
                copy.title += ' (복사)';
                copy.codeBlocks = copy.codeBlocks.map(b => {
                    b.id = genId('block');
                    b.masks = b.masks.map(m => ({...m, id: genId('mask')}));
                    return b;
                });
                const idx = s.problems.findIndex(p => p.id === action.id);
                const next = [...s.problems];
                next.splice(idx + 1, 0, copy);
                return {...s, problems: next, currentProblemId: copy.id};
            }

            case 'UPDATE_PROBLEM': {
                const probs = s.problems.map(p =>
                    p.id === action.id ? {...p, [action.field]: action.value} : p
                );
                return {...s, problems: probs};
            }

            case 'REORDER_PROBLEMS': {
                if (action.from < 0 || action.from >= s.problems.length) return s;
                const next = [...s.problems];
                const [moved] = next.splice(action.from, 1);
                const to = Math.max(0, Math.min(action.to, next.length));
                next.splice(to, 0, moved);
                return {...s, problems: next};
            }

            /* ─── Code Blocks ─── */
            case 'ADD_BLOCK': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const nextNum = p.codeBlocks.length + 1;
                    return {...p, codeBlocks: [...p.codeBlocks, makeBlock(p.lang, nextNum)]};
                });
                return {...s, problems: probs};
            }

            case 'DELETE_BLOCK': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    if (p.codeBlocks.length <= 1) return p;
                    return {...p, codeBlocks: p.codeBlocks.filter(b => b.id !== action.blockId)};
                });
                return {...s, problems: probs};
            }

            case 'UPDATE_BLOCK': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const blocks = p.codeBlocks.map(b =>
                        b.id === action.blockId ? {...b, [action.field]: action.value, _maskError: null} : b
                    );
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            case 'UPDATE_BLOCK_CODE': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const blocks = p.codeBlocks.map(b => {
                        if (b.id !== action.blockId) return b;
                        // Trim masks that are now out of range
                        const code = (action.code || '').replace(/\r\n/g, '\n');
                        const masks = b.masks
                            .filter(m => m.start < code.length && m.end <= code.length)
                            .map(m => ({...m, text: code.slice(m.start, m.end)}));
                        return {...b, code, masks, _maskError: null};
                    });
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            case 'SET_BLOCK_MODE': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const blocks = p.codeBlocks.map(b =>
                        b.id === action.blockId ? {...b, editorMode: action.mode, _maskError: null} : b
                    );
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            case 'UPDATE_PROB_LANG': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.id) return p;
                    const blocks = p.codeBlocks.map(b => ({...b, lang: action.lang}));
                    return {...p, lang: action.lang, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            /* ─── Masks ─── */
            case 'ADD_MASK': {
                const {probId, blockId, start, end, maskType} = action;
                const probs = s.problems.map(p => {
                    if (p.id !== probId) return p;
                    const blocks = p.codeBlocks.map(b => {
                        if (b.id !== blockId) return b;
                        const s2 = Math.max(0, start);
                        const e2 = Math.min(end, b.code.length);
                        if (s2 >= e2) return b;
                        const text = b.code.slice(s2, e2);
                        if (!text.trim()) return b;
                        // Overlap check
                        const overlap = b.masks.some(m => !(e2 <= m.start || s2 >= m.end));
                        if (overlap) return {...b, _maskError: 'overlap'};
                        const mask = makeMask(blockId, s2, e2, maskType, text);
                        const masks = [...b.masks, mask].sort((a, b) => a.start - b.start);
                        return {...b, masks, _maskError: null};
                    });
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            case 'REMOVE_MASK': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const blocks = p.codeBlocks.map(b => {
                        if (b.id !== action.blockId) return b;
                        return {...b, masks: b.masks.filter(m => m.id !== action.maskId), _maskError: null};
                    });
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            /* ─── Pending mask selection ─── */
            case 'SET_PENDING_MASK':
                return {...s, _pendingMask: action.data};

            case 'CLEAR_PENDING_MASK':
                return {...s, _pendingMask: null};

            /* ─── Data ─── */
            case 'LOAD_STATE': {
                const loaded = action.data || {};
                const defaultState = INIT_STATE(); // 기본 골격 생성

                const defaultLang = loaded.worksheetInfo?.defaultLang || DEFAULT_LANG_ID;
                _pctr = 0;
                const safeProblems = (Array.isArray(loaded.problems) ? loaded.problems : [])
                    .map(p => normalizeProblem(p, defaultLang));

                /* 제목 카운터는 "몇 개인가"가 아니라 "몇 번까지 썼는가"다. 개수로
                 * 되돌리면 중간을 지우고 저장한 파일에서 '문제 3' 이 두 개가 된다. */
                _pctr = safeProblems.reduce((max, p) => {
                    const n = parseInt(String(p.title || '').match(/^문제 (\d+)$/)?.[1] ?? '0', 10);
                    return Math.max(max, n);
                }, safeProblems.length);

                const ids = new Set(safeProblems.map(p => p.id));
                return {
                    ...defaultState,
                    // 무분별한 spread(...loaded)를 제거하고 하위 속성들을 안전하게 병합
                    worksheetInfo: {...defaultState.worksheetInfo, ...(loaded.worksheetInfo || {})},
                    settings: {...defaultState.settings, ...(loaded.settings || {})},
                    viewMode: loaded.viewMode === 'answer' ? 'answer' : 'student',
                    problems: safeProblems,
                    currentProblemId: ids.has(loaded.currentProblemId)
                        ? loaded.currentProblemId
                        : (safeProblems[0]?.id ?? null),
                };
            }

            case 'RESET':
                _pctr = 0;
                return INIT_STATE();

            default:
                return s;
        }
    }

    return {
        get state() {
            return _state;
        },

        dispatch(action) {
            if (_isDispatching) return;
            _isDispatching = true;
            try {
                _state = _reduce(_state, action);
                _notify(action);
            } finally {
                // 구독자(렌더링) 측에서 에러가 발생하더라도 반드시 dispatch 상태를 해제함
                _isDispatching = false;
            }
        },

        subscribe(fn) {
            _subs.add(fn);
            return () => _subs.delete(fn);
        },

        /* Helpers */
        currentProb() {
            return _state.problems.find(p => p.id === _state.currentProblemId) || null;
        },

        getBlock(probId, blockId) {
            const prob = _state.problems.find(p => p.id === probId);
            return prob ? prob.codeBlocks.find(b => b.id === blockId) || null : null;
        },

        /* Serialise (strip runtime fields) */
        toJSON() {
            const {_pendingMask, ...clean} = _state;
            const problems = clean.problems.map(p => ({
                ...p,
                codeBlocks: p.codeBlocks.map(b => {
                    const {_monacoModel, _maskError, ...cb} = b;
                    return cb;
                })
            }));
            return {...clean, problems};
        },
    };
})();
