/**
 * 코드 학습지 메이커 - script.js
 * 주요 모듈:
 *  - AppState      : 전역 상태 관리
 *  - ProblemMgr    : 문제 CRUD
 *  - CodeBlockMgr  : 코드 블록 관리
 *  - MaskMgr       : 드래그 가리기 (핵심 기능)
 *  - PreviewMgr    : 미리보기 렌더링
 *  - PrintMgr      : 인쇄 / PDF 출력
 *  - DataMgr       : JSON 저장 / 불러오기
 *  - UI            : DOM 이벤트 바인딩, 공통 유틸
 */

'use strict';

/* ============================================================
   1. APP STATE
   ============================================================ */
const AppState = {
    worksheetInfo: {
        title: '프로그래밍 기초 학습지',
        subject: '',
        grade: '',
        date: '',
        startPage: 1,
    },
    problems: [],      // [ProblemObject]
    currentProblemId: null,
    viewMode: 'student',  // 'student' | 'answer'
    settings: {
        fontSize: 11,
        lineHeight: 1.7,
        layout: 'auto',    // 'auto' | '1' | '2'
        codeTheme: 'dark',
        margin: 15,
    },
    // Internal state for drag-hide
    _pendingSelection: null,  // {blockId, start, end, text}
};

let _problemCounter = 0;
let _blockCounter = 0;
let _maskCounter = 0;

function newId(prefix) {
    const rand = Math.random().toString(36).slice(2, 7);
    const ts = Date.now().toString(36);
    return `${prefix}-${ts}-${rand}`;
}

/* ── Problem factory ── */
function createProblem() {
    _problemCounter++;
    return {
        id: newId('prob'),
        title: `문제 ${_problemCounter}`,
        type: 'fill',    // fill | output | error | order
        lang: 'c',
        description: '',
        hint: '',
        codeBlocks: [],
        answer: '',
    };
}

/* ── Code Block factory ── */
function createCodeBlock(lang = 'c') {
    _blockCounter++;
    return {
        id: newId('block'),
        title: `코드 블록 ${_blockCounter}`,
        lang: lang,
        code: '',
        masks: [],   // [MaskObject]
        highlightLines: [],   // [lineNumbers]
        editorMode: 'edit',  // 'edit' | 'select'
    };
}

/* ── Mask factory ── */
function createMask(blockId, start, end, type, text) {
    _maskCounter++;
    return {
        id: newId('mask'),
        blockId: blockId,
        start: start,
        end: end,
        type: type,  // 'blank' | 'comment' | 'hidden'
        text: text,
    };
}

/* ── Getters ── */
function getProblem(id) {
    return AppState.problems.find(p => p.id === id) || null;
}

function getCodeBlock(problem, blockId) {
    return problem ? problem.codeBlocks.find(b => b.id === blockId) : null;
}

function currentProblem() {
    return getProblem(AppState.currentProblemId);
}

/* ============================================================
   2. PROBLEM MANAGER
   ============================================================ */
const ProblemMgr = {

    add() {
        const prob = createProblem();
        // Add default code block
        prob.codeBlocks.push(createCodeBlock(prob.lang));
        AppState.problems.push(prob);
        UI.renderProblemList();
        ProblemMgr.select(prob.id);
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
        // Re-generate IDs for nested objects
        copy.codeBlocks = copy.codeBlocks.map(b => {
            b.id = newId('block');
            b.masks = b.masks.map(m => {
                m.id = newId('mask');
                return m;
            });
            return b;
        });
        const idx = AppState.problems.findIndex(p => p.id === id);
        AppState.problems.splice(idx + 1, 0, copy);
        UI.renderProblemList();
        ProblemMgr.select(copy.id);
    },

    updateField(field, value) {
        const prob = currentProblem();
        if (!prob) return;
        prob[field] = value;
        if (field === 'lang') {
            // Sync default lang on code blocks
            prob.codeBlocks.forEach(b => {
                b.lang = value;
            });
            UI.renderCodeBlocks(prob);
        }
        if (field === 'title' || field === 'type') {
            UI.renderProblemList();
        }
        PreviewMgr.render();
    },
};

/* ============================================================
   3. CODE BLOCK MANAGER
   ============================================================ */
const CodeBlockMgr = {

    add(prob) {
        if (!prob) return;
        const block = createCodeBlock(prob.lang);
        prob.codeBlocks.push(block);
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
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        block.code = code;
        // Remove masks that are out of range
        block.masks = block.masks.filter(m => m.end <= code.length);
        PreviewMgr.render();
    },

    updateTitle(prob, blockId, title) {
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        block.title = title;
        PreviewMgr.render();
    },

    updateHighlights(prob, blockId, input) {
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        // Parse comma/space separated line numbers
        const nums = input.split(/[,\s]+/)
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0);
        block.highlightLines = [...new Set(nums)];
        PreviewMgr.render();
    },

    setMode(prob, blockId, mode) {
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        block.editorMode = mode;
        UI.renderCodeBlocks(prob);
    },

    addMask(prob, blockId, start, end, type) {
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        const text = block.code.slice(start, end);
        if (!text.trim()) return;
        // Check for overlap with existing masks
        const overlaps = block.masks.some(m =>
            !(end <= m.start || start >= m.end)
        );
        if (overlaps) {
            UI.showModal('알림', '선택한 영역이 이미 가려진 부분과 겹칩니다. 다른 영역을 선택하세요.');
            return;
        }
        const mask = createMask(blockId, start, end, type, text);
        block.masks.push(mask);
        // Sort masks by start position
        block.masks.sort((a, b) => a.start - b.start);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    removeMask(prob, blockId, maskId) {
        const block = getCodeBlock(prob, blockId);
        if (!block) return;
        block.masks = block.masks.filter(m => m.id !== maskId);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },
};

