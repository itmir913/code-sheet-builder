/* ═══════════════════════════════════════════════════════════
   components/sidebar.js — 사이드바 + 문제 목록 D&D
═══════════════════════════════════════════════════════════ */

'use strict';

let _sortable = null;

const Sidebar = {
    render() {
        const {problems, currentProblemId} = Store.state;
        const list = document.getElementById('prob-list');
        if (!list) return;

        if (!problems.length) {
            list.innerHTML = '<div class="prob-list-empty">+ 버튼으로 첫 문제를 추가하세요</div>';
            if (_sortable) {
                _sortable.destroy();
                _sortable = null;
            }
            return;
        }

        list.innerHTML = problems.map((p, i) => `
      <div class="prob-item ${p.id === currentProblemId ? 'active' : ''}" data-prob-id="${p.id}">
        <span class="prob-item-handle" title="드래그하여 순서 변경">⠿</span>
        <span class="prob-item-num">Q${i + 1}</span>
        <div class="prob-item-info">
          <div class="prob-item-title">${esc(p.title)}</div>
          <div class="prob-item-meta">${TYPE_LABELS[p.type] || p.type} · ${p.lang.toUpperCase()}</div>
        </div>
        <button class="prob-item-del" data-del="${p.id}" title="삭제">✕</button>
      </div>
    `).join('');

        // Click to select
        list.querySelectorAll('.prob-item').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.closest('[data-del]')) return;

                const probId = el.dataset.probId; // 클릭한 문제의 ID 가져오기
                Store.dispatch({type: 'SELECT_PROBLEM', id: probId});

                // ─────────────────────────────────────────────
                // [추가] 해당 문제 카드로 스크롤 이동
                // ─────────────────────────────────────────────
                // CSS.escape()를 사용하여 잠재적인 CSS 선택자 인젝션 방어
                const targetCard = document.querySelector(`.problem-card[data-prob-id="${CSS.escape(probId)}"]`);
                if (targetCard) {
                    targetCard.scrollIntoView({
                        behavior: 'smooth', // 부드러운 스크롤 효과
                        block: 'start'      // 카드의 시작 부분이 화면 상단에 오도록 설정
                    });
                }
            });
        });

        // Delete buttons
        list.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                UI.confirm('이 문제를 삭제할까요?', () => {
                    Store.dispatch({type: 'DELETE_PROBLEM', id: btn.dataset.del});
                });
            });
        });

        // SortableJS D&D
        if (_sortable) _sortable.destroy();
        _sortable = Sortable.create(list, {
            animation: 180,
            handle: '.prob-item-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd(evt) {
                if (evt.oldIndex !== evt.newIndex) {
                    Store.dispatch({type: 'REORDER_PROBLEMS', from: evt.oldIndex, to: evt.newIndex});
                }
            },
        });
    },

    syncWorksheetInfo() {
        const ws = Store.state.worksheetInfo;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };
        set('ws-title', ws.title);
        set('ws-subject', ws.subject);
        set('ws-grade', ws.grade);
        set('ws-date', ws.date);
    },

    syncSettings() {
        const s = Store.state.settings;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        set('set-font-size', s.fontSize);
        set('set-line-height', s.lineHeight);
        set('set-layout', s.layout);
        set('set-code-theme', s.codeTheme);
        set('set-margin', s.margin);
        set('set-answer-lines', s.answerLines);

        const fsv = document.getElementById('set-font-size-val');
        const lhv = document.getElementById('set-line-height-val');
        const alv = document.getElementById('set-answer-lines-val');
        if (fsv) fsv.textContent = s.fontSize + 'pt';
        if (lhv) lhv.textContent = s.lineHeight;
        if (alv) alv.textContent = s.answerLines + '줄';
    },
};
