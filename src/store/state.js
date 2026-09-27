/* ═══════════════════════════════════════════════════════════
   store/state.js — Immutable State + Reducer
   Redux-style single source of truth
═══════════════════════════════════════════════════════════ */

import {DEFAULT_LANG_ID, LANGUAGES} from '../languages.js';

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

/* 모르는 언어 id 는 기본값으로 접는다. LANG_MONACO_MAP 은 평범한 객체라
 * 'constructor' 같은 값이 함수를 꺼내 와 Monaco 에 언어 id 로 넘어간다. */
function validLang(lang, fallback) {
    return LANGUAGES.some(l => l.id === lang) ? lang : fallback;
}

/* id 는 dataset 을 거쳐 문자열로 되돌아온다. 숫자 id 를 그대로 두면 선택·삭제가
 * 헛돌고, 에디터 카드가 매 렌더마다 지워졌다 다시 만들어진다. 겹친 id 는
 * 뒤의 것이 영영 갱신되지 않으므로 새로 발급한다. */
function takeId(raw, prefix, seen) {
    const str = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw;
    const id = typeof str === 'string' && str && !seen.has(str) ? str : genId(prefix);
    seen.add(id);
    return id;
}

/* 설정은 인쇄 CSS 변수와 배열 길이로 곧장 쓰인다. 파일의 answerLines: 1e9 하나로
 * 인쇄 준비가 탭을 멈추므로, 입력 칸과 같은 범위로 잘라 둔다. [최소, 최대, 정수] */
const SETTING_RANGES = {
    fontSize: [8, 14, true],
    lineHeight: [1.2, 2.2, false],
    answerLines: [0, 8, true],
    margin: [5, 30, true],
};
const SETTING_CHOICES = {
    layout: ['auto', '1', '2'],
    codeTheme: ['light', 'github', 'minimal'],
};

function sanitizeSetting(key, value, fallback) {
    if (Object.hasOwn(SETTING_RANGES, key)) {
        const [min, max, int] = SETTING_RANGES[key];
        const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
        if (!Number.isFinite(n)) return fallback;
        const c = Math.min(max, Math.max(min, n));
        return int ? Math.round(c) : c;
    }
    if (Object.hasOwn(SETTING_CHOICES, key)) {
        const v = String(value);
        return SETTING_CHOICES[key].includes(v) ? v : fallback;
    }
    return value;
}

function sanitizeSettings(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return Object.fromEntries(Object.entries(defaults)
        .map(([k, d]) => [k, Object.hasOwn(src, k) ? sanitizeSetting(k, src[k], d) : d]));
}

/* CRLF 를 LF 로 접으면 코드가 줄마다 한 글자씩 짧아진다. 마스크는 문자
 * 오프셋이므로 같이 당겨 주지 않으면 가리는 자리가 통째로 밀린다. 세 줄짜리
 * 파일에서 정답의 첫 글자가 노출되고, 줄이 많으면 오프셋이 코드 밖으로 나가
 * 인쇄에서 마스크가 사라진다 - 답이 그대로 찍힌다는 뜻이다. */
function crlfShifter(rawCode) {
    return (off) => {
        /* \r 과 \n 사이에 떨어진 오프셋은 앞으로 내린다. 그대로 접으면 'a\r' 을
         * 가리던 마스크가 'a\n' 이 되어 줄바꿈까지 먹는다. */
        if (rawCode[off - 1] === '\r' && rawCode[off] === '\n') off--;
        return rawCode.slice(0, off).replace(/\r\n/g, '\n').length;
    };
}

function normalizeMasks(rawMasks, rawCode, code, blockId, seen) {
    const shift = crlfShifter(rawCode);
    let lastEnd = -1;
    return (Array.isArray(rawMasks) ? rawMasks : [])
        /* 음수 start 는 0 으로 당기지 않고 버린다 - 파일에 없던 마스크가 생긴다. */
        .filter(m => m && Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0)
        .map(m => ({...m, start: shift(m.start), end: shift(m.end)}))
        .filter(m => m.start < m.end && m.end <= code.length)
        .sort((a, b) => a.start - b.start)
        /* 겹친 마스크는 렌더러가 전제하지 않는 모양이다. _buildSegments 와
         * _renderLineMasks 둘 다 pos 를 되돌리지 않아 겹친 만큼 코드를 두 번
         * 출력한다. ADD_MASK 가 UI 에서 막는 불변식을 여기서도 세운다.
         * 비교 대상은 바로 앞 원소가 아니라 마지막으로 남긴 마스크다 -
         * [0,10) [2,3) [5,8) 에서 [5,8) 이 버려진 [2,3) 과만 비교되어 살아남았다. */
        .filter(m => {
            if (m.start < lastEnd) return false;
            lastEnd = m.end;
            return true;
        })
        .map(m => ({
            id: takeId(m.id, 'mask', seen),
            blockId,
            start: m.start,
            end: m.end,
            type: MASK_TYPES.includes(m.type) ? m.type : 'blank',
            /* text 는 저장 파일의 값을 믿지 않고 코드에서 다시 잘라 온다.
             * 어긋난 text 하나로 mapHtmlToRaw 의 줄 수 계산이 통째로 빗나간다. */
            text: code.slice(m.start, m.end),
        }));
}

