/* ═══════════════════════════════════════════════════════════
   store/state.js — Immutable State + Reducer
   Redux-style single source of truth
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── ID Generator ── */
const genId = (prefix) =>
    `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ── Counter Namespace ── */
let _pctr = 0, _mctr = 0;

/* ── TYPE LABELS ── */
const TYPE_LABELS = {
    fill: '빈칸 채우기',
    output: '출력 예측',
    error: '오류 찾기',
    order: '순서 맞추기',
};

/* ═══════════════════════════════════════
   FACTORIES
═══════════════════════════════════════ */
function makeProb() {
    _pctr++;
    return {
        id: genId('prob'),
        title: `문제 ${_pctr}`,
        type: 'fill',
        lang: 'c',
        description: '',
        hint: '',
        codeBlocks: [],
        answer: '',
    };
}

function makeBlock(lang = 'c', blockNum = 1) {
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
    _mctr++;
    return {id: genId('mask'), blockId, start, end, type, text};
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
const Store = (() => {
    let _state = INIT_STATE();
    const _subs = new Set();

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
                const prob = makeProb();
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
                const next = [...s.problems];
                const [moved] = next.splice(action.from, 1);
                next.splice(action.to, 0, moved);
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
                        b.id === action.blockId ? {...b, [action.field]: action.value} : b
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
                        const code = action.code;
                        const masks = b.masks.filter(m => m.start < code.length && m.end <= code.length);
                        return {...b, code, masks};
                    });
                    return {...p, codeBlocks: blocks};
                });
                return {...s, problems: probs};
            }

            case 'SET_BLOCK_MODE': {
                const probs = s.problems.map(p => {
                    if (p.id !== action.probId) return p;
                    const blocks = p.codeBlocks.map(b =>
                        b.id === action.blockId ? {...b, editorMode: action.mode} : b
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
                        return {...b, masks: b.masks.filter(m => m.id !== action.maskId)};
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
                const loaded = action.data;
                const safeProblems = (loaded.problems || []).map(p => ({
                    ...p,
                    codeBlocks: (p.codeBlocks || []).map(b => ({
                        ...b, masks: b.masks || [], highlightLines: b.highlightLines || []
                    }))
                }));
                _pctr = safeProblems.length;
                _mctr = safeProblems.reduce((s, p) => s + p.codeBlocks.reduce((s2, b) => s2 + b.masks.length, 0), 0);
                return {
                    ...INIT_STATE(),
                    ...loaded,
                    problems: safeProblems,
                    currentProblemId: loaded.currentProblemId || (safeProblems.length > 0 ? safeProblems[0].id : null),
                };
            }

            case 'RESET':
                _pctr = 0;
                _mctr = 0;
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
            _state = _reduce(_state, action);
            _notify(action);
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

/* ── HTML escape ── */
function esc(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
