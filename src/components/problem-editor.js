/* ═══════════════════════════════════════════════════════════
   components/problem-editor.js
   Monaco Editor 기반 문제 편집기
═══════════════════════════════════════════════════════════ */

import {monaco, monacoTheme} from '../monaco/setup.js';
import {LANGUAGES, LANG_MONACO_MAP} from '../languages.js';
import {Store, TYPE_LABELS} from '../store/state.js';
import {MaskService} from '../services/mask.service.js';
import {UI} from '../ui/modal.js';
import {esc, ownLabel} from '../utils/html.js';

/* Monaco instance map: blockId → { editor, decorations[], probId, pendingTimer } */
const _monacoInstances = new Map();

/* 가리기 목록 배지 문구. 표로 두는 이유는 조회를 ownLabel 로 감싸기 위해서다 -
 * 인라인 객체를 대괄호로 조회하면 type 이 'constructor' 인 파일 하나에
 * 함수 소스가 배지로 찍힌다. */
const MASK_TYPE_LABELS = {blank: '빈칸', comment: '주석', hidden: '숨김'};

/* 예전에는 AMD 로더가 Monaco 를 비동기로 가져왔기 때문에, 에디터를 만들려는
 * 호출을 큐에 쌓아 두었다가 로딩이 끝나면 흘려보내야 했다. 이제는 번들에 들어
 * 있어 첫 렌더 시점에 이미 준비돼 있으므로 큐가 필요 없다. */

