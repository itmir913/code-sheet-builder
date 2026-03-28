/**
 * 코드 학습지 메이커 - main.js v2.0
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
        if (e.target.files[0]) {
            DataMgr.load(e.target.files[0]);
            e.target.value = '';
        }
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
    document.getElementById('btn-view-answer').addEventListener('click', () => setView('answer'));

    /* ── Problem list add ── */
    document.getElementById('btn-add-problem').addEventListener('click', () => ProblemMgr.add());

    /* ── Problem editor fields ── */
    document.getElementById('prob-title').addEventListener('input', e => ProblemMgr.updateField('title', e.target.value));
    document.getElementById('prob-description').addEventListener('input', e => ProblemMgr.updateField('description', e.target.value));
    document.getElementById('prob-hint').addEventListener('input', e => ProblemMgr.updateField('hint', e.target.value));
    document.getElementById('prob-answer').addEventListener('input', e => ProblemMgr.updateField('answer', e.target.value));

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
        const valEl = document.getElementById(valId);
        if (!slider) return;
        slider.addEventListener('input', () => {
            const v = parser(slider.value);
            AppState.settings[key] = v;
            if (valEl) valEl.textContent = v + unit;
            PreviewMgr.render();
        });
    };
    bindRange('set-font-size', 'set-font-size-val', 'fontSize', 'pt', parseInt);
    bindRange('set-line-height', 'set-line-height-val', 'lineHeight', '', parseFloat);
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
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            DataMgr.save();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            PrintMgr.print();
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