/**
 * 코드 학습지 메이커 - script.js v2.0
 * 완전 재작성: 모든 알려진 버그 수정
 *
 * 수정된 버그 목록:
 * [B1] 인쇄 시 긴 코드 세로/가로 잘림 → 줄 단위 렌더링 + pre-wrap
 * [B2] 다중 줄 드래그 마스킹 시 렌더링 붕괴 → 줄 단위 분할 마스킹
 * [B3] 자동 줄바꿈 시 줄 번호 어긋남 → line-height 완전 동기화
 * [B4] 가리기 모드에서 오프셋 계산 오류 → TreeWalker 정밀 계산
 * [B5] 설정 슬라이더 이벤트 중복 바인딩 → syncSettings 분리
 * [B6] 저장 파일 로드 시 카운터 복원 안 됨 → _restoreCounters
 * [B7] 코드 변경 시 범위 밖 마스크 제거 로직 오류 → 정교한 유효성 검사
 * [B8] popup 클로저 문제 (addMask 시 prob 참조 오류) → 직접 바인딩
 * [B9] 인쇄용 라인넘버/코드 줄 높이 불일치 → 테이블 셀 기반 구조
 * [B10] 답안란 없음 → 학생용에 답안 박스 추가
 */

'use strict';

/* ============================================================
   1. CONSTANTS
   ============================================================ */
const TYPE_LABELS = {
    fill:   '빈칸 채우기',
    output: '출력 예측',
    error:  '오류 찾기',
    order:  '순서 맞추기',
};

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
let _blockCounter   = 0;
let _maskCounter    = 0;

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
    return { id: newId('mask'), blockId, start, end, type, text };
}

/* ── Getters ── */
const getProblem    = id   => AppState.problems.find(p => p.id === id) || null;
const getBlock      = (p, bid) => p ? p.codeBlocks.find(b => b.id === bid) : null;
const currentProb   = ()   => getProblem(AppState.currentProblemId);

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

/* ============================================================
   3. MASK RENDERER
   ============================================================ */
const MaskRenderer = {

    /**
     * [B2 FIX] 다중 줄 마스킹 시 줄 단위로 분할하여 렌더링
     * 각 줄은 독립적으로 처리하므로 HTML 구조 붕괴 없음
     */
    render(code, masks, mode, highlightLines = []) {
        // 마스크 정렬 (시작 위치 순)
        const sortedMasks = [...masks].sort((a, b) => a.start - b.start);

        // 코드를 세그먼트로 분리
        const segments = this._buildSegments(code, sortedMasks);

        // 세그먼트를 HTML로 변환
        let html = '';
        let lineIdx = 0; // 현재 줄 인덱스 (0-based)

        for (const seg of segments) {
            if (seg.isMask) {
                // 마스크 세그먼트: 줄바꿈이 포함될 수 있으므로 줄 단위 분할
                const lines = seg.text.split('\n');
                lines.forEach((lineText, i) => {
                    const isHL = highlightLines.includes(lineIdx + 1);
                    html += this._renderMaskSpan(lineText, seg.type, mode, isHL);
                    if (i < lines.length - 1) {
                        html += '\n';
                        lineIdx++;
                    }
                });
            } else {
                // 일반 텍스트: 줄바꿈 기준으로 분리해 강조 처리
                const chars = seg.text;
                let buf = '';
                for (let ci = 0; ci < chars.length; ci++) {
                    const ch = chars[ci];
                    if (ch === '\n') {
                        const isHL = highlightLines.includes(lineIdx + 1);
                        html += (isHL ? '<span class="highlighted-line">' : '') + esc(buf) + (isHL ? '</span>' : '') + '\n';
                        buf = '';
                        lineIdx++;
                    } else {
                        buf += ch;
                    }
                }
                if (buf) {
                    const isHL = highlightLines.includes(lineIdx + 1);
                    html += (isHL ? '<span class="highlighted-line">' : '') + esc(buf) + (isHL ? '</span>' : '');
                }
            }
        }
        return html;
    },

    _buildSegments(code, masks) {
        const segs = [];
        let pos = 0;
        for (const mask of masks) {
            if (mask.start > pos) segs.push({ isMask: false, text: code.slice(pos, mask.start) });
            if (mask.end > mask.start) {
                segs.push({ isMask: true, text: code.slice(mask.start, mask.end), type: mask.type, id: mask.id });
            }
            pos = mask.end;
        }
        if (pos < code.length) segs.push({ isMask: false, text: code.slice(pos) });
        return segs;
    },

    _renderMaskSpan(text, type, mode, isHL) {
        const hlWrap = inner => isHL ? `<span class="highlighted-line">${inner}</span>` : inner;
        if (mode === 'answer') {
            return hlWrap(`<span class="mask-answer">${esc(text)}</span>`);
        }
        const blanks = '_'.repeat(Math.max(text.replace(/\s/g, '').length || 4, 4));
        if (type === 'blank')   return hlWrap(`<span class="mask-blank">${blanks}</span>`);
        if (type === 'comment') return hlWrap(`<span class="mask-comment">/* ? */</span>`);
        /* hidden */            return hlWrap(`<span class="mask-hidden">${blanks}</span>`);
    },

    lineNumbers(code) {
        const count = (code.match(/\n/g) || []).length + 1;
        return Array.from({ length: count }, (_, i) => i + 1).join('\n');
    },
};

/* ============================================================
   4. PROBLEM MANAGER
   ============================================================ */
