/* ═══════════════════════════════════════════════════════════
   data/data-manager.js — 학습지 JSON 저장 / 불러오기 / 초기화
═══════════════════════════════════════════════════════════ */

import {Store} from '../store/state.js';
import {ProblemEditor} from '../components/problem-editor.js';
import {Sidebar} from '../components/sidebar.js';
import {UI} from '../ui/modal.js';

export const DataMgr = {
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
