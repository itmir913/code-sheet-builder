/* ═══════════════════════════════════════════════════════════
   components/problem-editor.js
   Monaco Editor 기반 문제 편집기
═══════════════════════════════════════════════════════════ */

'use strict';

/* Monaco 전역 참조 */
let _monaco = null;

/* Monaco instance map: blockId → { editor, decorations[] } */
const _monacoInstances = new Map();

/* Monaco 로딩 상태 */
let _monacoReady = false;
const _monacoQueue = [];

function ensureMonaco(cb) {
    if (_monacoReady) {
        cb();
        return;
    }
    _monacoQueue.push(cb);
}

/* Monaco 초기화 */
function initMonaco() {
    require.config({paths: {vs: './lib/monaco-editor/min/vs'}});

    require(['vs/editor/editor.main'], (monaco) => {
        _monaco = monaco;

        // 커스텀 마스크 스타일 주입
        const style = document.createElement('style');
        style.textContent = `
      .monaco-mask-blank {
        background: rgba(99,102,241,.18);
        border-bottom: 2px solid #818cf8;
        color: transparent;
        border-radius: 2px;
      }
      .monaco-mask-comment {
        background: rgba(251,191,36,.18);
        color: #f59e0b;
        border-radius: 2px;
        font-style: italic;
      }
      .monaco-mask-hidden {
        background: rgba(239,68,68,.18);
        color: transparent;
        border-radius: 2px;
      }
      .monaco-mask-answer {
        background: #fef9c3;
        color: #92400e;
        border-bottom: 2px solid #ca8a04;
        border-radius: 2px;
        font-weight: 700;
      }
    `;
        document.head.appendChild(style);

        _monacoReady = true;
        _monacoQueue.forEach(fn => fn());
        _monacoQueue.length = 0;
    });
}