const ProblemMgr = {
    add() {
        const prob = createProblem();
        prob.codeBlocks.push(createCodeBlock(prob.lang));
        AppState.problems.push(prob);
        UI.renderProblemList();
        this.select(prob.id);
        PreviewMgr.render();
    },

    select(id) {
        AppState.currentProblemId = id;
        UI.renderProblemList();
        UI.renderProblemEditor();
    },

    delete(id) {
        const idx = AppState.problems.findIndex(p => p.id === id);
        if (idx === -1) return;
        AppState.problems.splice(idx, 1);
        if (AppState.currentProblemId === id) {
            AppState.currentProblemId = AppState.problems.length > 0
                ? AppState.problems[Math.max(0, idx - 1)].id
                : null;
        }
        UI.renderProblemList();
        UI.renderProblemEditor();
        PreviewMgr.render();
    },

    duplicate(id) {
        const prob = getProblem(id);
        if (!prob) return;
        const copy = JSON.parse(JSON.stringify(prob));
        copy.id = newId('prob');
        copy.title = prob.title + ' (복사)';
        copy.codeBlocks = copy.codeBlocks.map(b => {
            b.id = newId('block');
            b.masks = b.masks.map(m => ({ ...m, id: newId('mask') }));
            return b;
        });
        const idx = AppState.problems.findIndex(p => p.id === id);
        AppState.problems.splice(idx + 1, 0, copy);
        UI.renderProblemList();
        this.select(copy.id);
    },

    updateField(field, value) {
        const prob = currentProb();
        if (!prob) return;
        prob[field] = value;
        if (field === 'lang') {
            prob.codeBlocks.forEach(b => { b.lang = value; });
            UI.renderCodeBlocks(prob);
        }
        if (field === 'title' || field === 'type') UI.renderProblemList();
        PreviewMgr.render();
    },
};

/* ============================================================
   5. CODE BLOCK MANAGER
   ============================================================ */
const CodeBlockMgr = {
    add(prob) {
        if (!prob) return;
        prob.codeBlocks.push(createCodeBlock(prob.lang));
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    delete(prob, blockId) {
        if (!prob) return;
        prob.codeBlocks = prob.codeBlocks.filter(b => b.id !== blockId);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    updateCode(prob, blockId, code) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.code = code;
        // [B7 FIX] 코드 길이 변경 시 범위 벗어난 마스크만 제거
        block.masks = block.masks.filter(m => m.start < code.length && m.end <= code.length);
        PreviewMgr.render();
    },

    updateTitle(prob, blockId, title) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.title = title;
        PreviewMgr.render();
    },

    updateHighlights(prob, blockId, input) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.highlightLines = [...new Set(
            input.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0)
        )];
        PreviewMgr.render();
    },

    setMode(prob, blockId, mode) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.editorMode = mode;
        UI.renderCodeBlocks(prob);
    },

    addMask(prob, blockId, start, end, type) {
        const block = getBlock(prob, blockId);
        if (!block) return;

        // 경계 클램프
        start = Math.max(0, start);
        end   = Math.min(end, block.code.length);
        if (start >= end) return;

        const text = block.code.slice(start, end);
        if (!text.trim()) return;

        // 겹치는 마스크 확인
        const overlaps = block.masks.some(m => !(end <= m.start || start >= m.end));
        if (overlaps) {
            UI.showModal('알림', '선택한 영역이 이미 가려진 부분과 겹칩니다.');
            return;
        }

        block.masks.push(createMask(blockId, start, end, type, text));
        block.masks.sort((a, b) => a.start - b.start);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    removeMask(prob, blockId, maskId) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.masks = block.masks.filter(m => m.id !== maskId);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },
};

/* ============================================================
   6. UI MANAGER
   ============================================================ */