/* ============================================================
   4. MASK RENDERER
   Converts code + masks → HTML for display
   ============================================================ */
const MaskRenderer = {

    /**
     * Render code with masks applied.
     * @param {string} code   - raw code string
     * @param {Array}  masks  - sorted mask objects
     * @param {string} mode   - 'student' or 'answer'
     * @param {Array}  highlightLines - 1-based line numbers to highlight
     * @param {string} context - 'editor' | 'print'
     * @returns {string} HTML string
     */
    render(code, masks, mode, highlightLines = [], context = 'editor') {
        // Split code into lines for line number handling
        const lines = code.split('\n');
        const lineStarts = [];
        let pos = 0;
        lines.forEach(line => {
            lineStarts.push(pos);
            pos += line.length + 1; // +1 for \n
        });

        // Build segments with mask info
        const segments = MaskRenderer._buildSegments(code, masks);

        // Reconstruct lines from segments
        let html = '';
        let charPos = 0;
        let lineIdx = 0;

        for (const seg of segments) {
            // Process character by character to handle line breaks
            if (seg.isMask) {
                // A mask segment: render as single masked unit
                const isHighlight = highlightLines.includes(lineIdx + 1);
                html += MaskRenderer._renderMaskSpan(seg.text, seg.type, mode, context, isHighlight);
                charPos += seg.text.length;
                // Count newlines inside mask
                const nlCount = (seg.text.match(/\n/g) || []).length;
                lineIdx += nlCount;
            } else {
                // Plain text segment: split on newlines for line highlighting
                const chars = seg.text.split('');
                let buf = '';
                for (const ch of chars) {
                    if (ch === '\n') {
                        const isHighlight = highlightLines.includes(lineIdx + 1);
                        if (context === 'editor') {
                            html += (isHighlight ? `<span class="highlighted-line">` : '') + escapeHtml(buf) + (isHighlight ? '</span>' : '') + '\n';
                        } else {
                            html += (isHighlight ? `<span class="print-highlighted-line">` : '') + escapeHtml(buf) + (isHighlight ? '</span>' : '') + '\n';
                        }
                        buf = '';
                        lineIdx++;
                    } else {
                        buf += ch;
                    }
                    charPos++;
                }
                if (buf) {
                    const isHighlight = highlightLines.includes(lineIdx + 1);
                    if (context === 'editor') {
                        html += (isHighlight ? `<span class="highlighted-line">` : '') + escapeHtml(buf) + (isHighlight ? '</span>' : '');
                    } else {
                        html += (isHighlight ? `<span class="print-highlighted-line">` : '') + escapeHtml(buf) + (isHighlight ? '</span>' : '');
                    }
                }
            }
        }

        return html;
    },

    _buildSegments(code, masks) {
        const segments = [];
        let pos = 0;
        for (const mask of masks) {
            if (pos < mask.start) {
                segments.push({isMask: false, text: code.slice(pos, mask.start)});
            }
            segments.push({isMask: true, text: code.slice(mask.start, mask.end), type: mask.type, id: mask.id});
            pos = mask.end;
        }
        if (pos < code.length) {
            segments.push({isMask: false, text: code.slice(pos)});
        }
        return segments;
    },

    _renderMaskSpan(text, type, mode, context, isHighlight) {
        const wrapHighlight = (inner) =>
            isHighlight
                ? (context === 'editor' ? `<span class="highlighted-line">${inner}</span>` : `<span class="print-highlighted-line">${inner}</span>`)
                : inner;

        if (mode === 'answer') {
            const cls = context === 'editor' ? 'mask-answer' : 'print-answer-reveal';
            return wrapHighlight(`<span class="${cls}">${escapeHtml(text)}</span>`);
        }

        // Student mode
        const blanks = '_'.repeat(Math.max(text.replace(/\n/g, '').length, 4));
        if (type === 'blank') {
            const cls = context === 'editor' ? 'mask-blank' : 'print-blank';
            return wrapHighlight(`<span class="${cls}">${blanks}</span>`);
        } else if (type === 'comment') {
            const cls = context === 'editor' ? 'mask-comment' : 'print-comment-mask';
            return wrapHighlight(`<span class="${cls}">/* ? */</span>`);
        } else { // hidden
            const cls = context === 'editor' ? 'mask-hidden' : 'print-hidden-mask';
            return wrapHighlight(`<span class="${cls}">${blanks}</span>`);
        }
    },

    /* Generate line numbers string */
    lineNumbers(code) {
        const count = (code.match(/\n/g) || []).length + 1;
        return Array.from({length: count}, (_, i) => i + 1).join('\n');
    },
};

