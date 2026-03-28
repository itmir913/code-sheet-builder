/* ============================================================
   10. SAMPLE DATA
   ============================================================ */

function addSampleProblem() {
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
    // 미리 설정된 마스크: "Hello, World!" (index 31..44)
    const sampleMaskText = 'Hello, World!';
    const sampleMaskStart = block.code.indexOf(sampleMaskText);
    if (sampleMaskStart !== -1) {
        block.masks = [{
            id: newId('mask'),
            blockId: block.id,
            start: sampleMaskStart,
            end: sampleMaskStart + sampleMaskText.length,
            type: 'blank',
            text: sampleMaskText,
        }];
    }
    block.highlightLines = [4];

    prob.codeBlocks = [block];
    AppState.problems.push(prob);
    AppState.currentProblemId = prob.id;
}