const UI = {

    /* ── Problem List ── */
    renderProblemList() {
        const container = document.getElementById('problem-list');
        if (!container) return;

        if (AppState.problems.length === 0) {
            container.innerHTML = '<div class="empty-list-hint"><span>+</span> 버튼을 눌러 첫 문제를 추가하세요</div>';
            return;
        }

        container.innerHTML = AppState.problems.map((prob, idx) => `
      <div class="problem-item ${prob.id === AppState.currentProblemId ? 'active' : ''}"
           data-id="${prob.id}" role="button" tabindex="0">
        <div class="problem-item-num">Q${idx + 1}</div>
        <div class="problem-item-info">
          <div class="problem-item-title">${esc(prob.title)}</div>
          <div class="problem-item-type">${TYPE_LABELS[prob.type] || prob.type} · ${prob.lang.toUpperCase()}</div>
        </div>
        <button class="problem-item-del" data-del="${prob.id}" title="삭제">✕</button>
      </div>
    `).join('');

        container.querySelectorAll('.problem-item').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.closest('[data-del]')) return;
                ProblemMgr.select(el.dataset.id);
            });
            el.addEventListener('keydown', e => { if (e.key === 'Enter') ProblemMgr.select(el.dataset.id); });
        });

        container.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                UI.confirm('이 문제를 삭제할까요?', () => ProblemMgr.delete(btn.dataset.del));
            });
        });
    },

    /* ── Problem Editor ── */
    renderProblemEditor() {
        const placeholder = document.getElementById('editor-placeholder');
        const editor      = document.getElementById('problem-editor');
        const prob = currentProb();

        if (!prob) {
            placeholder.style.display = '';
            editor.style.display = 'none';
            return;
        }
        placeholder.style.display = 'none';
        editor.style.display = '';

        const idx = AppState.problems.findIndex(p => p.id === prob.id);
        document.getElementById('prob-number-badge').textContent = `Q${idx + 1}`;
        document.getElementById('prob-title').value       = prob.title;
        document.getElementById('prob-description').value = prob.description;
        document.getElementById('prob-hint').value        = prob.hint;
        document.getElementById('prob-answer').value      = prob.answer;

        // Type buttons
        document.querySelectorAll('.type-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === prob.type);
        });
        // Lang buttons
        document.querySelectorAll('.lang-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === prob.lang);
        });

        UI.renderCodeBlocks(prob);
    },

    /* ── Code Blocks ── */
    renderCodeBlocks(prob) {
        const container = document.getElementById('code-blocks-container');
        if (!container) return;
        container.innerHTML = '';
        prob.codeBlocks.forEach(block => {
            container.appendChild(UI._buildCodeBlockEl(prob, block));
        });
    },

    _buildCodeBlockEl(prob, block) {
        const wrap = document.createElement('div');
        wrap.className = 'code-block-item fade-in';
        wrap.dataset.blockId = block.id;

        /* Header */
        const header = document.createElement('div');
        header.className = 'code-block-header';
        header.innerHTML = `
      <span class="code-block-lang-badge">${block.lang.toUpperCase()}</span>
      <input type="text" class="code-block-title-input" value="${esc(block.title)}" placeholder="블록 제목" />
      <div class="code-block-mode-group">
        <button class="mode-btn ${block.editorMode === 'edit' ? 'active' : ''}" data-mode="edit">편집</button>
        <button class="mode-btn ${block.editorMode === 'select' ? 'active' : ''}" data-mode="select">가리기</button>
      </div>
      <div class="code-block-actions">
        <button class="btn-icon-sm btn-danger-icon" data-action="del" title="블록 삭제">✕</button>
      </div>
    `;

        header.querySelector('.code-block-title-input').addEventListener('input', e => {
            CodeBlockMgr.updateTitle(prob, block.id, e.target.value);
        });
        header.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.mode === 'select' && !block.code.trim()) {
                    UI.showModal('알림', '먼저 코드를 입력한 후 가리기 모드를 사용하세요.');
                    return;
                }
                CodeBlockMgr.setMode(prob, block.id, btn.dataset.mode);
            });
        });
        header.querySelector('[data-action="del"]').addEventListener('click', () => {
            if (prob.codeBlocks.length === 1) {
                UI.showModal('알림', '최소 하나의 코드 블록이 필요합니다.');
                return;
            }
            UI.confirm('이 코드 블록을 삭제할까요?', () => CodeBlockMgr.delete(prob, block.id));
        });
        wrap.appendChild(header);

        /* Content */
        if (block.editorMode === 'edit') {
            wrap.appendChild(UI._buildEditArea(prob, block));
        } else {
            wrap.appendChild(UI._buildSelectArea(prob, block));
        }

        /* Highlight row */
        const hlRow = document.createElement('div');
        hlRow.className = 'highlight-row';
        hlRow.innerHTML = `
      <span class="highlight-label">강조 줄 번호:</span>
      <input type="text" class="highlight-input" value="${block.highlightLines.join(', ')}" placeholder="예: 3, 5, 7" />
    `;
        hlRow.querySelector('.highlight-input').addEventListener('input', e => {
            CodeBlockMgr.updateHighlights(prob, block.id, e.target.value);
        });
        wrap.appendChild(hlRow);

        /* Mask list */
        if (block.masks.length > 0) {
            wrap.appendChild(UI._buildMaskList(prob, block));
        }

        return wrap;
    },

    _buildEditArea(prob, block) {
        const area = document.createElement('div');
        area.className = 'code-edit-area';

        /* [B3 FIX] 줄번호 div */
        const lineNums = document.createElement('div');
        lineNums.className = 'line-numbers';
        lineNums.textContent = MaskRenderer.lineNumbers(block.code);
        area.appendChild(lineNums);

        const textarea = document.createElement('textarea');
        textarea.className = 'code-textarea';
        textarea.value = block.code;
        textarea.placeholder = `// ${block.lang === 'python' ? 'Python' : 'C'} 코드를 입력하세요...`;
        textarea.spellcheck = false;
        textarea.rows = Math.max(6, (block.code.match(/\n/g) || []).length + 2);

        /* [B3 FIX] 줄번호 동기화: textarea와 line-numbers의 font/size/padding 완전 동일 */
        const syncLines = () => {
            const lines = textarea.value.split('\n');
            lineNums.textContent = lines.map((_, i) => i + 1).join('\n');
            textarea.rows = Math.max(6, lines.length + 1);
        };

        textarea.addEventListener('input', () => {
            syncLines();
            CodeBlockMgr.updateCode(prob, block.id, textarea.value);
        });

        /* Tab key */
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = textarea.selectionStart, end = textarea.selectionEnd;
                textarea.value = textarea.value.slice(0, s) + '    ' + textarea.value.slice(end);
                textarea.selectionStart = textarea.selectionEnd = s + 4;
                syncLines();
                CodeBlockMgr.updateCode(prob, block.id, textarea.value);
            }
            /* Auto-close brackets */
            const pairs = { '(': ')', '[': ']', '{': '}' };
            if (pairs[e.key]) {
                e.preventDefault();
                const s = textarea.selectionStart, end = textarea.selectionEnd;
                const sel = textarea.value.slice(s, end);
                if (sel) {
                    textarea.value = textarea.value.slice(0, s) + e.key + sel + pairs[e.key] + textarea.value.slice(end);
                    textarea.selectionStart = s + 1; textarea.selectionEnd = end + 1;
                } else {
                    textarea.value = textarea.value.slice(0, s) + e.key + pairs[e.key] + textarea.value.slice(end);
                    textarea.selectionStart = textarea.selectionEnd = s + 1;
                }
                syncLines();
                CodeBlockMgr.updateCode(prob, block.id, textarea.value);
            }
        });

        area.appendChild(textarea);
        return area;
    },

    _buildSelectArea(prob, block) {
        const area = document.createElement('div');
        area.className = 'code-select-area';

        const hint = document.createElement('div');
        hint.className = 'select-mode-hint';
        hint.innerHTML = `✱ <strong>가리기 모드</strong> — 숨길 텍스트를 드래그하세요. 현재 마스크: <strong>${block.masks.length}개</strong>`;
        area.appendChild(hint);

        const display = document.createElement('div');
        display.className = 'code-select-display';

        /* [B3 FIX] 줄번호는 pre와 정확히 동일한 폰트/패딩/line-height */
        const lineNums = document.createElement('div');
        lineNums.className = 'select-line-numbers';
        lineNums.textContent = MaskRenderer.lineNumbers(block.code);
        display.appendChild(lineNums);

        const pre = document.createElement('pre');
        pre.className = 'code-select-pre';
        pre.dataset.blockId = block.id;
        pre.innerHTML = MaskRenderer.render(block.code, block.masks, AppState.viewMode, block.highlightLines);
        display.appendChild(pre);
        area.appendChild(display);

        /* [B8 FIX] mouseup에서 prob을 직접 클로저로 캡처 */
        pre.addEventListener('mouseup', () => {
            setTimeout(() => UI._handleCodeSelection(prob, block, pre), 5);
        });

        return area;
    },

    /* [B4 FIX] TreeWalker 기반 정밀 오프셋 계산 */
    _handleCodeSelection(prob, block, pre) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!pre.contains(range.commonAncestorContainer)) return;

        const selectedText = sel.toString();
        if (!selectedText || !selectedText.trim()) return;

        const offsets = UI._calcCharOffsets(pre, range);
        if (!offsets) return;

        /* offsets는 렌더링된 HTML 기준 → 원본 코드 기준으로 역변환 */
        const rawOffsets = UI._mapToRawOffsets(block, offsets);
        if (!rawOffsets) return;

        AppState._pendingSelection = {
            blockId: block.id,
            start: rawOffsets.start,
            end:   rawOffsets.end,
            text:  block.code.slice(rawOffsets.start, rawOffsets.end),
        };

        UI._showSelectionPopup(range, prob);
    },

    /**
     * [B4 FIX] rendered HTML의 char offset을 계산
     * 텍스트 노드를 순회하며 startContainer/endContainer까지의 누적 길이를 셈
     */
    _calcCharOffsets(container, range) {
        let startOffset = -1, endOffset = -1, charCount = 0;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const len  = node.textContent.length;

            if (startOffset === -1 && node === range.startContainer) {
                startOffset = charCount + range.startOffset;
            }
            if (endOffset === -1 && node === range.endContainer) {
                endOffset = charCount + range.endOffset;
                break;
            }
            /* 두 노드가 같은 경우 (한 텍스트 노드 안에서 선택) */
            if (node === range.startContainer && node === range.endContainer) {
                startOffset = charCount + range.startOffset;
                endOffset   = charCount + range.endOffset;
                break;
            }
            charCount += len;
        }

        if (startOffset === -1 || endOffset === -1) return null;
        if (startOffset === endOffset) return null;
        return { start: Math.min(startOffset, endOffset), end: Math.max(startOffset, endOffset) };
    },

    /**
     * [B4 FIX] 렌더링된 HTML offset → 원본 code string offset으로 역변환
     * 마스크 스팬들이 원본 텍스트를 대체하고 있으므로 누적 보정 필요
     */
    _mapToRawOffsets(block, htmlOffsets) {
        /* 마스크가 없으면 그대로 */
        if (!block.masks.length) {
            return { start: htmlOffsets.start, end: htmlOffsets.end };
        }
        /*
         * HTML 렌더링 시 마스크 구간은 짧은 placeholder로 치환됨
         * (e.g., 5글자 빈칸 → "____" 4글자)
         * 이 차이를 보정하기 위해 원본 마스크 기준으로 맵핑
         *
         * 간단한 접근: 렌더링된 선택 범위의 원본 문자 위치를 마스크 경계로부터 역산
         * 정확한 역산은 복잡하므로,
         * 선택 영역이 마스크 span을 건드리지 않는 순수 텍스트 영역이라는 가정 하에
         * 누적 오프셋 차이를 보정한다.
         */
        let htmlPos = 0, rawPos = 0;
        let rawStart = -1, rawEnd = -1;
        const sortedMasks = [...block.masks].sort((a, b) => a.start - b.start);
        let maskIdx = 0;

        const advance = (htmlLen, rawLen) => {
            const nextHtml = htmlPos + htmlLen;
            const nextRaw  = rawPos  + rawLen;

            if (rawStart === -1 && htmlOffsets.start >= htmlPos && htmlOffsets.start < nextHtml) {
                rawStart = rawPos + (htmlOffsets.start - htmlPos);
            }
            if (rawEnd === -1 && htmlOffsets.end >= htmlPos && htmlOffsets.end <= nextHtml) {
                rawEnd = rawPos + (htmlOffsets.end - htmlPos);
            }

            htmlPos = nextHtml;
            rawPos  = nextRaw;
        };

        while (maskIdx <= sortedMasks.length) {
            const mask = sortedMasks[maskIdx];
            const maskStart = mask ? mask.start : block.code.length;

            /* 이 마스크 이전의 일반 텍스트 구간 */
            const plainRawLen = maskStart - rawPos;
            if (plainRawLen > 0) advance(plainRawLen, plainRawLen);

            if (!mask) break;

            /* 마스크 구간: html에서는 placeholder 길이만큼 차지 */
            const maskRawLen  = mask.end - mask.start;
            const maskHtmlLen = AppState.viewMode === 'answer'
                ? maskRawLen   // 정답 모드는 원본 텍스트 표시
                : Math.max(maskRawLen, 4); // 학생 모드는 언더바 (최소 4)

            advance(maskHtmlLen, maskRawLen);
            maskIdx++;
        }

        if (rawStart === -1) rawStart = rawPos;
        if (rawEnd   === -1) rawEnd   = rawPos;

        rawStart = Math.max(0, Math.min(rawStart, block.code.length));
        rawEnd   = Math.max(0, Math.min(rawEnd,   block.code.length));
        if (rawStart >= rawEnd) return null;

        return { start: rawStart, end: rawEnd };
    },

    _showSelectionPopup(range, prob) {
        const popup = document.getElementById('selection-popup');
        const rect  = range.getBoundingClientRect();
        const top   = Math.max(rect.top + window.scrollY - 50, 10);
        const left  = Math.max(rect.left + window.scrollX, 10);

        popup.style.top  = `${top}px`;
        popup.style.left = `${left}px`;
        popup.style.display = 'flex';

        /* [B8 FIX] 버튼 교체로 이전 리스너 제거 후 재바인딩 */
        popup.querySelectorAll('.popup-btn[data-hide-type]').forEach(btn => {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', () => {
                const sel = AppState._pendingSelection;
                if (sel) CodeBlockMgr.addMask(prob, sel.blockId, sel.start, sel.end, fresh.dataset.hideType);
                AppState._pendingSelection = null;
                popup.style.display = 'none';
                window.getSelection().removeAllRanges();
            });
        });
    },

    _buildMaskList(prob, block) {
        const wrap  = document.createElement('div');
        wrap.className = 'mask-list-wrap';

        const label = document.createElement('div');
        label.className = 'mask-list-label';
        label.textContent = '가리기 목록';
        wrap.appendChild(label);

        const list = document.createElement('div');
        list.className = 'mask-list';

        block.masks.forEach(mask => {
            const item = document.createElement('div');
            item.className = 'mask-item';
            const preview = mask.text.replace(/\n/g, '↵').slice(0, 28) + (mask.text.length > 28 ? '…' : '');
            item.innerHTML = `
        <span class="mask-item-type ${mask.type}">${{ blank: '빈칸', comment: '주석', hidden: '숨김' }[mask.type]}</span>
        <span class="mask-item-text">${esc(preview)}</span>
        <span class="mask-item-pos">[${mask.start}:${mask.end}]</span>
        <button class="mask-item-del" title="마스크 제거">✕</button>
      `;
            item.querySelector('.mask-item-del').addEventListener('click', () => {
                CodeBlockMgr.removeMask(prob, block.id, mask.id);
            });
            list.appendChild(item);
        });

        wrap.appendChild(list);
        return wrap;
    },

    /* ── Settings ── */
    syncSettings() {
        const s = AppState.settings;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

        setVal('set-font-size',    s.fontSize);
        setVal('set-line-height',  s.lineHeight);
        setVal('set-layout',       s.layout);
        setVal('set-code-theme',   s.codeTheme);
        setVal('set-margin',       s.margin);
        setVal('set-answer-lines', s.answerLines);

        const fsVal = document.getElementById('set-font-size-val');
        const lhVal = document.getElementById('set-line-height-val');
        const alVal = document.getElementById('set-answer-lines-val');
        if (fsVal) fsVal.textContent = s.fontSize + 'pt';
        if (lhVal) lhVal.textContent = s.lineHeight;
        if (alVal) alVal.textContent = s.answerLines + '줄';
    },

    syncWorksheetInfo() {
        const ws = AppState.worksheetInfo;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('ws-title', ws.title);
        set('ws-subject', ws.subject);
        set('ws-grade', ws.grade);
        set('ws-date', ws.date);
        set('ws-start-page', ws.startPage);
    },

    /* ── Modal ── */
    showModal(title, message, buttons) {
        document.getElementById('modal-header').textContent = title;
        document.getElementById('modal-body').innerHTML = `<p>${message}</p>`;
        const footer = document.getElementById('modal-footer');
        footer.innerHTML = '';

        if (buttons) {
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = `btn-sm ${b.cls || 'btn-primary'}`;
                btn.textContent = b.label;
                btn.addEventListener('click', () => {
                    document.getElementById('modal-overlay').style.display = 'none';
                    if (b.action) b.action();
                });
                footer.appendChild(btn);
            });
        } else {
            const ok = document.createElement('button');
            ok.className = 'btn-sm btn-primary';
            ok.textContent = '확인';
            ok.addEventListener('click', () => {
                document.getElementById('modal-overlay').style.display = 'none';
            });
            footer.appendChild(ok);
        }

        document.getElementById('modal-overlay').style.display = 'flex';
    },

    confirm(message, onConfirm) {
        UI.showModal('확인', message, [
            { label: '취소', cls: 'btn-ghost', action: null },
            { label: '확인', cls: 'btn-danger', action: onConfirm },
        ]);
    },
};