/* ============================================================
   5. UI MANAGER
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

        const TYPE_LABELS = {
            fill: '빈칸 채우기',
            output: '출력 예측',
            error: '오류 찾기',
            order: '순서 맞추기',
        };

        container.innerHTML = AppState.problems.map((prob, idx) => `
      <div class="problem-item ${prob.id === AppState.currentProblemId ? 'active' : ''}"
           data-id="${prob.id}" role="button" tabindex="0">
        <div class="problem-item-num">Q${idx + 1}</div>
        <div class="problem-item-info">
          <div class="problem-item-title">${escapeHtml(prob.title)}</div>
          <div class="problem-item-type">${TYPE_LABELS[prob.type] || prob.type} · ${prob.lang.toUpperCase()}</div>
        </div>
        <button class="problem-item-del" data-del="${prob.id}" title="삭제">✕</button>
      </div>
    `).join('');

        // Events
        container.querySelectorAll('.problem-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-del]')) return;
                ProblemMgr.select(el.dataset.id);
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') ProblemMgr.select(el.dataset.id);
            });
        });

        container.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.confirm('이 문제를 삭제할까요?', () => ProblemMgr.delete(btn.dataset.del));
            });
        });
    },

    /* ── Problem Editor ── */
    renderProblemEditor() {
        const placeholder = document.getElementById('editor-placeholder');
        const editor = document.getElementById('problem-editor');
        const prob = currentProblem();

        if (!prob) {
            placeholder.style.display = 'flex';
            editor.style.display = 'none';
            return;
        }

        placeholder.style.display = 'none';
        editor.style.display = 'flex';

        const idx = AppState.problems.indexOf(prob);

        // Badge
        document.getElementById('prob-number-badge').textContent = `Q${idx + 1}`;

        // Title
        const titleInput = document.getElementById('prob-title');
        titleInput.value = prob.title;

        // Type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === prob.type);
        });

        // Lang buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === prob.lang);
        });

        // Description, hint, answer
        document.getElementById('prob-description').value = prob.description;
        document.getElementById('prob-hint').value = prob.hint;
        document.getElementById('prob-answer').value = prob.answer;

        // Code blocks
        UI.renderCodeBlocks(prob);

        // Scroll to top
        document.getElementById('editor-panel').scrollTop = 0;
    },

    /* ── Code Blocks ── */
    renderCodeBlocks(prob) {
        const container = document.getElementById('code-blocks-container');
        if (!container || !prob) return;

        if (prob.codeBlocks.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:#94a3b8;text-align:center;padding:16px;">코드 블록이 없습니다. 블록 추가 버튼을 클릭하세요.</div>';
            return;
        }

        container.innerHTML = '';
        prob.codeBlocks.forEach(block => {
            const el = UI._createCodeBlockEl(prob, block);
            container.appendChild(el);
        });
    },

    _createCodeBlockEl(prob, block) {
        const wrap = document.createElement('div');
        wrap.className = 'code-block-item fade-in';
        wrap.dataset.blockId = block.id;

        /* ─ Header ─ */
        const header = document.createElement('div');
        header.className = 'code-block-header';
        header.innerHTML = `
      <span class="code-block-lang-badge">${block.lang.toUpperCase()}</span>
      <input type="text" class="code-block-title-input" value="${escapeHtml(block.title)}" placeholder="블록 제목" />
      <div class="code-block-mode-group">
        <button class="mode-btn ${block.editorMode === 'edit' ? 'active' : ''}" data-mode="edit">편집</button>
        <button class="mode-btn ${block.editorMode === 'select' ? 'active' : ''}" data-mode="select">가리기</button>
      </div>
      <div class="code-block-actions">
        <button class="btn-icon-sm btn-danger-icon" data-action="del" title="블록 삭제">✕</button>
      </div>
    `;
        wrap.appendChild(header);

        /* ─ Title input event ─ */
        header.querySelector('.code-block-title-input').addEventListener('input', e => {
            CodeBlockMgr.updateTitle(prob, block.id, e.target.value);
        });

        /* ─ Mode buttons ─ */
        header.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.mode === 'select') {
                    // Prompt if no code
                    if (!block.code.trim()) {
                        UI.showModal('알림', '먼저 코드를 입력한 후 가리기 모드를 사용하세요.');
                        return;
                    }
                }
                CodeBlockMgr.setMode(prob, block.id, btn.dataset.mode);
            });
        });

        /* ─ Delete button ─ */
        header.querySelector('[data-action="del"]').addEventListener('click', () => {
            if (prob.codeBlocks.length === 1) {
                UI.showModal('알림', '최소 하나의 코드 블록이 필요합니다.');
                return;
            }
            UI.confirm('이 코드 블록을 삭제할까요?', () => CodeBlockMgr.delete(prob, block.id));
        });

        /* ─ Content area ─ */
        if (block.editorMode === 'edit') {
            const editArea = UI._createEditArea(prob, block);
            wrap.appendChild(editArea);
        } else {
            const selectArea = UI._createSelectArea(prob, block);
            wrap.appendChild(selectArea);
        }

        /* ─ Highlight row ─ */
        const hlRow = document.createElement('div');
        hlRow.className = 'highlight-row';
        hlRow.innerHTML = `
      <span class="highlight-label">강조 줄 번호:</span>
      <input type="text" class="highlight-input" value="${block.highlightLines.join(', ')}"
             placeholder="예: 3, 5, 7" />
    `;
        hlRow.querySelector('.highlight-input').addEventListener('input', e => {
            CodeBlockMgr.updateHighlights(prob, block.id, e.target.value);
        });
        wrap.appendChild(hlRow);

        /* ─ Mask List ─ */
        if (block.masks.length > 0) {
            const maskListEl = UI._createMaskList(prob, block);
            wrap.appendChild(maskListEl);
        }

        return wrap;
    },

    _createEditArea(prob, block) {
        const area = document.createElement('div');
        area.className = 'code-edit-area';

        const lineNums = document.createElement('div');
        lineNums.className = 'line-numbers';
        lineNums.textContent = MaskRenderer.lineNumbers(block.code);
        area.appendChild(lineNums);

        const textarea = document.createElement('textarea');
        textarea.className = 'code-textarea';
        textarea.value = block.code;
        textarea.placeholder = `// ${block.lang === 'python' ? 'Python' : 'C'} 코드를 입력하세요...`;
        textarea.rows = Math.max(8, (block.code.match(/\n/g) || []).length + 2);
        textarea.spellcheck = false;

        // Auto-resize and line numbers sync
        const syncLines = () => {
            const lines = textarea.value.split('\n');
            lineNums.textContent = lines.map((_, i) => i + 1).join('\n');
            textarea.rows = Math.max(8, lines.length + 1);
        };

        textarea.addEventListener('input', () => {
            syncLines();
            CodeBlockMgr.updateCode(prob, block.id, textarea.value);
        });

        // Tab key support
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const spaces = '    '; // 4 spaces
                textarea.value = textarea.value.slice(0, start) + spaces + textarea.value.slice(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                syncLines();
                CodeBlockMgr.updateCode(prob, block.id, textarea.value);
            }
            // Auto-close brackets
            const pairs = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'"};
            if (pairs[e.key]) {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const sel = textarea.value.slice(start, end);
                if (sel) {
                    textarea.value = textarea.value.slice(0, start) + e.key + sel + pairs[e.key] + textarea.value.slice(end);
                    textarea.selectionStart = start + 1;
                    textarea.selectionEnd = end + 1;
                } else {
                    textarea.value = textarea.value.slice(0, start) + e.key + pairs[e.key] + textarea.value.slice(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                }
                syncLines();
                CodeBlockMgr.updateCode(prob, block.id, textarea.value);
            }
        });

        area.appendChild(textarea);
        return area;
    },

    _createSelectArea(prob, block) {
        const area = document.createElement('div');
        area.className = 'code-select-area';

        // Hint bar
        const hint = document.createElement('div');
        hint.className = 'select-mode-hint';
        hint.innerHTML = `
      ✱ <strong>가리기 모드</strong> — 아래 코드에서 숨길 텍스트를 드래그로 선택하면 옵션이 나타납니다.
      현재 마스크: <strong>${block.masks.length}개</strong>
    `;
        area.appendChild(hint);

        const display = document.createElement('div');
        display.className = 'code-select-display';

        // Line numbers
        const lineNums = document.createElement('div');
        lineNums.className = 'select-line-numbers';
        lineNums.textContent = MaskRenderer.lineNumbers(block.code);
        display.appendChild(lineNums);

        // Code pre — single text node for accurate selection offsets
        const pre = document.createElement('pre');
        pre.className = 'code-select-pre';
        pre.dataset.blockId = block.id;
        // Show code with existing masks rendered visually
        pre.innerHTML = MaskRenderer.render(
            block.code, block.masks, AppState.viewMode, block.highlightLines, 'editor'
        );
        display.appendChild(pre);
        area.appendChild(display);

        // Mouse up: capture selection
        pre.addEventListener('mouseup', () => {
            setTimeout(() => {  // setTimeout to ensure selection is final
                UI._handleCodeSelection(prob, block, pre);
            }, 10);
        });

        return area;
    },

    _handleCodeSelection(prob, block, pre) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!pre.contains(range.commonAncestorContainer)) return;

        const selectedText = sel.toString();
        if (!selectedText || !selectedText.trim()) return;

        // Calculate character offsets using TreeWalker
        const offsets = UI._getCharOffsets(pre, range);
        if (!offsets) return;

        // Store pending selection
        AppState._pendingSelection = {
            blockId: block.id,
            start: offsets.start,
            end: offsets.end,
            text: selectedText,
        };

        // Show floating popup near selection
        UI._showSelectionPopup(range, prob);
    },

    /**
     * Compute character offsets in the rendered code pre.
     * We walk all text nodes, accumulating counts until we reach
     * the range's start and end containers.
     */
    _getCharOffsets(container, range) {
        let startOffset = 0;
        let endOffset = 0;
        let foundStart = false;
        let foundEnd = false;
        let charCount = 0;

        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const len = node.textContent.length;

            if (node === range.startContainer) {
                startOffset = charCount + range.startOffset;
                foundStart = true;
            }
            if (node === range.endContainer) {
                endOffset = charCount + range.endOffset;
                foundEnd = true;
            }
            if (foundStart && foundEnd) break;
            charCount += len;
        }

        if (!foundStart || !foundEnd) return null;
        if (startOffset === endOffset) return null;

        return {
            start: Math.min(startOffset, endOffset),
            end: Math.max(startOffset, endOffset),
        };
    },

    _showSelectionPopup(range, prob) {
        const popup = document.getElementById('selection-popup');
        const rect = range.getBoundingClientRect();

        // Position above selection
        const top = Math.max(rect.top + window.scrollY - 48, 10);
        const left = Math.max(rect.left + window.scrollX, 10);

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.style.display = 'flex';

        // Bind popup buttons for this prob
        popup.querySelectorAll('.popup-btn[data-hide-type]').forEach(btn => {
            // Clone to remove old listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                const sel = AppState._pendingSelection;
                if (sel) {
                    CodeBlockMgr.addMask(prob, sel.blockId, sel.start, sel.end, newBtn.dataset.hideType);
                }
                AppState._pendingSelection = null;
                popup.style.display = 'none';
                window.getSelection().removeAllRanges();
            });
        });
    },

    _createMaskList(prob, block) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:8px 12px;border-top:1px solid #e2e8f0;background:#f8fafc;';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;';
        label.textContent = '가리기 목록';
        wrap.appendChild(label);

        const list = document.createElement('div');
        list.className = 'mask-list';

        block.masks.forEach(mask => {
            const item = document.createElement('div');
            item.className = 'mask-item';

            const TYPE_LABEL = {blank: '빈칸', comment: '주석', hidden: '숨김'};
            const preview = mask.text.replace(/\n/g, '↵').slice(0, 30) + (mask.text.length > 30 ? '…' : '');

            item.innerHTML = `
        <span class="mask-item-type ${mask.type}">${TYPE_LABEL[mask.type]}</span>
        <span class="mask-item-text">${escapeHtml(preview)}</span>
        <span style="font-size:10px;color:#94a3b8;flex-shrink:0;">[${mask.start}:${mask.end}]</span>
        <button class="mask-item-del" data-mask-id="${mask.id}" title="마스크 제거">✕</button>
      `;

            item.querySelector('.mask-item-del').addEventListener('click', () => {
                CodeBlockMgr.removeMask(prob, block.id, mask.id);
            });

            list.appendChild(item);
        });

        wrap.appendChild(list);
        return wrap;
    },

    /* ── Settings sync ── */
    syncSettings() {
        const s = AppState.settings;

        const fsSlider = document.getElementById('set-font-size');
        const lhSlider = document.getElementById('set-line-height');
        const layoutSel = document.getElementById('set-layout');
        const themeSel = document.getElementById('set-code-theme');
        const marginIn = document.getElementById('set-margin');

        if (fsSlider) {
            fsSlider.value = s.fontSize;
            document.getElementById('set-font-size-val').textContent = s.fontSize + 'px';
        }
        if (lhSlider) {
            lhSlider.value = s.lineHeight;
            document.getElementById('set-line-height-val').textContent = s.lineHeight;
        }
        if (layoutSel) layoutSel.value = s.layout;
        if (themeSel) themeSel.value = s.codeTheme;
        if (marginIn) marginIn.value = s.margin;
    },

    /* ── Worksheet info sync ── */
    syncWorksheetInfo() {
        const ws = AppState.worksheetInfo;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        set('ws-title', ws.title);
        set('ws-subject', ws.subject);
        set('ws-grade', ws.grade);
        set('ws-date', ws.date);
        set('ws-start-page', ws.startPage);
    },

    /* ── Modal helpers ── */
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
            const btn = document.createElement('button');
            btn.className = 'btn-sm btn-primary';
            btn.textContent = '확인';
            btn.addEventListener('click', () => document.getElementById('modal-overlay').style.display = 'none');
            footer.appendChild(btn);
        }

        document.getElementById('modal-overlay').style.display = 'flex';
    },

    confirm(message, onOk) {
        UI.showModal('확인', message, [
            {label: '취소', cls: 'btn-sm btn-ghost', action: null},
            {label: '확인', cls: 'btn-sm btn-danger', action: onOk},
        ]);
    },
};