/* ═══════════════════════════════════════
   편집에 따른 마스크 오프셋 이동

   마스크는 코드 문자열의 문자 오프셋으로 저장된다. 앞쪽에 한 줄만 넣어도
   뒤쪽 마스크가 전부 밀리는데, 예전에는 오프셋을 그대로 두고 text 만 새 코드에서
   다시 잘라 왔다. 그래서 가리는 대상이 경고 없이 다른 글자로 바뀌었다 -
   학생용 인쇄물에 답이 그대로 나오는 종류의 조용한 오염이다.

   이전 코드와 새 코드의 공통 접두/접미를 구하면 실제로 바뀐 구간이 하나 나온다.
   그 구간보다 앞이면 그대로, 뒤면 길이 차이만큼 민다. 구간에 걸친 마스크는
   사용자가 무엇을 의도했는지 알 수 없으므로 버린다 - 남겨 두면 엉뚱한 자리를
   가린 채로 굳는다.
═══════════════════════════════════════ */
function shiftMasksForEdit(masks, oldCode, newCode) {
    const maxLen = Math.min(oldCode.length, newCode.length);

    let head = 0;
    while (head < maxLen && oldCode[head] === newCode[head]) head++;

    let tail = 0;
    while (tail < maxLen - head
        && oldCode[oldCode.length - 1 - tail] === newCode[newCode.length - 1 - tail]) tail++;

    // 바뀐 구간은 oldCode[head, oldEnd) → newCode[head, newCode.length - tail)
    const oldEnd = oldCode.length - tail;
    const delta = newCode.length - oldCode.length;

    return masks
        .map(m => {
            if (m.end <= head) return m;                 // 편집 구간 앞 - 그대로
            if (m.start >= oldEnd) return {...m, start: m.start + delta, end: m.end + delta};
            return null;                                 // 편집 구간에 걸침 - 버린다
        })
        .filter(m => m && m.start >= 0 && m.start < m.end && m.end <= newCode.length)
        .map(m => ({...m, text: newCode.slice(m.start, m.end)}));
}

function normalizeBlock(rawBlock, probLang, idx, seen) {
    const b = rawBlock && typeof rawBlock === 'object' ? rawBlock : {};
    const lang = validLang(b.lang, probLang);
    const base = makeBlock(lang, idx + 1);
    const rawCode = typeof b.code === 'string' ? b.code : '';
    const code = rawCode.replace(/\r\n/g, '\n');
    const id = takeId(b.id, 'block', seen);

    return {
        ...base,
        ...b,
        id,
        lang,
        title: typeof b.title === 'string' ? b.title : base.title,
        code,
        masks: normalizeMasks(b.masks, rawCode, code, id, seen),
        highlightLines: (Array.isArray(b.highlightLines) ? b.highlightLines : [])
            .filter(n => Number.isInteger(n) && n > 0),
        /* 'edit' 이 아닌 값이면 가리기 모드로 열리므로, 모르는 값은 편집으로 접는다. */
        editorMode: b.editorMode === 'select' ? 'select' : 'edit',
        _maskError: null,
    };
}