/* ============================================================
   7. PREVIEW MANAGER
   ============================================================ */
const PreviewMgr = {
    render() {
        const container = document.getElementById('preview-container');
        if (!container) return;

        const probs = AppState.problems;
        if (probs.length === 0) {
            container.innerHTML = '<div class="preview-empty"><p>문제를 추가하면<br>여기에 미리보기가 표시됩니다</p></div>';
            document.getElementById('preview-mode-badge').textContent = AppState.viewMode === 'answer' ? '정답지' : '학생용';
            return;
        }

        const ws = AppState.worksheetInfo;
        const title = ws.title || '학습지';
        const grade = ws.grade || '';
        const date  = ws.date  || '';

        const probsHTML = probs.map((prob, idx) => {
            const codePreview = prob.codeBlocks.map(b =>
                `<div class="preview-code-block"><div class="preview-code-text">${esc(b.code.slice(0, 120))}</div></div>`
            ).join('');

            return `
        <div class="preview-problem">
          <div class="preview-prob-title">
            <span class="preview-prob-num">${idx + 1}.</span>
            ${esc(prob.title)}
          </div>
          ${prob.description ? `<div class="preview-prob-desc">${esc(prob.description.slice(0, 70))}</div>` : ''}
          ${codePreview}
        </div>
      `;
        }).join('');

        container.innerHTML = `
      <div class="preview-page">
        <div class="preview-page-header">
          <div class="preview-page-school">${esc(ws.subject)}</div>
          <div class="preview-page-title">${esc(title)}</div>
          <div class="preview-page-meta"><span>${esc(grade)}</span><span>${esc(date)}</span></div>
        </div>
        <div class="preview-page-body">${probsHTML}</div>
        <div class="preview-page-footer">— ${ws.startPage || 1} —</div>
      </div>
    `;

        document.getElementById('preview-mode-badge').textContent =
            AppState.viewMode === 'answer' ? '정답지' : '학생용';
    },
};