/* ============================================================
   6. PREVIEW MANAGER
   ============================================================ */
const PreviewMgr = {

    render() {
        const container = document.getElementById('preview-container');
        if (!container) return;

        const ws = AppState.worksheetInfo;
        const probs = AppState.problems;

        if (probs.length === 0) {
            container.innerHTML = '<div class="preview-empty"><p>문제를 추가하면<br>여기에 미리보기가 표시됩니다</p></div>';
            return;
        }

        // Update badge
        const badge = document.getElementById('preview-mode-badge');
        if (badge) {
            badge.textContent = AppState.viewMode === 'student' ? '학생용' : '정답지';
            badge.style.background = AppState.viewMode === 'student' ? '' : '#dcfce7';
            badge.style.color = AppState.viewMode === 'student' ? '' : '#166534';
        }

        // Build mini A4 preview pages
        const pageHTML = PreviewMgr._buildPreviewPage(ws, probs);
        container.innerHTML = pageHTML;
    },

    _buildPreviewPage(ws, probs) {
        const title = ws.title || '학습지 제목';
        const grade = ws.grade || '　　학년　　반';
        const date = ws.date || '　　　　년　　월　　일';

        let probsHTML = probs.map((prob, idx) => {
            const num = idx + 1;
            const TYPE_LABELS = {fill: '빈칸', output: '출력', error: '오류', order: '순서'};

            let blocksHTML = prob.codeBlocks.slice(0, 2).map(block => {
                const codePreview = block.code.slice(0, 200);
                return `<div class="preview-code-block">
          <div class="preview-code-text">${escapeHtml(codePreview.slice(0, 100))}</div>
        </div>`;
            }).join('');

            return `
        <div class="preview-problem">
          <div class="preview-prob-title">
            <span class="preview-prob-num">${num}.</span>
            ${escapeHtml(prob.title)}
          </div>
          ${prob.description ? `<div class="preview-prob-desc">${escapeHtml(prob.description.slice(0, 80))}</div>` : ''}
          ${blocksHTML}
        </div>
      `;
        }).join('');

        return `
      <div class="preview-page">
        <div class="preview-page-header">
          <div class="preview-page-school">${escapeHtml(ws.subject)}</div>
          <div class="preview-page-title">${escapeHtml(title)}</div>
          <div class="preview-page-meta">
            <span>${escapeHtml(grade)}</span>
            <span>${escapeHtml(date)}</span>
          </div>
        </div>
        <div class="preview-page-body">${probsHTML}</div>
        <div class="preview-page-footer">— ${ws.startPage} —</div>
      </div>
    `;
    },
};

