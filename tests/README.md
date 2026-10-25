# 브라우저 테스트

게임 실행에는 npm이 필요하지 않습니다. 아래는 개발 검증용입니다.

저장소 루트에서:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python -m http.server 8001
```

다른 터미널에서:

```sh
node tests/browser.cjs
node tests/orientation.cjs
node tests/result-panel.cjs
node tests/collection.cjs
node tests/giant-smash.cjs
node tests/difficulty.cjs
node tests/balance.cjs
node tests/backgrounds.cjs
node tests/background-style.cjs
```

기본 주소는 `http://127.0.0.1:8001`, `GAME_URL`로 변경할 수 있습니다. `CHROMIUM_PATH`로 브라우저 실행 파일을 지정할 수 있습니다. Linux의 `/usr/bin/chromium`이 있으면 우선 사용하며 그 외에는 Playwright 브라우저를 사용합니다.

테스트는 Playwright가 응답을 가로채는 `game.js`에만 내부 상태 접근기를 삽입해 실제 물리·충돌·수집·배경 함수를 검증합니다. 운영 게임 코드에는 디버그 API나 점수 조작 기능을 추가하지 않습니다. 스크린샷은 `work/validation/`에 저장합니다.

`difficulty.cjs`는 미래 이동량을 예측하는 자동 입력으로 회피 가능한 경로와 착지 공간을 검증합니다. 실제 플레이어의 성공률을 측정하는 테스트는 아닙니다.

`balance.cjs`는 직전 커밋 `7a7b5c5`의 고정 입력 결과(`fixtures/balance-before.json`)와 새 패턴 밀도를 비교하고, 10초 2단 장애물 도입·거대화 종료 안전 전환을 검사합니다. 자동 입력 생존 시간은 사람의 숙련도를 측정한 값이 아닙니다.

`orientation.cjs`는 Chromium의 Android/iPhone 크기·터치 에뮬레이션으로 첫 접속의 CSS 회전, 세로↔가로 반복 전환, 뷰포트 높이 변경, Canvas의 논리 비율과 래스터 크기, 회전된 버튼/화면 터치, 상태 유지와 화면 잘림을 검사합니다. 실제 Safari/Android Chrome 기기 검증은 별도 필요합니다.

`result-panel.cjs`는 원본 PNG 안에 인쇄된 제목·예시 점수·파란 버튼의 실제 픽셀이 CSS 마스크로 가려지는지 검사합니다. 42개 화면/점수 조합의 상단 오른쪽 제목·중앙 본문 정렬·간격, 실제 귤 수집 후 최종 점수, 재시작 전체 초기화도 확인합니다. 점수 주입은 테스트 응답에만 있고 운영 게임 코드에는 없습니다.