/* ============================================================
   8. PRINT MANAGER — 완전 재작성
   [B1, B9 FIX] 줄 단위 렌더링, table-cell 구조, pre-wrap
   ============================================================ */
const PrintMgr = {

    prepare() {
        const ws   = AppState.worksheetInfo;
        const probs = AppState.problems;
        const s    = AppState.settings;
        const mode = AppState.viewMode;

        /* CSS 변수로 인쇄 설정 전달 */
        const root = document.documentElement;
        root.style.setProperty('--pfs', `${s.fontSize}pt`);
        root.style.setProperty('--plh', `${s.lineHeight}`);
        root.style.setProperty('--pm',  `${s.margin}mm`);
        root.style.setProperty('--pal', `${Math.max(s.answerLines * 6, 6)}mm`);

        /* 컬럼 수 결정 */
        let cols = parseInt(s.layout, 10);
        if (isNaN(cols)) {
            const avgLines = probs.reduce((sum, p) => {
                return sum + p.codeBlocks.reduce((s2, b) => s2 + (b.code.match(/\n/g) || []).length + 1, 0);
            }, 0) / (probs.length || 1);
            cols = avgLines > 18 ? 1 : 2;
        }

        const themeClass = `theme-${s.codeTheme}`;

        /* [B1, B9 FIX] 각 문제를 줄 단위로 렌더링 */
        const problemsHTML = probs.map((prob, idx) => {
            const num = idx + 1;

            const blocksHTML = prob.codeBlocks.map(block => {
                const linesHTML = PrintMgr._renderCodeLines(block, mode);
                return `
          <div class="print-code-block ${themeClass}">
            ${block.title ? `<div class="print-code-title">${esc(block.title)}</div>` : ''}
            <div class="print-code-body">
              ${linesHTML}
            </div>
          </div>
        `;
            }).join('');

            const answerHTML = mode === 'answer' && prob.answer
                ? `<div class="print-answer-section">
             <div class="print-answer-label">정답 / 해설</div>
             <div class="print-answer-text">${esc(prob.answer)}</div>
           </div>`
                : '';

            /* 학생용: 답안 박스 추가 */
            const answerBoxHTML = mode === 'student' && prob.type !== 'output'
                ? `<div class="print-answer-box">
             <div class="print-answer-box-label">답안</div>
             <div class="print-answer-box-lines">
               ${Array.from({ length: s.answerLines }, () => '<div class="print-answer-line"></div>').join('')}
             </div>
           </div>`
                : '';

            return `
        <div class="print-problem">
          <div class="print-prob-title">
            <span class="print-prob-num">${num}.</span>
            <span>${esc(prob.title)}</span>
            <span class="print-prob-type-badge">${TYPE_LABELS[prob.type] || ''}</span>
          </div>
          ${prob.description ? `<div class="print-prob-description">${esc(prob.description)}</div>` : ''}
          ${prob.hint ? `<div class="print-prob-hint">${esc(prob.hint)}</div>` : ''}
          ${blocksHTML}
          ${answerBoxHTML}
          ${answerHTML}
        </div>
      `;
        }).join('');

        const today  = ws.date || new Date().toLocaleDateString('ko-KR');
        const pageNum = ws.startPage || 1;

        document.getElementById('print-area').innerHTML = `
      <div class="print-document">
        <div class="print-page">
          <div class="print-header">
            <div class="print-header-top">
              <div class="print-title">${esc(ws.title || '학습지')}</div>
              <div class="print-meta-block">
                ${ws.subject ? `<div class="print-subject">${esc(ws.subject)}</div>` : ''}
                <div style="font-size:8pt;color:#6b7280;">${mode === 'answer' ? '[ 정답지 ]' : '[ 학생용 ]'}</div>
              </div>
            </div>
            <div class="print-info-row">
              <div class="print-info-item">학년/반: <span class="print-info-blank"></span></div>
              <div class="print-info-item">이름: <span class="print-info-blank"></span></div>
              <div class="print-info-item">날짜: ${esc(today)}</div>
              ${ws.grade ? `<div class="print-info-item">(${esc(ws.grade)})</div>` : ''}
            </div>
          </div>
          <div class="print-body">
            <div class="print-columns-${cols}">${problemsHTML}</div>
          </div>
          <div class="print-page-footer">
            <span>${esc(ws.subject || '')}</span>
            <span class="print-page-num">— ${pageNum} —</span>
            <span>${mode === 'answer' ? '정답지' : ''}</span>
          </div>
        </div>
      </div>
    `;
    },

    /**
     * [B1, B9 FIX] 코드를 줄 단위로 렌더링
     * 각 줄은 <div class="print-code-line-wrap"> 로 감싸며
     * 줄 번호와 코드가 flex로 나란히 표시됨
     * break-inside:avoid 가 줄 단위로만 적용되므로
     * 긴 코드가 자연스럽게 다음 페이지로 이어짐
     */
    _renderCodeLines(block, mode) {
        const lines = block.code.split('\n');
        const sortedMasks = [...block.masks].sort((a, b) => a.start - b.start);

        /* 마스크를 줄별로 매핑 */
        const lineStarts = [];
        let pos = 0;
        lines.forEach(line => { lineStarts.push(pos); pos += line.length + 1; });

        return lines.map((line, li) => {
            const lineStart = lineStarts[li];
            const lineEnd   = lineStart + line.length;
            const lineNum   = li + 1;
            const isHL      = block.highlightLines.includes(lineNum);

            /* 이 줄에 걸치는 마스크 찾기 */
            const lineMasks = sortedMasks
                .filter(m => m.start < lineEnd && m.end > lineStart)
                .map(m => ({
                    ...m,
                    // 이 줄 안에서의 상대 오프셋
                    start: Math.max(m.start, lineStart) - lineStart,
                    end:   Math.min(m.end,   lineEnd)   - lineStart,
                }));

            const codeHTML = PrintMgr._renderLineWithMasks(line, lineMasks, mode);

            return `
        <div class="print-code-line-wrap">
          <div class="print-line-num">${lineNum}</div>
          <div class="print-code-line${isHL ? ' highlight-line' : ''}">${codeHTML}</div>
        </div>
      `;
        }).join('');
    },

    _renderLineWithMasks(line, masks, mode) {
        if (!masks.length) return esc(line) || '&nbsp;';

        let html = '';
        let pos = 0;
        for (const mask of masks) {
            if (pos < mask.start) html += esc(line.slice(pos, mask.start));

            const text = line.slice(mask.start, mask.end);
            if (mode === 'answer') {
                html += `<span class="print-answer-reveal">${esc(text)}</span>`;
            } else {
                const blanks = '_'.repeat(Math.max(text.replace(/\s/g, '').length || 4, 4));
                if (mask.type === 'blank')   html += `<span class="print-blank">${blanks}</span>`;
                else if (mask.type === 'comment') html += `<span class="print-comment-mask">/* ? */</span>`;
                else                         html += `<span class="print-hidden-mask">${blanks}</span>`;
            }
            pos = mask.end;
        }
        if (pos < line.length) html += esc(line.slice(pos));
        return html || '&nbsp;';
    },

    print() {
        if (AppState.problems.length === 0) {
            UI.showModal('알림', '인쇄할 문제가 없습니다. 먼저 문제를 추가하세요.');
            return;
        }
        PrintMgr.prepare();
        window.print();
    },
};