/* ============================================================
   7. PRINT MANAGER
   ============================================================ */
const PrintMgr = {

    prepare() {
        const ws = AppState.worksheetInfo;
        const probs = AppState.problems;
        const s = AppState.settings;
        const mode = AppState.viewMode;

        const printArea = document.getElementById('print-area');

        // Set CSS custom properties for print
        document.documentElement.style.setProperty('--print-font-size', `${s.fontSize}pt`);
        document.documentElement.style.setProperty('--print-line-height', `${s.lineHeight}`);
        document.documentElement.style.setProperty('--print-margin', `${s.margin}mm`);

        // Determine columns
        let cols = parseInt(s.layout, 10);
        if (isNaN(cols)) {
            // Auto: use 2 cols if all code blocks are short, else 1
            const avgLen = probs.reduce((sum, p) => {
                const codeLen = p.codeBlocks.reduce((s2, b) => s2 + b.code.split('\n').length, 0);
                return sum + codeLen;
            }, 0) / (probs.length || 1);
            cols = avgLen > 20 ? 1 : 2;
        }

        const TYPE_LABELS = {fill: '빈칸 채우기', output: '출력 예측', error: '오류 찾기', order: '순서 맞추기'};

        // Build problem HTML
        const problemsHTML = probs.map((prob, idx) => {
            const num = idx + 1;
            const typeBadge = TYPE_LABELS[prob.type] || '';

            const codeBlocksHTML = prob.codeBlocks.map(block => {
                const lineNums = MaskRenderer.lineNumbers(block.code);
                const codeHTML = MaskRenderer.render(
                    block.code, block.masks, mode, block.highlightLines, 'print'
                );
                return `
          <div class="print-code-block print-code-theme-${s.codeTheme}">
            ${block.title ? `<div class="print-code-title">${escapeHtml(block.title)}</div>` : ''}
            <div class="print-code-body">
              <div class="print-line-numbers">${lineNums}</div>
              <div class="print-code-body-pre-wrap">
                <pre class="print-code-pre">${codeHTML}</pre>
              </div>
            </div>
          </div>
        `;
            }).join('');

            const answerHTML = mode === 'answer' && prob.answer
                ? `<div class="print-answer-section">
             <div class="print-answer-label">정답 / 해설</div>
             <div class="print-answer-text">${escapeHtml(prob.answer)}</div>
           </div>`
                : '';

            return `
        <div class="print-problem">
          <div class="print-prob-title">
            <span class="print-prob-num">${num}.</span>
            <span>${escapeHtml(prob.title)}</span>
            <span class="print-prob-type-badge">${typeBadge}</span>
          </div>
          ${prob.description ? `<div class="print-prob-description">${escapeHtml(prob.description)}</div>` : ''}
          ${prob.hint ? `<div class="print-prob-hint">${escapeHtml(prob.hint)}</div>` : ''}
          ${codeBlocksHTML}
          ${answerHTML}
        </div>
      `;
        }).join('');

        // Build full print document
        const today = ws.date || new Date().toLocaleDateString('ko-KR');
        const pageNum = ws.startPage || 1;

        printArea.innerHTML = `
      <div class="print-document">
        <div class="print-page">
          <div class="print-header">
            <div class="print-header-top">
              <div class="print-title">${escapeHtml(ws.title || '학습지')}</div>
              <div class="print-meta-block">
                ${ws.subject ? `<div class="print-subject">${escapeHtml(ws.subject)}</div>` : ''}
              </div>
            </div>
            <div class="print-info-row">
              <div class="print-info-item">학년/반: <span class="print-info-blank"></span></div>
              <div class="print-info-item">이름: <span class="print-info-blank"></span></div>
              <div class="print-info-item">날짜: ${escapeHtml(today)}</div>
              ${ws.grade ? `<div class="print-info-item">(${escapeHtml(ws.grade)})</div>` : ''}
            </div>
          </div>
          <div class="print-body">
            <div class="print-columns-${cols}">
              ${problemsHTML}
            </div>
          </div>
          <div class="print-page-footer">
            <span>${escapeHtml(ws.subject || '')}</span>
            <span class="print-page-num">— ${pageNum} —</span>
            <span>${mode === 'answer' ? '[ 정답지 ]' : ''}</span>
          </div>
        </div>
      </div>
    `;
    },

    print() {
        PrintMgr.prepare();
        window.print();
    },
};