function normalizeProblem(rawProb, defaultLang, seen) {
    const p = rawProb && typeof rawProb === 'object' ? rawProb : {};
    const lang = validLang(p.lang, defaultLang);
    const base = makeProb(lang);
    const id = takeId(p.id, 'prob', seen);
    const blocks = (Array.isArray(p.codeBlocks) ? p.codeBlocks : [])
        .map((b, i) => normalizeBlock(b, lang, i, seen));

    return {
        ...base,
        ...p,
        id,
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
    const _queue = [];

    /* 알림 한 바퀴 안에서 구독자가 다시 dispatch 하는 횟수의 상한.
     * 정상 흐름은 한두 번이면 끝난다. 이 수를 넘는다는 건 두 구독자가 서로를
     * 부르는 고리가 생겼다는 뜻이고, 그대로 두면 탭이 멈춘다. */
    const MAX_CASCADE = 100;

    /* ── Publish ── */
    function _notify(action) {
        _subs.forEach(fn => fn(_state, action));
    }

    /* 액션 하나를 실제로 적용한다. 구독자에서 예외가 나도 플래그는 반드시 푼다 -
     * 안 그러면 그 뒤의 모든 dispatch 가 큐에만 쌓이고 화면이 멈춘다. */
    function _apply(action) {
        _isDispatching = true;
        try {
            _state = _reduce(_state, action);
            _notify(action);
        } finally {
            _isDispatching = false;
        }
    }

    /* 문제 하나만 바꾼다. fn 이 받은 문제를 그대로 돌려주면 상태도 그대로다.
     * 바뀐 것이 없는데 새 상태 객체를 만들면 구독자가 화면 전체를 다시 그린다 -
     * 사이드바 HTML 재생성과 열려 있는 가리기 <pre> 재렌더가 매번 따라붙는다. */
    function updateProblem(s, probId, fn) {
        const pi = s.problems.findIndex(p => p.id === probId);
        if (pi === -1) return s;

        const next = fn(s.problems[pi]);
        if (next === s.problems[pi]) return s;

        const problems = [...s.problems];
        problems[pi] = next;
        return {...s, problems};
    }

    /* 위와 같은 규칙을 블록 하나에 적용한다. */
    function updateBlock(s, probId, blockId, fn) {
        return updateProblem(s, probId, prob => {
            const bi = prob.codeBlocks.findIndex(b => b.id === blockId);
            if (bi === -1) return prob;

            const next = fn(prob.codeBlocks[bi], prob);
            if (next === prob.codeBlocks[bi]) return prob;

            const codeBlocks = [...prob.codeBlocks];
            codeBlocks[bi] = next;
            return {...prob, codeBlocks};
        });
    }

    /* ── Reducer ── */
    function _reduce(state, action) {
        const s = state;

        switch (action.type) {

            /* ─── Worksheet ─── */
            case 'WS_SET_FIELD':
                return {...s, worksheetInfo: {...s.worksheetInfo, [action.field]: action.value}};

            case 'SET_VIEW_MODE':
                return s.viewMode === action.mode ? s : {...s, viewMode: action.mode};

            case 'SET_SETTING':
                return {...s, settings: {...s.settings, [action.key]: action.value}};

            /* ─── Problems CRUD ─── */
            case 'ADD_PROBLEM': {
                const prob = makeProb(s.worksheetInfo.defaultLang || DEFAULT_LANG_ID);
                prob.codeBlocks.push(makeBlock(prob.lang, 1));
                return {...s, problems: [...s.problems, prob], currentProblemId: prob.id};
            }

            case 'SELECT_PROBLEM':
                return s.currentProblemId === action.id ? s : {...s, currentProblemId: action.id};

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

            case 'UPDATE_PROBLEM':
                return updateProblem(s, action.id, p =>
                    p[action.field] === action.value ? p : {...p, [action.field]: action.value});

            case 'REORDER_PROBLEMS': {
                if (action.from < 0 || action.from >= s.problems.length) return s;
                const next = [...s.problems];
                const [moved] = next.splice(action.from, 1);
                const to = Math.max(0, Math.min(action.to, next.length));
                next.splice(to, 0, moved);
                return {...s, problems: next};
            }

            /* ─── Code Blocks ─── */
            case 'ADD_BLOCK':
                return updateProblem(s, action.probId, p => ({
                    ...p,
                    codeBlocks: [...p.codeBlocks, makeBlock(p.lang, p.codeBlocks.length + 1)],
                }));

            case 'DELETE_BLOCK':
                return updateProblem(s, action.probId, p => {
                    // 블록이 하나도 없는 문제는 만들지 않는다.
                    if (p.codeBlocks.length <= 1) return p;
                    const codeBlocks = p.codeBlocks.filter(b => b.id !== action.blockId);
                    return codeBlocks.length === p.codeBlocks.length ? p : {...p, codeBlocks};
                });

            case 'UPDATE_BLOCK':
                return updateBlock(s, action.probId, action.blockId, b =>
                    (b[action.field] === action.value && !b._maskError)
                        ? b
                        : {...b, [action.field]: action.value, _maskError: null});

            case 'UPDATE_BLOCK_CODE':
                return updateBlock(s, action.probId, action.blockId, b => {
                    /* CRLF 정규화는 여기서 유지한다. 코드가 상태로 들어오는
                     * 길목은 이 액션과 LOAD_STATE 둘뿐이고, 한 곳이라도
                     * 놓치면 오프셋이 줄마다 한 칸씩 밀린다. */
                    const code = (action.code || '').replace(/\r\n/g, '\n');
                    if (code === b.code) return b;
                    return {...b, code, masks: shiftMasksForEdit(b.masks, b.code, code), _maskError: null};
                });

            case 'SET_BLOCK_MODE':
                return updateBlock(s, action.probId, action.blockId, b =>
                    (b.editorMode === action.mode && !b._maskError)
                        ? b
                        : {...b, editorMode: action.mode, _maskError: null});

            case 'UPDATE_PROB_LANG':
                return updateProblem(s, action.id, p =>
                    p.lang === action.lang ? p : {
                        ...p,
                        lang: action.lang,
                        codeBlocks: p.codeBlocks.map(b => ({...b, lang: action.lang})),
                    });

            /* ─── Masks ─── */
            case 'ADD_MASK': {
                const {probId, blockId, start, end, maskType} = action;
                return updateBlock(s, probId, blockId, b => {
                    const s2 = Math.max(0, start);
                    const e2 = Math.min(end, b.code.length);
                    const text = b.code.slice(s2, e2);

                    /* 가릴 것이 없는 선택은 만들지 않는다. 예전에는 아무 표시도
                     * 남기지 않아서, 사용자에게는 팝업이 그냥 닫힌 것으로 보였다. */
                    if (s2 >= e2 || !text.trim()) {
                        return b._maskError === 'empty' ? b : {...b, _maskError: 'empty'};
                    }

                    const overlap = b.masks.some(m => !(e2 <= m.start || s2 >= m.end));
                    if (overlap) return b._maskError === 'overlap' ? b : {...b, _maskError: 'overlap'};

                    const mask = makeMask(blockId, s2, e2, maskType, text);
                    return {...b, masks: [...b.masks, mask].sort((x, y) => x.start - y.start), _maskError: null};
                });
            }

            case 'REMOVE_MASK':
                return updateBlock(s, action.probId, action.blockId, b => {
                    const masks = b.masks.filter(m => m.id !== action.maskId);
                    return (masks.length === b.masks.length && !b._maskError)
                        ? b
                        : {...b, masks, _maskError: null};
                });

            /* ─── Pending mask selection ─── */
            case 'SET_PENDING_MASK':
                return {...s, _pendingMask: action.data};

            case 'CLEAR_PENDING_MASK':
                return s._pendingMask === null ? s : {...s, _pendingMask: null};

            /* ─── Data ─── */
            case 'LOAD_STATE': {
                const loaded = action.data || {};
                const defaultState = INIT_STATE(); // 기본 골격 생성

                const rawInfo = loaded.worksheetInfo && typeof loaded.worksheetInfo === 'object'
                    ? loaded.worksheetInfo : {};
                const defaultLang = validLang(rawInfo.defaultLang, DEFAULT_LANG_ID);
                _pctr = 0;
                const seen = new Set();
                const safeProblems = (Array.isArray(loaded.problems) ? loaded.problems : [])
                    .map(p => normalizeProblem(p, defaultLang, seen));

                /* 제목 카운터는 "몇 개인가"가 아니라 "몇 번까지 썼는가"다. 개수로
                 * 되돌리면 중간을 지우고 저장한 파일에서 '문제 3' 이 두 개가 된다. */
                _pctr = safeProblems.reduce((max, p) => {
                    const n = parseInt(String(p.title || '').match(/^문제 (\d+)$/)?.[1] ?? '0', 10);
                    return Math.max(max, n);
                }, safeProblems.length);

                const ids = new Set(safeProblems.map(p => p.id));
                const curId = loaded.currentProblemId == null ? null : String(loaded.currentProblemId);
                return {
                    ...defaultState,
                    // 무분별한 spread(...loaded)를 제거하고 하위 속성들을 안전하게 병합
                    worksheetInfo: {...defaultState.worksheetInfo, ...rawInfo, defaultLang},
                    settings: sanitizeSettings(loaded.settings, defaultState.settings),
                    viewMode: loaded.viewMode === 'answer' ? 'answer' : 'student',
                    problems: safeProblems,
                    currentProblemId: ids.has(curId)
                        ? curId
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

        /* 구독자가 알림을 받는 도중에 다시 dispatch 하는 일이 있다. 렌더링이
         * Monaco 를 정리하면서 아직 스토어에 없는 코드를 밀어 넣는 경로가 그렇다.
         * 예전에는 그 액션을 조용히 버렸는데, 하필 그 자리가 사용자가 방금 친
         * 코드를 지키는 유일한 길이어서 편집 내용이 사라졌다. 버리지 않고 큐에
         * 담았다가 현재 알림이 끝난 뒤 순서대로 흘려보낸다.
         *
         * 큐를 비우는 동안에도 _isDispatching 은 액션 하나마다 켜졌다 꺼지므로
         * 리듀서가 재진입하지 않고, 재귀 대신 while 로 돌아 스택도 자라지 않는다. */
        dispatch(action) {
            if (_isDispatching) {
                _queue.push(action);
                return;
            }
            _apply(action);

            let cascade = 0;
            while (_queue.length) {
                if (++cascade > MAX_CASCADE) {
                    _queue.length = 0;
                    throw new Error('dispatch 가 알림 안에서 끝없이 이어진다 - 구독자에 고리가 있다');
                }
                _apply(_queue.shift());
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
