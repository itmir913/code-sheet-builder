/* ═══════════════════════════════════════════════════════════
   languages.js — 지원 프로그래밍 언어 레지스트리
   새 언어 추가 시 이 배열에만 항목을 추가하면 됨
═══════════════════════════════════════════════════════════ */

'use strict';

const LANGUAGES = [
    { id: 'c',      label: 'C',          monaco: 'c' },
    { id: 'python', label: 'Python',     monaco: 'python' },
    { id: 'java',   label: 'Java',       monaco: 'java' },
    { id: 'js',     label: 'JavaScript', monaco: 'javascript' },
];

/* id → monaco 언어 ID 매핑 (캐시) */
const LANG_MONACO_MAP = Object.fromEntries(LANGUAGES.map(l => [l.id, l.monaco]));

/* 기본 언어 ID */
const DEFAULT_LANG_ID = LANGUAGES[0].id;