/* ═══════════════════════════════════════════
   ProblemEditor — renders the main canvas
═══════════════════════════════════════════ */
const ProblemEditor = {

    /* Called on any state change */
    render() {
        const {problems, currentProblemId} = Store.state;
        const welcome = document.getElementById('canvas-welcome');
        const canvas = document.getElementById('problems-canvas');
        if (!canvas) return;

        if (!problems.length) {
            if (welcome) welcome.style.display = '';
            canvas.style.display = 'none';
            return;
        }

        if (welcome) welcome.style.display = 'none';
        canvas.style.display = '';

        // Diff-render: only update changed cards
        this._syncCards(problems, currentProblemId);
    },

    /* ─────────────────────────────────────────────
       _syncCards: minimal DOM update strategy
    ───────────────────────────────────────────── */
    _syncCards(problems, activeProbId) {
        const canvas = document.getElementById('problems-canvas');

        // Remove cards for deleted problems
        const existingIds = new Set(
            [...canvas.querySelectorAll('.problem-card')].map(el => el.dataset.probId)
        );
        const currentIds = new Set(problems.map(p => p.id));
        existingIds.forEach(id => {
            if (!currentIds.has(id)) {
                const el = canvas.querySelector(`[data-prob-id="${id}"]`);
                if (el) {
                    // cleanup monaco instances
                    el.querySelectorAll('[data-block-id]').forEach(be => {
                        this._destroyMonaco(be.dataset.blockId);
                    });
                    el.remove();
                }
            }
        });

        // Insert / reorder / update
        problems.forEach((prob, idx) => {
            let card = canvas.querySelector(`[data-prob-id="${prob.id}"]`);
            const isActive = prob.id === activeProbId;

            if (!card) {
                card = this._buildCard(prob, idx);
                canvas.appendChild(card);
            } else {
                this._updateCardHeader(card, prob, idx, isActive);
                this._syncBlocksInCard(card, prob);
            }

            card.classList.toggle('is-active', isActive);

            // Ensure correct DOM order
            const ref = canvas.children[idx];
            if (ref !== card) {
                canvas.insertBefore(card, ref || null);
            }
        });
    },

    /* ─────────────────────────────────────────────
       Build full problem card DOM
    ───────────────────────────────────────────── */
    _buildCard(prob, idx) {
        const card = document.createElement('div');
        card.className = 'problem-card fade-in';
        card.dataset.probId = prob.id;

        card.innerHTML = `
      <div class="prob-card-header">
        <div class="prob-card-num" data-num>Q${idx + 1}</div>
        <input class="prob-card-title-input" type="text" value="${esc(prob.title)}" placeholder="문제 제목..." spellcheck="false" data-title-input />
        <div class="prob-card-actions">
          <button class="btn-sm btn-sm-ghost" data-action="dup" title="복제">복제</button>
          <button class="btn-sm btn-sm-danger" data-action="del" title="삭제">삭제</button>
        </div>
      </div>

      <div class="prob-card-body">
        <div class="prob-type-row">
          <div class="type-group">
            <span class="mini-label">문제 유형</span>
            <div class="type-btn-group" data-type-group>
              ${['fill', 'output', 'error', 'order'].map(t =>
            `<button class="type-btn ${prob.type === t ? 'active' : ''}" data-type="${t}">${TYPE_LABELS[t]}</button>`
        ).join('')}
            </div>
          </div>
          <div class="type-group">
            <span class="mini-label">언어</span>
            <div class="lang-btn-group" data-lang-group>
              <button class="lang-btn ${prob.lang === 'c' ? 'active' : ''}" data-lang="c">C</button>
              <button class="lang-btn ${prob.lang === 'python' ? 'active' : ''}" data-lang="python">Python</button>
              <button class="lang-btn ${prob.lang === 'java' ? 'active' : ''}" data-lang="java">Java</button>
              <button class="lang-btn ${prob.lang === 'js' ? 'active' : ''}" data-lang="js">JavaScript</button>
            </div>
          </div>
        </div>

        <textarea class="prob-desc-input" placeholder="문제 설명을 입력하세요..." rows="2" data-desc>${esc(prob.description)}</textarea>
        <input class="prob-desc-input" style="resize:none;" type="text" placeholder="💡 힌트 (선택)" data-hint value="${esc(prob.hint)}" />

        <div class="code-blocks-section" data-blocks>
          <div class="code-blocks-header">
            <span class="code-blocks-label">코드 블록</span>
            <button class="btn-add-block" data-add-block>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              블록 추가
            </button>
          </div>
          <div class="code-blocks-list" data-blocks-list></div>
        </div>

        <div class="answer-section">
          <label>정답 / 해설</label>
          <textarea class="prob-desc-input" placeholder="정답 또는 해설 (정답지 모드에서만 표시)" rows="2" data-answer>${esc(prob.answer)}</textarea>
        </div>
      </div>
    `;

        this._bindCardEvents(card, prob);
        this._renderBlocksInCard(card, prob);

        return card;
    },

    /* ─────────────────────────────────────────────
       Bind events on card
    ───────────────────────────────────────────── */
    _bindCardEvents(card, prob) {
        const probId = prob.id;

        // 옵셔널 체이닝(?.)을 사용하여 요소가 존재할 때만 이벤트 리스너를 등록합니다.

        // Click → select
        card.addEventListener('mousedown', () => {
            if (Store.state.currentProblemId !== probId) {
                Store.dispatch({type: 'SELECT_PROBLEM', id: probId});
            }
        });

        // Title input
        card.querySelector('[data-title-input]')?.addEventListener('input', e => {
            Store.dispatch({type: 'UPDATE_PROBLEM', id: probId, field: 'title', value: e.target.value});
        });

        // Description
        card.querySelector('[data-desc]')?.addEventListener('input', e => {
            Store.dispatch({type: 'UPDATE_PROBLEM', id: probId, field: 'description', value: e.target.value});
        });

        // Hint
        card.querySelector('[data-hint]')?.addEventListener('input', e => {
            Store.dispatch({type: 'UPDATE_PROBLEM', id: probId, field: 'hint', value: e.target.value});
        });

        // Answer
        card.querySelector('[data-answer]')?.addEventListener('input', e => {
            Store.dispatch({type: 'UPDATE_PROBLEM', id: probId, field: 'answer', value: e.target.value});
        });

        // Type buttons
        card.querySelector('[data-type-group]')?.addEventListener('click', e => {
            const btn = e.target.closest('.type-btn');
            if (!btn) return;
            Store.dispatch({type: 'UPDATE_PROBLEM', id: probId, field: 'type', value: btn.dataset.type});
        });

        // Lang buttons
        card.querySelector('[data-lang-group]')?.addEventListener('click', e => {
            const btn = e.target.closest('.lang-btn');
            if (!btn) return;
            Store.dispatch({type: 'UPDATE_PROB_LANG', id: probId, lang: btn.dataset.lang});
        });

        // Add block
        card.querySelector('[data-add-block]')?.addEventListener('click', () => {
            Store.dispatch({type: 'ADD_BLOCK', probId});
        });

        // Del / Dup
        card.querySelector('[data-action="del"]')?.addEventListener('click', () => {
            UI.confirm('이 문제를 삭제할까요?', () => {
                Store.dispatch({type: 'DELETE_PROBLEM', id: probId});
            });
        });

        card.querySelector('[data-action="dup"]')?.addEventListener('click', () => {
            Store.dispatch({type: 'DUPLICATE_PROBLEM', id: probId});
        });
    },

    /* ─────────────────────────────────────────────
       Update existing card header (avoid full re-render)
    ───────────────────────────────────────────── */
    _updateCardHeader(card, prob, idx, isActive) {
        const numEl = card.querySelector('[data-num]');
        if (numEl) numEl.textContent = `Q${idx + 1}`;

        // Sync title without disrupting focus
        const titleEl = card.querySelector('[data-title-input]');
        if (titleEl && document.activeElement !== titleEl) {
            titleEl.value = prob.title;
        }

        // Type buttons
        card.querySelectorAll('.type-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === prob.type);
        });
        card.querySelectorAll('.lang-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === prob.lang);
        });
    },

    /* ─────────────────────────────────────────────
       Sync code blocks inside existing card
    ───────────────────────────────────────────── */
    _syncBlocksInCard(card, prob) {
        const list = card.querySelector('[data-blocks-list]');
        if (!list) return;

        const existing = new Set([...list.querySelectorAll('[data-block-id]')].map(el => el.dataset.blockId));
        const current = new Set(prob.codeBlocks.map(b => b.id));

        // Remove deleted blocks
        existing.forEach(bid => {
            if (!current.has(bid)) {
                this._destroyMonaco(bid);
                list.querySelector(`[data-block-id="${bid}"]`)?.remove();
            }
        });

        // Add / update
        prob.codeBlocks.forEach((block, bi) => {
            let blockEl = list.querySelector(`[data-block-id="${block.id}"]`);
            if (!blockEl) {
                blockEl = this._buildBlockEl(prob.id, block);
                list.appendChild(blockEl);
            } else {
                // Update mode toggle active state
                blockEl.querySelectorAll('.mode-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.mode === block.editorMode);
                    const langLabel = blockEl.querySelector('.code-block-lang');
                    if (langLabel) langLabel.textContent = block.lang.toUpperCase();
                });

                // If editorMode changed, rebuild content area
                const contentEl = blockEl.querySelector('[data-block-content]');
                const currentMode = contentEl?.dataset.currentMode;
                if (currentMode !== block.editorMode) {
                    this._destroyMonaco(block.id);
                    this._rebuildBlockContent(blockEl, prob.id, block);
                } else if (block.editorMode === 'select') {
                    // Re-render masks
                    const pre = blockEl.querySelector('.select-code-pre');
                    if (pre) {
                        pre.innerHTML = MaskService.render(block.code, block.masks, Store.state.viewMode, block.highlightLines);
                    }
                    // Update mask list
                    const existingMaskList = blockEl.querySelector('.mask-list-wrap');
                    if (existingMaskList) existingMaskList.remove();
                    if (block.masks.length) {
                        blockEl.appendChild(this._buildMaskList(prob.id, block));
                    }
                } else if (block.editorMode === 'edit') {
                    // Update Monaco decorations and Language
                    const inst = _monacoInstances.get(block.id);
                    if (inst && typeof _monaco !== 'undefined' && _monaco) {
                        const model = inst.editor.getModel();

                        // 1. [핵심] 언어 상태 자동 동기화
                        const langMap = {c: 'c', python: 'python', java: 'java', js: 'javascript'};
                        const targetLang = langMap[block.lang] || 'c';

                        if (model.getLanguageId() !== targetLang) {
                            _monaco.editor.setModelLanguage(model, targetLang);
                            console.log(`[Monaco] 언어 자동 동기화 완료 - 대상 언어: ${targetLang}`);
                        }

                        // 2. 마스크(데코레이션) 갱신
                        const decors = MaskService.getMaskDecorations(_monaco, model, block.masks, Store.state.viewMode);
                        inst.decorations = inst.editor.deltaDecorations(inst.decorations || [], decors);
                    }
                }

                // Highlight input
                const hlInput = blockEl.querySelector('[data-hl-input]');
                if (hlInput && document.activeElement !== hlInput) {
                    hlInput.value = block.highlightLines.join(', ');
                }
            }

            // Ensure order
            const actualIdx = [...list.children].indexOf(blockEl);
            if (actualIdx !== bi) list.insertBefore(blockEl, list.children[bi] || null);
        });
    },

    _renderBlocksInCard(card, prob) {
        const list = card.querySelector('[data-blocks-list]');
        if (!list) return;
        list.innerHTML = '';
        prob.codeBlocks.forEach(block => {
            list.appendChild(this._buildBlockEl(prob.id, block));
        });
    },

    /* ─────────────────────────────────────────────
       Build single code block element
    ───────────────────────────────────────────── */
    _buildBlockEl(probId, block) {
        const el = document.createElement('div');
        el.className = 'code-block-item fade-in';
        el.dataset.blockId = block.id;

        const headerHTML = `
      <div class="code-block-header">
        <span class="code-block-lang">${block.lang.toUpperCase()}</span>
        <input class="code-block-title-input" type="text" value="${esc(block.title)}" placeholder="블록 제목" data-block-title />
        <div class="code-block-mode-group">
          <button class="mode-btn ${block.editorMode === 'edit' ? 'active' : ''}" data-mode="edit">편집</button>
          <button class="mode-btn ${block.editorMode === 'select' ? 'active' : ''}" data-mode="select">가리기</button>
        </div>
        <div class="code-block-actions">
          <button class="btn-icon-sm btn-icon-sm-danger" data-del-block title="삭제">✕</button>
        </div>
      </div>
    `;
        el.innerHTML = headerHTML;

        // Title input
        el.querySelector('[data-block-title]').addEventListener('input', e => {
            Store.dispatch({type: 'UPDATE_BLOCK', probId, blockId: block.id, field: 'title', value: e.target.value});
        });

        // Mode buttons
        el.querySelector('.code-block-mode-group').addEventListener('click', e => {
            const btn = e.target.closest('.mode-btn');
            if (!btn) return;
            const mode = btn.dataset.mode;
            const blk = Store.getBlock(probId, block.id);
            if (mode === 'select' && !blk?.code.trim()) {
                UI.modal('알림', '먼저 코드를 입력한 후 가리기 모드를 사용하세요.');
                return;
            }
            Store.dispatch({type: 'SET_BLOCK_MODE', probId, blockId: block.id, mode});
        });

        // Delete block
        el.querySelector('[data-del-block]').addEventListener('click', () => {
            const prob = Store.state.problems.find(p => p.id === probId);
            if (!prob) return;
            if (prob.codeBlocks.length <= 1) {
                UI.modal('알림', '최소 하나의 코드 블록이 필요합니다.');
                return;
            }
            UI.confirm('이 코드 블록을 삭제할까요?', () => {
                Store.dispatch({type: 'DELETE_BLOCK', probId, blockId: block.id});
            });
        });

        // Build content
        this._rebuildBlockContent(el, probId, block);

        return el;
    },

    /* ─────────────────────────────────────────────
       Rebuild content area of a block element
    ───────────────────────────────────────────── */
    _rebuildBlockContent(el, probId, block) {
        // Remove old content
        const old = el.querySelector('[data-block-content]');
        if (old) old.remove();
        const oldHL = el.querySelector('.hl-row');
        if (oldHL) oldHL.remove();
        const oldML = el.querySelector('.mask-list-wrap');
        if (oldML) oldML.remove();

        if (block.editorMode === 'edit') {
            const contentEl = this._buildEditContent(probId, block);
            el.appendChild(contentEl);
        } else {
            const contentEl = this._buildSelectContent(probId, block);
            el.appendChild(contentEl);

            if (block.masks.length) {
                el.appendChild(this._buildMaskList(probId, block));
            }
        }

        // Highlight row
        const hlRow = document.createElement('div');
        hlRow.className = 'hl-row';
        hlRow.innerHTML = `
      <span class="hl-label">강조 줄:</span>
      <input type="text" class="hl-input" data-hl-input value="${block.highlightLines.join(', ')}" placeholder="예: 3, 5" />
    `;
        hlRow.querySelector('[data-hl-input]').addEventListener('input', e => {
            const lines = [...new Set(
                e.target.value.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0)
            )];
            Store.dispatch({type: 'UPDATE_BLOCK', probId, blockId: block.id, field: 'highlightLines', value: lines});
        });
        el.appendChild(hlRow);
    },

    /* ─────────────────────────────────────────────
       Edit mode: Monaco Editor
    ───────────────────────────────────────────── */
    _buildEditContent(probId, block) {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-block-content', '');
        wrap.dataset.currentMode = 'edit';
        wrap.className = 'monaco-container';

        ensureMonaco(() => {
            setTimeout(() => {
                // 1. [핵심 방어] DOM 트리에 부착되지 않은(삭제된) 엘리먼트이거나,
                //    해당 문제(probId)나 블록(block.id)이 Store에서 이미 삭제되었다면 에디터 생성을 취소함
                if (!wrap.isConnected || !Store.getBlock(probId, block.id)) {
                    console.warn(`[Monaco] DOM에서 분리되거나 삭제된 블록에 대한 렌더링 취소 (블록 ID: ${block.id})`);
                    return;
                }

                const existing = _monacoInstances.get(block.id);
                if (existing) {
                    existing.editor.layout();
                    return;
                }

                const langMap = {c: 'c', python: 'python', java: 'java', js: 'javascript'};
                const lang = langMap[block.lang] || 'c';

                const editor = _monaco.editor.create(wrap, {
                    value: block.code,
                    language: lang || 'c',
                    theme: Store.state.settings.codeTheme || 'vs',
                    fontSize: 13,
                    fontFamily: "'DM Mono', monospace",
                    lineHeight: 21,
                    minimap: {enabled: false},

                    // 스크롤 관련 핵심 옵션
                    scrollBeyondLastLine: false,      // 코드 끝 공간 제거 (스크롤 끝 감지 정확도 향상)
                    alwaysConsumeMouseWheel: false,   // 끝에서 부모 스크롤 허용

                    // [추가] 위젯(자동완성 등)이 스크롤을 가로막지 않도록 설정
                    fixedOverflowWidgets: true,

                    automaticLayout: true,
                    wordWrap: 'off',
                    renderLineHighlight: 'line',
                    scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto',
                        verticalScrollbarSize: 6,
                        horizontalScrollbarSize: 6,
                        // [추가] 스크롤 시 부모 요소에 이벤트 전파 허용 설정
                        handleMouseWheel: true,
                    },
                    padding: {top: 10, bottom: 10},
                });

                // Sync height to content
                const updateHeight = () => {
                    const lineCount = editor.getModel().getLineCount();
                    const lineHeight = 21;
                    const padding = 20;
                    const minH = 120;
                    const h = Math.max(minH, lineCount * lineHeight + padding);
                    wrap.style.height = h + 'px';
                    editor.layout();
                };

                // 디바운스를 위한 타이머 변수
                let _codeUpdateTimer;

                editor.onDidChangeModelContent(() => {
                    // 1. 에디터 높이는 즉각적으로 반영 (사용자 경험 유지)
                    updateHeight();

                    // 2. 상태 업데이트(dispatch) 및 무거운 로직은 디바운싱 처리 (500ms)
                    clearTimeout(_codeUpdateTimer);
                    _codeUpdateTimer = setTimeout(() => {
                        const _inst = _monacoInstances.get(block.id);
                        if (!_inst) return; // 에디터가 이미 파괴된 경우 중단
                        const code = editor.getValue();

                        // 현재 상태와 동일하면 불필요한 렌더링 방지
                        const currentBlock = Store.getBlock(probId, block.id);
                        if (currentBlock && currentBlock.code === code) return;

                        Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId: block.id, code});

                        // 데코레이션(마스크) 재적용
                        const updatedBlk = Store.getBlock(probId, block.id);
                        if (updatedBlk && typeof _monaco !== 'undefined' && _monaco) {
                            const decors = MaskService.getMaskDecorations(_monaco, editor.getModel(), updatedBlk.masks, Store.state.viewMode);
                            const inst = _monacoInstances.get(block.id);
                            if (inst) {
                                inst.decorations = editor.deltaDecorations(inst.decorations || [], decors);
                            }
                        }
                    }, 500); // 300ms -> 500ms로 늘려 성능 최적화
                    const _instRef = _monacoInstances.get(block.id);
                    if (_instRef) _instRef.pendingTimer = _codeUpdateTimer;
                });

                // Initial height
                updateHeight();

                // Initial decorations
                const blk = Store.getBlock(probId, block.id);
                const decors = blk ? MaskService.getMaskDecorations(_monaco, editor.getModel(), blk.masks, Store.state.viewMode) : [];
                const decorIds = editor.deltaDecorations([], decors);

                _monacoInstances.set(block.id, {editor, decorations: decorIds, probId, pendingTimer: null});

                // ─────────────────────────────────────────────
                // [스크롤 브릿지] Monaco 경계 도달 시 부모로 스크롤 전파
                // ─────────────────────────────────────────────
                const editorDom = editor.getDomNode();
                if (editorDom) {
                    editorDom.addEventListener('wheel', (e) => {
                        const scrollTop = editor.getScrollTop();
                        const scrollHeight = editor.getScrollHeight();
                        const editorHeight = editor.getLayoutInfo().height;

                        const atTop = scrollTop <= 0 && e.deltaY < 0;
                        const atBottom = (scrollTop + editorHeight >= scrollHeight - 1) && e.deltaY > 0;

                        if (atTop || atBottom) {
                            // Monaco의 기본 처리를 막고, 스크롤을 부모에게 위임
                            e.preventDefault();
                            e.stopPropagation();

                            // 스크롤 가능한 가장 가까운 부모를 탐색하여 직접 스크롤
                            let scrolled = false;
                            let parent = wrap.parentElement;
                            while (parent && parent !== document.body) {
                                const overflowY = getComputedStyle(parent).overflowY;
                                if (overflowY === 'auto' || overflowY === 'scroll') {
                                    parent.scrollTop += e.deltaY;
                                    scrolled = true;
                                    break;
                                }
                                parent = parent.parentElement;
                            }

                            // fallback: 부모에서 못 찾으면 window 스크롤
                            if (!scrolled) {
                                window.scrollBy(0, e.deltaY);
                            }
                        }

                        // 경계가 아닐 때는 Monaco가 정상적으로 내부 스크롤 처리
                    }, {passive: false, capture: true}); // capture: true → Monaco보다 먼저 실행
                }

                // DOM 트리에 wrap이 완전히 삽입된 직후 레이아웃을 다시 계산하도록 유도
                setTimeout(() => {
                    editor.layout();
                }, 50);

            }, 50);
        });

        return wrap;
    },

    /* ─────────────────────────────────────────────
       Select (mask) mode: static <pre> with drag support
    ───────────────────────────────────────────── */
    _buildSelectContent(probId, block) {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-block-content', '');
        wrap.dataset.currentMode = 'select';
        wrap.className = 'select-mode-wrap';

        const hint = document.createElement('div');
        hint.className = 'select-mode-hint';
        hint.innerHTML = `✱ <strong>가리기 모드</strong> — 숨길 코드를 드래그하여 선택하세요`;
        wrap.appendChild(hint);

        const display = document.createElement('div');
        display.className = 'select-code-area';

        const lineNums = document.createElement('div');
        lineNums.className = 'select-line-nums';
        lineNums.textContent = MaskService.lineNumbers(block.code);
        display.appendChild(lineNums);

        const pre = document.createElement('pre');
        pre.className = 'select-code-pre';
        pre.dataset.blockId = block.id;
        pre.innerHTML = MaskService.render(block.code, block.masks, Store.state.viewMode, block.highlightLines);
        display.appendChild(pre);
        wrap.appendChild(display);

        // Selection handler
        pre.addEventListener('mouseup', () => {
            this._handleSelection(probId, block.id, pre);
        });

        return wrap;
    },

    /* ─────────────────────────────────────────────
       Handle text selection → show popup
    ───────────────────────────────────────────── */
    _handleSelection(probId, blockId, pre) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!pre.contains(range.commonAncestorContainer)) return;
        if (!sel.toString().trim()) return;

        const blk = Store.getBlock(probId, blockId);
        if (!blk) return;

        const htmlOffsets = MaskService.calcSelectionOffsets(pre, range);
        if (!htmlOffsets) return;

        const rawOffsets = MaskService.mapHtmlToRaw(blk, htmlOffsets, Store.state.viewMode);
        if (!rawOffsets) return;

        Store.dispatch({type: 'SET_PENDING_MASK', data: {probId, blockId, ...rawOffsets}});
        MaskPopup.show(range);
    },

    /* ─────────────────────────────────────────────
       Build mask list
    ───────────────────────────────────────────── */
    _buildMaskList(probId, block) {
        const wrap = document.createElement('div');
        wrap.className = 'mask-list-wrap';
        wrap.innerHTML = `<div class="mask-list-title">가리기 목록 (${block.masks.length}개)</div>`;

        const items = document.createElement('div');
        items.className = 'mask-items';

        block.masks.forEach(mask => {
            const preview = mask.text.replace(/\n/g, '↵').slice(0, 30) + (mask.text.length > 30 ? '…' : '');
            const item = document.createElement('div');
            item.className = 'mask-item';
            item.innerHTML = `
        <span class="mask-badge ${mask.type}">${{blank: '빈칸', comment: '주석', hidden: '숨김'}[mask.type]}</span>
        <span class="mask-text">${esc(preview)}</span>
        <button class="mask-del" title="마스크 제거">✕</button>
      `;
            item.querySelector('.mask-del').addEventListener('click', () => {
                Store.dispatch({type: 'REMOVE_MASK', probId, blockId: block.id, maskId: mask.id});
            });
            items.appendChild(item);
        });

        wrap.appendChild(items);
        return wrap;
    },

    /* ─────────────────────────────────────────────
       Monaco cleanup
    ───────────────────────────────────────────── */
    _destroyMonaco(blockId) {
        const inst = _monacoInstances.get(blockId);
        if (inst) {
            clearTimeout(inst.pendingTimer);
            // 디바운스 대기 중인 코드가 있으면 스토어에 즉시 반영
            const code = inst.editor.getValue();
            const currentBlock = Store.getBlock(inst.probId, blockId);
            if (currentBlock && currentBlock.code !== code) {
                Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId: inst.probId, blockId, code});
            }
            inst.editor.dispose();
            _monacoInstances.delete(blockId);
        }
    },

    destroyAll() {
        _monacoInstances.forEach((inst, id) => inst.editor.dispose());
        _monacoInstances.clear();
    },
};

