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
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter') ProblemMgr.select(el.dataset.id);
            });
        });

        const el = document.getElementById('problem-list');
        Sortable.create(el, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
                // 실제 데이터 배열 순서 재정렬 (기존 로직 안 깨짐)
                const movedItem = AppState.problems.splice(evt.oldIndex, 1)[0];
                AppState.problems.splice(evt.newIndex, 0, movedItem);
                PreviewMgr.render(); // 순서 바뀐대로 미리보기 갱신
            }
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
        const editor = document.getElementById('problem-editor');
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
        document.getElementById('prob-title').value = prob.title;
        document.getElementById('prob-description').value = prob.description;
        document.getElementById('prob-hint').value = prob.hint;
        document.getElementById('prob-answer').value = prob.answer;

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
            const pairs = {'(': ')', '[': ']', '{': '}'};
            if (pairs[e.key]) {
                e.preventDefault();
                const s = textarea.selectionStart, end = textarea.selectionEnd;
                const sel = textarea.value.slice(s, end);
                if (sel) {
                    textarea.value = textarea.value.slice(0, s) + e.key + sel + pairs[e.key] + textarea.value.slice(end);
                    textarea.selectionStart = s + 1;
                    textarea.selectionEnd = end + 1;
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
            end: rawOffsets.end,
            text: block.code.slice(rawOffsets.start, rawOffsets.end),
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
            const len = node.textContent.length;

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
                endOffset = charCount + range.endOffset;
                break;
            }
            charCount += len;
        }

        if (startOffset === -1 || endOffset === -1) return null;
        if (startOffset === endOffset) return null;
        return {start: Math.min(startOffset, endOffset), end: Math.max(startOffset, endOffset)};
    },

    /**
     * [B4 FIX] 렌더링된 HTML offset → 원본 code string offset으로 역변환
     * 마스크 스팬들이 원본 텍스트를 대체하고 있으므로 누적 보정 필요
     */
    _mapToRawOffsets(block, htmlOffsets) {
        /* 마스크가 없으면 그대로 */
        if (!block.masks.length) {
            return {start: htmlOffsets.start, end: htmlOffsets.end};
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
            const nextRaw = rawPos + rawLen;

            if (rawStart === -1 && htmlOffsets.start >= htmlPos && htmlOffsets.start < nextHtml) {
                rawStart = rawPos + (htmlOffsets.start - htmlPos);
            }
            if (rawEnd === -1 && htmlOffsets.end >= htmlPos && htmlOffsets.end <= nextHtml) {
                rawEnd = rawPos + (htmlOffsets.end - htmlPos);
            }

            htmlPos = nextHtml;
            rawPos = nextRaw;
        };

        while (maskIdx <= sortedMasks.length) {
            const mask = sortedMasks[maskIdx];
            const maskStart = mask ? mask.start : block.code.length;

            /* 이 마스크 이전의 일반 텍스트 구간 */
            const plainRawLen = maskStart - rawPos;
            if (plainRawLen > 0) advance(plainRawLen, plainRawLen);

            if (!mask) break;

            /* 마스크 구간: html에서는 placeholder 길이만큼 차지 */
            const maskRawLen = mask.end - mask.start;
            const maskHtmlLen = AppState.viewMode === 'answer'
                ? maskRawLen   // 정답 모드는 원본 텍스트 표시
                : Math.max(maskRawLen, 4); // 학생 모드는 언더바 (최소 4)

            advance(maskHtmlLen, maskRawLen);
            maskIdx++;
        }

        if (rawStart === -1) rawStart = rawPos;
        if (rawEnd === -1) rawEnd = rawPos;

        rawStart = Math.max(0, Math.min(rawStart, block.code.length));
        rawEnd = Math.max(0, Math.min(rawEnd, block.code.length));
        if (rawStart >= rawEnd) return null;

        return {start: rawStart, end: rawEnd};
    },

    _showSelectionPopup(range, prob) {
        const popup = document.getElementById('selection-popup');
        const rect = range.getBoundingClientRect();
        const top = Math.max(rect.top + window.scrollY - 50, 10);
        const left = Math.max(rect.left + window.scrollX, 10);

        popup.style.top = `${top}px`;
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
        const wrap = document.createElement('div');
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
        <span class="mask-item-type ${mask.type}">${{blank: '빈칸', comment: '주석', hidden: '숨김'}[mask.type]}</span>
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
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('set-font-size', s.fontSize);
        setVal('set-line-height', s.lineHeight);
        setVal('set-layout', s.layout);
        setVal('set-code-theme', s.codeTheme);
        setVal('set-margin', s.margin);
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
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };
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
            {label: '취소', cls: 'btn-ghost', action: null},
            {label: '확인', cls: 'btn-danger', action: onConfirm},
        ]);
    },
};