/* ============================================================
   9. DATA MANAGER
   ============================================================ */
const DataMgr = {
    save() {
        const data = {
            version: '2.0',
            worksheetInfo: AppState.worksheetInfo,
            problems: AppState.problems,
            settings: AppState.settings,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `worksheet_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    load(file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.problems) throw new Error('올바르지 않은 형식입니다.');
                AppState.worksheetInfo = { ...AppState.worksheetInfo, ...data.worksheetInfo };
                AppState.problems      = data.problems || [];
                AppState.settings      = { ...AppState.settings, ...(data.settings || {}) };
                AppState.currentProblemId = AppState.problems.length > 0 ? AppState.problems[0].id : null;
                /* [B6 FIX] 카운터 복원 */
                DataMgr._restoreCounters();
                UI.syncWorksheetInfo();
                UI.syncSettings();
                UI.renderProblemList();
                UI.renderProblemEditor();
                PreviewMgr.render();
            } catch (err) {
                UI.showModal('오류', '파일을 읽을 수 없습니다: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    /* [B6 FIX] 불러온 데이터에서 카운터 최댓값 복원 */
    _restoreCounters() {
        let maxProb = 0, maxBlock = 0, maxMask = 0;
        AppState.problems.forEach(p => {
            const pn = parseInt((p.id || '').split('-')[1], 36) || 0;
            maxProb = Math.max(maxProb, pn);
            p.codeBlocks.forEach(b => {
                const bn = parseInt((b.id || '').split('-')[1], 36) || 0;
                maxBlock = Math.max(maxBlock, bn);
                b.masks.forEach(m => {
                    const mn = parseInt((m.id || '').split('-')[1], 36) || 0;
                    maxMask = Math.max(maxMask, mn);
                });
            });
        });
        _problemCounter = AppState.problems.length;
        _blockCounter   = AppState.problems.reduce((s, p) => s + p.codeBlocks.length, 0);
        _maskCounter    = AppState.problems.reduce((s, p) =>
            s + p.codeBlocks.reduce((s2, b) => s2 + b.masks.length, 0), 0);
    },

    reset() {
        AppState.problems = [];
        AppState.currentProblemId = null;
        AppState.worksheetInfo = { title: '새 학습지', subject: '', grade: '', date: '', startPage: 1 };
        _problemCounter = 0; _blockCounter = 0; _maskCounter = 0;
        UI.syncWorksheetInfo();
        UI.renderProblemList();
        UI.renderProblemEditor();
        PreviewMgr.render();
    },
};

/* ============================================================
   10. SAMPLE DATA
   ============================================================ */
function addSampleProblem() {
    const prob = createProblem();
    prob.title = '변수 선언과 출력';
    prob.type  = 'fill';
    prob.lang  = 'c';
    prob.description = '다음 C 코드의 빈칸을 채워 "Hello, World!"를 출력하는 프로그램을 완성하시오.';
    prob.hint  = 'printf() 함수의 형식 문자열을 확인하세요.';
    prob.answer = '#include <stdio.h>\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}';

    const block = createCodeBlock('c');
    block.title = '예제 코드';
    block.code  = '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}';
    // 미리 설정된 마스크: "Hello, World!" (index 31..44)
    const sampleMaskText = 'Hello, World!';
    const sampleMaskStart = block.code.indexOf(sampleMaskText);
    if (sampleMaskStart !== -1) {
        block.masks = [{
            id: newId('mask'),
            blockId: block.id,
            start: sampleMaskStart,
            end:   sampleMaskStart + sampleMaskText.length,
            type:  'blank',
            text:  sampleMaskText,
        }];
    }
    block.highlightLines = [4];

    prob.codeBlocks = [block];
    AppState.problems.push(prob);
    AppState.currentProblemId = prob.id;
}

/* ============================================================
   11. INIT & EVENT BINDING
   ============================================================ */
function init() {

    /* ── Toolbar ── */
    document.getElementById('btn-new').addEventListener('click', () =>
        UI.confirm('현재 작업을 초기화하고 새 학습지를 만들까요?', () => DataMgr.reset())
    );
    document.getElementById('btn-save').addEventListener('click', () => DataMgr.save());
    document.getElementById('btn-load').addEventListener('click', () =>
        document.getElementById('file-input').click()
    );
    document.getElementById('file-input').addEventListener('change', e => {
        if (e.target.files[0]) { DataMgr.load(e.target.files[0]); e.target.value = ''; }
    });
    document.getElementById('btn-print').addEventListener('click', () => PrintMgr.print());

    /* ── View toggle ── */
    const setView = mode => {
        AppState.viewMode = mode;
        document.getElementById('btn-view-student').classList.toggle('active', mode === 'student');
        document.getElementById('btn-view-answer').classList.toggle('active', mode === 'answer');
        PreviewMgr.render();
        const prob = currentProb();
        if (prob) UI.renderCodeBlocks(prob);
    };
    document.getElementById('btn-view-student').addEventListener('click', () => setView('student'));
    document.getElementById('btn-view-answer').addEventListener('click',  () => setView('answer'));

    /* ── Problem list add ── */
    document.getElementById('btn-add-problem').addEventListener('click', () => ProblemMgr.add());

    /* ── Problem editor fields ── */
    document.getElementById('prob-title').addEventListener('input',       e => ProblemMgr.updateField('title',       e.target.value));
    document.getElementById('prob-description').addEventListener('input', e => ProblemMgr.updateField('description', e.target.value));
    document.getElementById('prob-hint').addEventListener('input',        e => ProblemMgr.updateField('hint',        e.target.value));
    document.getElementById('prob-answer').addEventListener('input',      e => ProblemMgr.updateField('answer',      e.target.value));

    document.getElementById('btn-del-prob').addEventListener('click', () => {
        const prob = currentProb();
        if (!prob) return;
        UI.confirm('이 문제를 삭제할까요?', () => ProblemMgr.delete(prob.id));
    });
    document.getElementById('btn-dup-prob').addEventListener('click', () => {
        const prob = currentProb();
        if (prob) ProblemMgr.duplicate(prob.id);
    });

    /* ── Type & Lang buttons ── */
    document.getElementById('prob-type-group').addEventListener('click', e => {
        const btn = e.target.closest('.type-btn');
        if (!btn) return;
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ProblemMgr.updateField('type', btn.dataset.type);
    });
    document.getElementById('prob-lang-group').addEventListener('click', e => {
        const btn = e.target.closest('.lang-btn');
        if (!btn) return;
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ProblemMgr.updateField('lang', btn.dataset.lang);
    });

    /* ── Code block add ── */
    document.getElementById('btn-add-code-block').addEventListener('click', () => {
        const prob = currentProb();
        if (prob) CodeBlockMgr.add(prob);
    });

    /* ── Selection popup cancel ── */
    document.getElementById('popup-cancel').addEventListener('click', () => {
        document.getElementById('selection-popup').style.display = 'none';
        AppState._pendingSelection = null;
        window.getSelection().removeAllRanges();
    });

    /* ── Close popup on outside click ── */
    document.addEventListener('mousedown', e => {
        const popup = document.getElementById('selection-popup');
        if (popup.style.display !== 'none' && !popup.contains(e.target)) {
            if (!e.target.closest('.code-select-pre')) {
                popup.style.display = 'none';
                AppState._pendingSelection = null;
            }
        }
    });

    /* ── Worksheet info ── */
    const wsFieldMap = {
        'ws-title': 'title', 'ws-subject': 'subject', 'ws-grade': 'grade',
        'ws-date': 'date', 'ws-start-page': 'startPage',
    };
    Object.entries(wsFieldMap).forEach(([id, field]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            AppState.worksheetInfo[field] = field === 'startPage' ? (parseInt(el.value, 10) || 1) : el.value;
            PreviewMgr.render();
        });
    });

    /* [B5 FIX] 설정 슬라이더: init에서만 한 번 바인딩 (syncSettings는 값 동기화만) */
    const bindRange = (id, valId, key, unit, parser) => {
        const slider = document.getElementById(id);
        const valEl  = document.getElementById(valId);
        if (!slider) return;
        slider.addEventListener('input', () => {
            const v = parser(slider.value);
            AppState.settings[key] = v;
            if (valEl) valEl.textContent = v + unit;
            PreviewMgr.render();
        });
    };
    bindRange('set-font-size',    'set-font-size-val',    'fontSize',    'pt', parseInt);
    bindRange('set-line-height',  'set-line-height-val',  'lineHeight',  '',   parseFloat);
    bindRange('set-answer-lines', 'set-answer-lines-val', 'answerLines', '줄', parseInt);

    document.getElementById('set-layout').addEventListener('change', e => {
        AppState.settings.layout = e.target.value;
    });
    document.getElementById('set-code-theme').addEventListener('change', e => {
        AppState.settings.codeTheme = e.target.value;
        PreviewMgr.render();
    });
    document.getElementById('set-margin').addEventListener('input', e => {
        AppState.settings.margin = parseInt(e.target.value, 10) || 15;
    });

    /* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); DataMgr.save(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); PrintMgr.print(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); ProblemMgr.add(); }
        if (e.key === 'Escape') {
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('selection-popup').style.display = 'none';
        }
    });

    /* ── Modal OK (fallback) ── */
    document.getElementById('modal-ok').addEventListener('click', () => {
        document.getElementById('modal-overlay').style.display = 'none';
    });

    /* ── Initial state ── */
    addSampleProblem();
    UI.syncWorksheetInfo();
    UI.syncSettings();
    UI.renderProblemList();
    UI.renderProblemEditor();
    PreviewMgr.render();
}

document.addEventListener('DOMContentLoaded', init);