/* ═══════════════════════════════════════
   MASK POPUP
═══════════════════════════════════════ */
const MaskPopup = {
    show(range) {
        const popup = document.getElementById('mask-popup');
        const rect = range.getBoundingClientRect();
        const top = Math.max(rect.top + window.scrollY - 52, 8);
        const left = Math.max(rect.left + window.scrollX, 8);

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.style.display = 'flex';
    },

    hide() {
        document.getElementById('mask-popup').style.display = 'none';
        Store.dispatch({type: 'CLEAR_PENDING_MASK'});
        window.getSelection()?.removeAllRanges();
    },

    bindButtons() {
        document.querySelectorAll('.mask-popup-btn[data-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pending = Store.state._pendingMask;
                if (pending) {
                    Store.dispatch({
                        type: 'ADD_MASK',
                        probId: pending.probId,
                        blockId: pending.blockId,
                        start: pending.start,
                        end: pending.end,
                        maskType: btn.dataset.type,
                    });

                    // Check for overlap error
                    const blk = Store.getBlock(pending.probId, pending.blockId);
                    if (blk?._maskError === 'overlap') {
                        UI.modal('알림', '선택한 영역이 이미 가려진 부분과 겹칩니다.');
                    }
                }
                this.hide();
            });
        });

        document.getElementById('mask-popup-cancel').addEventListener('click', () => this.hide());

        // Outside click
        document.addEventListener('mousedown', e => {
            const popup = document.getElementById('mask-popup');
            if (popup.style.display !== 'none' && !popup.contains(e.target)) {
                if (!e.target.closest('.select-code-pre')) this.hide();
            }
        });
    },
};