/* ═══════════════════════════════════════════
   ProblemEditor — renders the main canvas
═══════════════════════════════════════════ */
export const ProblemEditor = {

    /* Called on any state change */
    render() {
        const {problems, currentProblemId} = Store.state;
        const welcome = document.getElementById('canvas-welcome');
        const canvas = document.getElementById('problems-canvas');
        if (!canvas) return;

        if (welcome) welcome.style.display = problems.length ? 'none' : '';
        canvas.style.display = problems.length ? '' : 'none';

        /* 문제가 하나도 없을 때도 _syncCards 를 지난다. 예전에는 여기서 바로
         * 나가는 바람에 마지막 문제를 지워도 정리 루프가 돌지 않아, 캔버스에
         * 카드가 남고 Monaco 인스턴스도 살아 있었다. */
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
                const el = canvas.querySelector(`[data-prob-id="${CSS.escape(id)}"]`);
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
            let card = canvas.querySelector(`[data-prob-id="${CSS.escape(prob.id)}"]`);
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
              ${LANGUAGES.map(l =>
                `<button class="lang-btn ${prob.lang === l.id ? 'active' : ''}" data-lang="${l.id}">${l.label}</button>`
              ).join('')}
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
            /* 복제는 상태를 통째로 베낀다. 디바운스에 걸린 코드를 먼저 넣지
             * 않으면 복사본만 고치기 전 코드로 굳는다. */
            this.flushPending();
            Store.dispatch({type: 'DUPLICATE_PROBLEM', id: probId});
        });
    },

    /* ─────────────────────────────────────────────
       Update existing card header (avoid full re-render)
    ───────────────────────────────────────────── */
    _updateCardHeader(card, prob, idx, isActive) {
        const numEl = card.querySelector('[data-num]');
        if (numEl) numEl.textContent = `Q${idx + 1}`;

        /* 입력 칸은 만들 때 한 번만 값이 들어갔다. 그래서 파일을 불러와 카드가
         * 재사용되면 상태에는 새 값, 화면에는 옛 값이 남았고, 그 칸을 한 글자만
         * 고쳐도 화면의 옛 값이 상태를 덮어썼다. 포커스가 가 있는 칸은 건드리지
         * 않는다 - 타이핑 중에 커서가 튄다. */
        const syncInput = (sel, value) => {
            const el = card.querySelector(sel);
            if (el && document.activeElement !== el) el.value = value ?? '';
        };
        syncInput('[data-title-input]', prob.title);
        syncInput('[data-desc]', prob.description);
        syncInput('[data-hint]', prob.hint);
        syncInput('[data-answer]', prob.answer);

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
                list.querySelector(`[data-block-id="${CSS.escape(bid)}"]`)?.remove();
            }
        });

        // Add / update
        prob.codeBlocks.forEach((block, bi) => {
            let blockEl = list.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
            if (!blockEl) {
                blockEl = this._buildBlockEl(prob.id, block);
                list.appendChild(blockEl);
            } else {
                // Update mode toggle active state
                blockEl.querySelectorAll('.mode-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.mode === block.editorMode);
                });
                const langLabel = blockEl.querySelector('.code-block-lang');
                if (langLabel) langLabel.textContent = String(block.lang ?? '').toUpperCase();

                // 블록 제목도 만들 때 한 번만 값이 들어갔다 - 불러오기 뒤에 어긋난다.
                const titleEl = blockEl.querySelector('[data-block-title]');
                if (titleEl && document.activeElement !== titleEl) titleEl.value = block.title ?? '';

                // If editorMode changed, rebuild content area
                const contentEl = blockEl.querySelector('[data-block-content]');
                const currentMode = contentEl?.dataset.currentMode;
                /* 편집 모드인데 인스턴스가 없으면 껍데기만 남은 상자다. 불러오기가
                 * destroyAll() 로 에디터를 없앤 뒤 카드를 재사용하면 모드가 같아
                 * 재구성 분기를 타지 않고, 아래 edit 분기도 인스턴스가 없어 아무
                 * 일도 하지 않아서 에디터가 영영 되살아나지 않았다. */
                const editorGone = block.editorMode === 'edit' && !_monacoInstances.has(block.id);
                if (currentMode !== block.editorMode || editorGone) {
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
                        /* _rebuildBlockContent 는 목록을 '강조 줄' 앞에 넣는다.
                         * 여기서 끝에 붙이면 첫 마스크를 만드는 순간 목록이
                         * 아래로 내려갔다가, 모드를 왕복하면 다시 올라온다. */
                        blockEl.insertBefore(this._buildMaskList(prob.id, block), blockEl.querySelector('.hl-row'));
                    }
                } else if (block.editorMode === 'edit') {
                    // Update Monaco decorations and Language
                    const inst = _monacoInstances.get(block.id);
                    if (inst && monaco) {
                        const model = inst.editor.getModel();

                        // 1. [핵심] 언어 상태 자동 동기화
                        const langMap = LANG_MONACO_MAP;
                        const targetLang = langMap[block.lang] || 'c';

                        if (model.getLanguageId() !== targetLang) {
                            monaco.editor.setModelLanguage(model, targetLang);
                        }

                        // 2. 마스크(데코레이션) 갱신
                        const decors = MaskService.getMaskDecorations(monaco, model, block.masks, Store.state.viewMode);
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
        <span class="code-block-lang">${esc(String(block.lang ?? '').toUpperCase())}</span>
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
            /* 아직 디바운스에 걸려 있는 코드를 먼저 반영한다. 안 하면 방금
             * 붙여넣은 코드가 없는 것으로 보여 아래 경고가 헛돌고, 모드가
             * 바뀔 때 에디터가 파괴되면서 그 코드가 사라진다. */
            this.flushPending(block.id);
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
      <input type="text" class="hl-input" data-hl-input value="${esc((block.highlightLines || []).join(', '))}" placeholder="예: 3, 5" />
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

        /* setTimeout 으로 한 틱 미루는 이유는 이 wrap 이 아직 DOM 에 붙기 전이기
         * 때문이다. 부착 전에 monaco.editor.create() 를 부르면 크기를 0 으로 재고
         * 커서 위치 계산이 어긋난다. */
        setTimeout(() => {
            // 1. [핵심 방어] DOM 트리에 부착되지 않은(삭제된) 엘리먼트이거나,
            //    해당 문제(probId)나 블록(block.id)이 Store에서 이미 삭제되었다면 에디터 생성을 취소함
            // 정상적인 취소 경로다 - 만드는 사이에 블록이 사라졌을 뿐이다.
            if (!wrap.isConnected || !Store.getBlock(probId, block.id)) return;

            const existing = _monacoInstances.get(block.id);
            if (existing) {
                existing.editor.layout();
                return;
            }

            const langMap = LANG_MONACO_MAP;
            const lang = langMap[block.lang] || 'c';

            const editor = monaco.editor.create(wrap, {
                value: block.code,
                language: lang || 'c',
                theme: monacoTheme(Store.state.settings.codeTheme),
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
                    /* 이 에디터가 아직 살아 있고 그 사이에 다른 인스턴스로
                     * 바뀌지도 않았는지 본다. dispose 된 에디터의 getValue() 는
                     * 빈 문자열을 주므로, 확인 없이 쓰면 코드를 지워 버린다. */
                    const _inst = _monacoInstances.get(block.id);
                    if (!_inst || _inst.editor !== editor) return;
                    const code = editor.getValue();

                    /* 블록이 사라졌으면 멈춘다. 예전에는 이 가드가 뒤집혀 있어서
                     * 삭제된 블록의 타이머가 늦게 터지면 없는 블록에 dispatch 했다. */
                    const currentBlock = Store.getBlock(probId, block.id);
                    if (!currentBlock || currentBlock.code === code) return;

                    Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId, blockId: block.id, code});

                    // 데코레이션(마스크) 재적용
                    const updatedBlk = Store.getBlock(probId, block.id);
                    if (updatedBlk && monaco) {
                        const decors = MaskService.getMaskDecorations(monaco, editor.getModel(), updatedBlk.masks, Store.state.viewMode);
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
            const decors = blk ? MaskService.getMaskDecorations(monaco, editor.getModel(), blk.masks, Store.state.viewMode) : [];
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

        const rect = range.getBoundingClientRect();
        Store.dispatch({type: 'SET_PENDING_MASK', data: {probId, blockId, ...rawOffsets}});
        MaskPopup.show(rect);
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
        <span class="mask-badge ${esc(mask.type)}">${esc(ownLabel(MASK_TYPE_LABELS, mask.type))}</span>
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
       디바운스 대기분을 스토어에 밀어 넣는다

       Monaco 의 값은 500ms 디바운스를 지나야 상태에 들어간다. 저장·인쇄·복제는
       상태만 읽으므로 그 사이에 친 코드를 통째로 놓친다. 모드 전환도 마찬가지라,
       코드를 붙여넣고 바로 '가리기' 를 누르면 "먼저 코드를 입력하세요" 라는
       틀린 경고가 떴다.

       반드시 dispatch 바깥에서 부른다. 예전에는 이 일을 _destroyMonaco 가 했는데
       그 함수는 render() 안에서만 불리고 render() 는 알림 안에서만 도니, 그
       dispatch 가 재진입 가드에 걸려 100% 버려졌다. 사용자가 방금 친 코드를
       지키는 유일한 경로가 도달 불가능한 죽은 코드였던 셈이다.
    ───────────────────────────────────────────── */
    flushPending(blockId) {
        const flushOne = (id, inst) => {
            /* 앞선 flush 가 일으킨 렌더링이 이 인스턴스를 갈아치웠을 수 있다.
             * dispose 된 에디터의 getValue() 는 빈 문자열이라 코드를 지운다. */
            if (_monacoInstances.get(id) !== inst) return;
            clearTimeout(inst.pendingTimer);
            inst.pendingTimer = null;

            const code = inst.editor.getValue();
            const block = Store.getBlock(inst.probId, id);
            if (block && block.code !== code) {
                Store.dispatch({type: 'UPDATE_BLOCK_CODE', probId: inst.probId, blockId: id, code});
            }
        };

        if (blockId !== undefined) {
            const inst = _monacoInstances.get(blockId);
            if (inst) flushOne(blockId, inst);
            return;
        }
        // dispatch 가 목록을 바꿀 수 있으므로 스냅숏을 떠 놓고 돈다.
        [..._monacoInstances].forEach(([id, inst]) => flushOne(id, inst));
    },

    /* ─────────────────────────────────────────────
       Monaco cleanup
    ───────────────────────────────────────────── */
    _destroyMonaco(blockId) {
        const inst = _monacoInstances.get(blockId);
        if (inst) {
            /* 여기서 flush 하지 않는다 - 이 함수는 알림 안에서만 불린다.
             * 반영이 필요한 자리에서는 미리 flushPending() 을 부를 것. */
            clearTimeout(inst.pendingTimer);
            inst.editor.dispose();
            _monacoInstances.delete(blockId);
        }
    },

    destroyAll() {
        _monacoInstances.forEach(inst => {
            // 타이머를 남겨 두면 파괴된 에디터의 콜백이 나중에 깨어난다.
            clearTimeout(inst.pendingTimer);
            inst.editor.dispose();
        });
        _monacoInstances.clear();
    },
};

/* ═══════════════════════════════════════
   MASK POPUP
═══════════════════════════════════════ */
export const MaskPopup = {
    show(rect) {
        const popup = document.getElementById('mask-popup');
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