/* ============================================================
   8. DATA MANAGER
   ============================================================ */
const DataMgr = {

    save() {
        const data = {
            version: '1.0',
            worksheetInfo: AppState.worksheetInfo,
            problems: AppState.problems,
            settings: AppState.settings,
            exportedAt: new Date().toISOString(),
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worksheet_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    load(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.problems) throw new Error('올바르지 않은 형식');
                AppState.worksheetInfo = {...AppState.worksheetInfo, ...data.worksheetInfo};
                AppState.problems = data.problems || [];
                AppState.settings = {...AppState.settings, ...data.settings};
                AppState.currentProblemId = AppState.problems.length > 0 ? AppState.problems[0].id : null;
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

    reset() {
        AppState.problems = [];
        AppState.currentProblemId = null;
        AppState.worksheetInfo = {
            title: '새 학습지',
            subject: '',
            grade: '',
            date: '',
            startPage: 1,
        };
        _problemCounter = 0;
        _blockCounter = 0;
        _maskCounter = 0;
        UI.syncWorksheetInfo();
        UI.renderProblemList();
        UI.renderProblemEditor();
        PreviewMgr.render();
    },
};

/* ============================================================
   9. UTILITY
   ============================================================ */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ============================================================
   10. EVENT BINDING & INIT
   ============================================================ */
function init() {
    /* ── Toolbar buttons ── */
    document.getElementById('btn-new').addEventListener('click', () => {
        UI.confirm('현재 작업을 초기화하고 새 학습지를 만들까요?', () => DataMgr.reset());
    });

    document.getElementById('btn-save').addEventListener('click', () => DataMgr.save());

    document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            DataMgr.load(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('btn-print').addEventListener('click', () => {
        if (AppState.problems.length === 0) {
            UI.showModal('알림', '인쇄할 문제가 없습니다. 먼저 문제를 추가하세요.');
            return;
        }
        PrintMgr.print();
    });

    /* ── View toggle ── */
    document.getElementById('btn-view-student').addEventListener('click', () => {
        AppState.viewMode = 'student';
        document.getElementById('btn-view-student').classList.add('active');
        document.getElementById('btn-view-answer').classList.remove('active');
        PreviewMgr.render();
        // Re-render current problem's select mode blocks
        const prob = currentProblem();
        if (prob) UI.renderCodeBlocks(prob);
    });

    document.getElementById('btn-view-answer').addEventListener('click', () => {
        AppState.viewMode = 'answer';
        document.getElementById('btn-view-answer').classList.add('active');
        document.getElementById('btn-view-student').classList.remove('active');
        PreviewMgr.render();
        const prob = currentProblem();
        if (prob) UI.renderCodeBlocks(prob);
    });

    /* ── Add problem ── */
    document.getElementById('btn-add-problem').addEventListener('click', () => ProblemMgr.add());

    /* ── Problem editor fields ── */
    document.getElementById('prob-title').addEventListener('input', e => ProblemMgr.updateField('title', e.target.value));
    document.getElementById('prob-description').addEventListener('input', e => ProblemMgr.updateField('description', e.target.value));
    document.getElementById('prob-hint').addEventListener('input', e => ProblemMgr.updateField('hint', e.target.value));
    document.getElementById('prob-answer').addEventListener('input', e => ProblemMgr.updateField('answer', e.target.value));

    document.getElementById('btn-del-prob').addEventListener('click', () => {
        const prob = currentProblem();
        if (!prob) return;
        UI.confirm('이 문제를 삭제할까요?', () => ProblemMgr.delete(prob.id));
    });

    document.getElementById('btn-dup-prob').addEventListener('click', () => {
        const prob = currentProblem();
        if (!prob) return;
        ProblemMgr.duplicate(prob.id);
    });

    /* ── Problem type buttons ── */
    document.getElementById('prob-type-group').addEventListener('click', (e) => {
        const btn = e.target.closest('.type-btn');
        if (!btn) return;
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ProblemMgr.updateField('type', btn.dataset.type);
    });

    /* ── Language buttons ── */
    document.getElementById('prob-lang-group').addEventListener('click', (e) => {
        const btn = e.target.closest('.lang-btn');
        if (!btn) return;
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ProblemMgr.updateField('lang', btn.dataset.lang);
    });

    /* ── Add code block ── */
    document.getElementById('btn-add-code-block').addEventListener('click', () => {
        const prob = currentProblem();
        if (!prob) return;
        CodeBlockMgr.add(prob);
    });

    /* ── Selection popup cancel ── */
    document.getElementById('popup-cancel').addEventListener('click', () => {
        document.getElementById('selection-popup').style.display = 'none';
        AppState._pendingSelection = null;
        window.getSelection().removeAllRanges();
    });

    /* ── Close popup on outside click ── */
    document.addEventListener('mousedown', (e) => {
        const popup = document.getElementById('selection-popup');
        if (popup.style.display !== 'none' && !popup.contains(e.target)) {
            // Only close if not clicking on the code area (which triggers selection)
            if (!e.target.closest('.code-select-pre')) {
                popup.style.display = 'none';
                AppState._pendingSelection = null;
            }
        }
    });

    /* ── Worksheet info fields ── */
    ['ws-title', 'ws-subject', 'ws-grade', 'ws-date', 'ws-start-page'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fieldMap = {
            'ws-title': 'title',
            'ws-subject': 'subject',
            'ws-grade': 'grade',
            'ws-date': 'date',
            'ws-start-page': 'startPage',
        };
        el.addEventListener('input', () => {
            const field = fieldMap[id];
            const val = id === 'ws-start-page' ? (parseInt(el.value, 10) || 1) : el.value;
            AppState.worksheetInfo[field] = val;
            PreviewMgr.render();
        });
    });

    /* ── Settings ── */
    const fsSlider = document.getElementById('set-font-size');
    fsSlider.addEventListener('input', () => {
        AppState.settings.fontSize = parseInt(fsSlider.value, 10);
        document.getElementById('set-font-size-val').textContent = fsSlider.value + 'px';
    });

    const lhSlider = document.getElementById('set-line-height');
    lhSlider.addEventListener('input', () => {
        AppState.settings.lineHeight = parseFloat(lhSlider.value);
        document.getElementById('set-line-height-val').textContent = lhSlider.value;
    });

    document.getElementById('set-layout').addEventListener('change', e => {
        AppState.settings.layout = e.target.value;
    });

    document.getElementById('set-code-theme').addEventListener('change', e => {
        AppState.settings.codeTheme = e.target.value;
    });

    document.getElementById('set-margin').addEventListener('input', e => {
        AppState.settings.margin = parseInt(e.target.value, 10) || 15;
    });

    /* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            DataMgr.save();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (AppState.problems.length > 0) PrintMgr.print();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            ProblemMgr.add();
        }
        if (e.key === 'Escape') {
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('selection-popup').style.display = 'none';
        }
    });

    /* ── Modal OK button ── */
    document.getElementById('modal-ok').addEventListener('click', () => {
        document.getElementById('modal-overlay').style.display = 'none';
    });

    /* ── Initial sync ── */
    UI.syncWorksheetInfo();
    UI.syncSettings();
    UI.renderProblemList();
    UI.renderProblemEditor();
    PreviewMgr.render();

    /* ── Welcome: add a sample problem ── */
    _addSampleProblem();
}

function _addSampleProblem() {
    const prob = createProblem();
    prob.title = '변수 선언과 출력';
    prob.type = 'fill';
    prob.lang = 'c';
    prob.description = '다음 C 코드의 빈칸을 채워 "Hello, World!"를 출력하는 프로그램을 완성하시오.';
    prob.hint = 'printf() 함수의 형식 문자열을 확인하세요.';
    prob.answer = '#include <stdio.h>\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}';

    const block = createCodeBlock('c');
    block.title = '예제 코드';
    block.code = '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}';
    // Pre-add a sample mask (빈칸)
    block.masks = [{
        id: newId('mask'),
        blockId: block.id,
        start: 31,  // position of "Hello, World!"
        end: 45,
        type: 'blank',
        text: 'Hello, World!',
    }];
    block.highlightLines = [4];

    prob.codeBlocks = [block];
    AppState.problems.push(prob);
    AppState.currentProblemId = prob.id;
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', init);
