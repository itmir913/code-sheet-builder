/* ═══════════════════════════════════════════════════════════
   main.js — 앱 진입점, 이벤트 바인딩, 상태 구독
═══════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════
   UI UTILITIES
═══════════════════════════════════════ */
const UI = {
    modal(title, message, buttons) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = `<p>${message}</p>`;
        const footer = document.getElementById('modal-footer');
        footer.innerHTML = '';

        if (buttons) {
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = `btn-sm ${b.cls || 'btn-sm'}`;
                btn.textContent = b.label;
                btn.addEventListener('click', () => {
                    document.getElementById('modal-overlay').style.display = 'none';
                    if (b.action) b.action();
                });
                footer.appendChild(btn);
            });
        } else {
            const ok = document.createElement('button');
            ok.className = 'btn-sm nav-btn-primary';
            ok.style.cssText = 'background:var(--indigo-500);border-color:var(--indigo-500);color:white;padding:6px 18px;';
            ok.textContent = '확인';
            ok.addEventListener('click', () => {
                document.getElementById('modal-overlay').style.display = 'none';
            });
            footer.appendChild(ok);
        }

        document.getElementById('modal-overlay').style.display = 'flex';
    },

    confirm(message, onConfirm) {
        this.modal('확인', message, [
            {
                label: '취소', cls: 'btn-sm',
                action: null
            },
            {
                label: '확인', cls: 'btn-sm btn-sm-danger',
                action: onConfirm
            },
        ]);
    },
};

/* ═══════════════════════════════════════
   DATA MANAGER
═══════════════════════════════════════ */
const DataMgr = {
    save() {
        const data = {version: '3.0', ...Store.toJSON(), exportedAt: new Date().toISOString()};
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codesheet_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    load(file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.problems) throw new Error('올바르지 않은 파일 형식입니다.');

                ProblemEditor.destroyAll();
                Store.dispatch({type: 'LOAD_STATE', data});

                Sidebar.syncWorksheetInfo();
                Sidebar.syncSettings();
            } catch (err) {
                UI.modal('오류', '파일을 읽을 수 없습니다: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    reset() {
        ProblemEditor.destroyAll();
        Store.dispatch({type: 'RESET'});
        Sidebar.syncWorksheetInfo();
        Sidebar.syncSettings();
    },
};

/* ═══════════════════════════════════════
   ACCORDION
═══════════════════════════════════════ */
function initAccordion() {
    document.querySelectorAll('.accordion-trigger').forEach(btn => {
        const targetId = btn.dataset.target;
        const panel = document.getElementById(targetId);
        btn.addEventListener('click', () => {
            const open = panel.classList.toggle('open');
            btn.classList.toggle('open', open);
        });
        // Open by default
        panel.classList.add('open');
        btn.classList.add('open');
    });
}

/* ═══════════════════════════════════════
   RENDER — subscribe to store
═══════════════════════════════════════ */
function renderAll(state, action) {
    Sidebar.render();
    ProblemEditor.render();
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    /* Monaco */
    initMonaco();

    /* Accordion */
    initAccordion();

    /* Subscribe to store */
    Store.subscribe(renderAll);

    /* ── Toolbar ── */
    document.getElementById('btn-new').addEventListener('click', () => {
        UI.confirm('현재 작업을 초기화하고 새 학습지를 만들까요?', () => DataMgr.reset());
    });

    document.getElementById('btn-save').addEventListener('click', () => DataMgr.save());

    document.getElementById('btn-load').addEventListener('click', () => {
        UI.confirm('데이터를 불러오면 현재 작업 중인 내용이 초기화됩니다. 계속하시겠습니까?', () => {
            document.getElementById('file-input').click();
        });
    });

    document.getElementById('file-input').addEventListener('change', e => {
        if (e.target.files[0]) {
            DataMgr.load(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('btn-print').addEventListener('click', () => PrintMgr.print());

    /* ── View toggle ── */
    document.getElementById('btn-view-student').addEventListener('click', () => {
        Store.dispatch({type: 'SET_VIEW_MODE', mode: 'student'});
        document.getElementById('btn-view-student').classList.add('active');
        document.getElementById('btn-view-answer').classList.remove('active');
    });

    document.getElementById('btn-view-answer').addEventListener('click', () => {
        Store.dispatch({type: 'SET_VIEW_MODE', mode: 'answer'});
        document.getElementById('btn-view-answer').classList.add('active');
        document.getElementById('btn-view-student').classList.remove('active');
    });

    /* ── Add problem ── */
    document.getElementById('btn-add-problem').addEventListener('click', () => {
        Store.dispatch({type: 'ADD_PROBLEM'});
    });

    /* ── Worksheet info ── */
    const wsFields = {
        'ws-title': 'title',
        'ws-subject': 'subject',
        'ws-grade': 'grade',
        'ws-date': 'date',
    };
    Object.entries(wsFields).forEach(([id, field]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            Store.dispatch({type: 'WS_SET_FIELD', field, value: el.value});
        });
    });

    /* ── Settings ── */
    const bindSlider = (id, valId, key, unit, parse) => {
        const slider = document.getElementById(id);
        const valEl = document.getElementById(valId);
        if (!slider) return;
        slider.addEventListener('input', () => {
            const v = parse(slider.value);
            Store.dispatch({type: 'SET_SETTING', key, value: v});
            if (valEl) valEl.textContent = v + unit;
        });
    };

    bindSlider('set-font-size', 'set-font-size-val', 'fontSize', 'pt', parseInt);
    bindSlider('set-line-height', 'set-line-height-val', 'lineHeight', '', parseFloat);
    bindSlider('set-answer-lines', 'set-answer-lines-val', 'answerLines', '줄', parseInt);

    document.getElementById('set-layout').addEventListener('change', e => Store.dispatch({
        type: 'SET_SETTING',
        key: 'layout',
        value: e.target.value
    }));
    document.getElementById('set-code-theme').addEventListener('change', e => {
        const theme = e.target.value;
        Store.dispatch({
            type: 'SET_SETTING',
            key: 'codeTheme',
            value: theme
        });

        // Monaco 에디터가 로드되어 있는 경우 즉시 전역 테마 업데이트
        if (window.monaco && window.monaco.editor) {
            window.monaco.editor.setTheme(theme);
        }
    });
    document.getElementById('set-margin').addEventListener('input', e => Store.dispatch({
        type: 'SET_SETTING',
        key: 'margin',
        value: parseInt(e.target.value, 10) || 15
    }));

    /* ── Modal ── */
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    /* ── Mask popup ── */
    MaskPopup.bindButtons();

    /* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', e => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key === 's') {
            e.preventDefault();
            DataMgr.save();
        }
        if (mod && e.key === 'p') {
            e.preventDefault();
            PrintMgr.print();
        }
        if (mod && e.key === 'n') {
            e.preventDefault();
            Store.dispatch({type: 'ADD_PROBLEM'});
        }
        if (e.key === 'Escape') {
            document.getElementById('modal-overlay').style.display = 'none';
            MaskPopup.hide();
        }
    });

    /* ── Initial render ── */
    Sidebar.syncWorksheetInfo();
    Sidebar.syncSettings();
    renderAll(Store.state, {type: 'INIT'});
});
