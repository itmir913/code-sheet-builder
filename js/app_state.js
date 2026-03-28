/* ============================================================
   2. APP STATE
   ============================================================ */

const AppState = {
    worksheetInfo: {
        title: '프로그래밍 기초 학습지',
        subject: '',
        grade: '',
        date: '',
        startPage: 1,
    },
    problems: [],
    currentProblemId: null,
    viewMode: 'student',   // 'student' | 'answer'
    settings: {
        fontSize: 10,        // pt
        lineHeight: 1.6,
        layout: 'auto',      // 'auto' | '1' | '2'
        codeTheme: 'light',
        margin: 15,          // mm
        answerLines: 4,
    },
    _pendingSelection: null, // { blockId, start, end, text }
};

let _problemCounter = 0;
let _blockCounter = 0;
let _maskCounter = 0;

/* ── ID generator ── */
function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ── Factories ── */
function createProblem() {
    _problemCounter++;
    return {
        id: newId('prob'),
        title: `문제 ${_problemCounter}`,
        type: 'fill',
        lang: 'c',
        description: '',
        hint: '',
        codeBlocks: [],
        answer: '',
        colSpan: 1, // 가로 기본 1칸
        rowSpan: 1, // 세로 기본 1행
    };
}

function createCodeBlock(lang = 'c') {
    _blockCounter++;
    return {
        id: newId('block'),
        title: `코드 블록 ${_blockCounter}`,
        lang,
        code: '',
        masks: [],
        highlightLines: [],
        editorMode: 'edit',
    };
}

function createMask(blockId, start, end, type, text) {
    _maskCounter++;
    return {id: newId('mask'), blockId, start, end, type, text};
}

/* ── Getters ── */
const getProblem = id => AppState.problems.find(p => p.id === id) || null;
const getBlock = (p, bid) => p ? p.codeBlocks.find(b => b.id === bid) : null;
const currentProb = () => getProblem(AppState.currentProblemId);

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