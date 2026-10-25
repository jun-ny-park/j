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
node tests/result-panel.cjs
node tests/collection.cjs
node tests/giant-smash.cjs
node tests/difficulty.cjs
node tests/backgrounds.cjs
node tests/background-style.cjs
```

기본 주소는 `http://127.0.0.1:8001`, `GAME_URL`로 변경할 수 있습니다. `CHROMIUM_PATH`로 브라우저 실행 파일을 지정할 수 있습니다. Linux의 `/usr/bin/chromium`이 있으면 우선 사용하며 그 외에는 Playwright 브라우저를 사용합니다.

테스트는 Playwright가 응답을 가로채는 `game.js`에만 내부 상태 접근기를 삽입해 실제 물리·충돌·수집·배경 함수를 검증합니다. 운영 게임 코드에는 디버그 API나 점수 조작 기능을 추가하지 않습니다. 스크린샷은 `work/validation/`에 저장합니다.

`difficulty.cjs`는 미래 이동량을 예측하는 자동 입력으로 회피 가능한 경로와 착지 공간을 검증합니다. 실제 플레이어의 성공률을 측정하는 테스트는 아닙니다.
