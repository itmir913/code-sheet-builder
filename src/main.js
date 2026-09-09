/* ═══════════════════════════════════════════════════════════
   main.js — 앱 진입점, 이벤트 바인딩, 상태 구독
═══════════════════════════════════════════════════════════ */

/* 폰트와 스타일을 여기서 불러온다. 예전에는 index.html 이 Google Fonts CDN 을
 * 가리켰는데, 오프라인 zip 은 네트워크 없이 열리므로 그때 폰트가 통째로 빠졌다.
 * npm 패키지로 받아 번들에 넣으면 온라인/오프라인이 같은 화면이 된다.
 * (--font-display 가 첫째로 부르는 Gmarket Sans 는 재배포 가능한 형태로 구할 수
 *  없어 넣지 않는다. 설치돼 있으면 쓰이고, 없으면 Plus Jakarta Sans 로 내려간다.) */
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '@fontsource/dm-mono/latin-400-italic.css';

import './styles/styles.css';
import './styles/monaco-masks.css';

import {LANGUAGES} from './languages.js';
import {Store} from './store/state.js';
import {setMonacoTheme} from './monaco/setup.js';
import {ProblemEditor, MaskPopup} from './components/problem-editor.js';
import {Sidebar} from './components/sidebar.js';
import {PrintMgr} from './components/print.js';
import {DataMgr} from './data/data-manager.js';
import {UI} from './ui/modal.js';

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
        // design-panel은 기본값 접힘, 나머지는 열림
        if (targetId !== 'design-panel') {
            panel.classList.add('open');
            btn.classList.add('open');
        }
    });
}

/* ═══════════════════════════════════════
   RENDER — subscribe to store
═══════════════════════════════════════ */
function renderAll() {
    Sidebar.render();
    ProblemEditor.render();
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

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
    const langSelect = document.getElementById('ws-default-lang');
    LANGUAGES.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.label;
        langSelect.appendChild(opt);
    });

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

    langSelect.addEventListener('change', () => {
        Store.dispatch({type: 'WS_SET_FIELD', field: 'defaultLang', value: langSelect.value});
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

    document.getElementById('set-code-theme')?.addEventListener('change', e => {
        const theme = e.target.value;
        Store.dispatch({type: 'SET_SETTING', key: 'codeTheme', value: theme});
        setMonacoTheme(theme);
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

    /* ── Sidebar Toggle ── */
    document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
        document.getElementById('workspace').classList.toggle('sidebar-hidden');
    });

    /* ── Initial render ── */
    Sidebar.syncWorksheetInfo();
    Sidebar.syncSettings();
    renderAll();
});
