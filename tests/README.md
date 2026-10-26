# 브라우저 테스트

게임 실행에는 npm이 필요하지 않습니다. 아래는 개발 검증용입니다.

저장소 루트에서:

```sh
npm install --no-save --package-lock=false playwright sharp
npx playwright install chromium
python -m http.server 8001
```

다른 터미널에서:

```sh
node tests/browser.cjs
node tests/orientation.cjs
node tests/result-panel.cjs
node tests/ui-details.cjs
node tests/pause-image.cjs
node tests/collection.cjs
node tests/giant-smash.cjs
node tests/giant-contact.cjs
node tests/obstacle-spacing.cjs
node tests/difficulty.cjs
node tests/restoration.cjs
node tests/speed-items.cjs
node tests/performance.cjs
node tests/balance.cjs
node tests/backgrounds.cjs
node tests/background-style.cjs
```

기본 주소는 `http://127.0.0.1:8001`, `GAME_URL`로 변경할 수 있습니다. `CHROMIUM_PATH`로 브라우저 실행 파일을 지정할 수 있습니다. Linux의 `/usr/bin/chromium`이 있으면 우선 사용하며 그 외에는 Playwright 브라우저를 사용합니다.

테스트는 Playwright가 응답을 가로채는 `game.js`에만 내부 상태 접근기를 삽입해 실제 물리·충돌·수집·배경 함수를 검증합니다. 운영 게임 코드에는 디버그 API나 점수 조작 기능을 추가하지 않습니다. 스크린샷은 `work/validation/`에 저장합니다.

`difficulty.cjs`는 미래 이동량을 예측하는 자동 입력으로 회피 가능한 경로와 착지 공간을 검증합니다. 실제 플레이어의 성공률을 측정하는 테스트는 아닙니다.

`balance.cjs`는 고정 시드의 자동 입력 정책과10초 2단 장애물 도입·거대화 종료 안전 전환을 검사합니다. 과거 `fixtures/balance-before.json`은 이전 밸런스 기록입니다. 자동 입력 생존 시간은 사람의 숙련도를 측정한 값이 아닙니다.

`orientation.cjs`는 Chromium의 Android/iPhone 크기·터치 에뮬레이션으로 첫 접속의 CSS 회전, 세로↔가로 반복 전환, 뷰포트 높이 변경, Canvas의 논리 비율과 래스터 크기, 회전된 버튼/화면 터치, 상태 유지와 화면 잘림을 검사합니다. 실제 Safari/Android Chrome 기기 검증은 별도 필요합니다.

`result-panel.cjs`는 원본 PNG 안에 인쇄된 제목·예시 점수·파란 버튼의 실제 픽셀이 CSS 마스크로 가려지는지 검사합니다. 42개 화면/점수 조합의 상단 오른쪽 제목·중앙 본문 정렬·간격, 실제 귤 수집 후 최종 점수, 재시작 전체 초기화도 확인합니다. 점수 주입은 테스트 응답에만 있고 운영 게임 코드에는 없습니다.

`ui-details.cjs`는 `613e78b`의 CSS와 비교해 버튼 축소율·제목 이동·멈춤 버튼 크기 유지를 측정합니다(해당 커밋을 포함한 Git 기록 필요). 일시정지 이미지 전환 반복·실패 시 대체, 0~3 체력 숫자 중앙 정렬, 실제 44px 터치 확장 영역 클릭도 검사합니다.

`pause-image.cjs`는 PNG 실제 포맷·알파·원본 크기·불투명 RGB 일치·꽃잎/하이라이트 보존·외곽 체크무늬 투명을 검사합니다. `background-style.cjs`는 1.25px/93%/93% 기본 설정과 DPR별 강도, 모든 전경의 filter=none 및 불투명한 반복 경계를 검사합니다.

`restoration.cjs`는 기존 배치와의 좌표 일치·귤 자리 대체·멈춤 토글·두루마리 85% 축소를 검증합니다. `performance.cjs`는 `0195379`의 코드와 캐시 구현을 같은 장면으로 비교하므로 해당 커밋을 포함한 Git 기록이 필요합니다. 벤치마크는 픽셀 읽기를 강제한 비용이며 실제 FPS 측정이 아닙니다.

`speed-items.cjs`는 효과 전후 귤의 고정 월드 간격, 긴 특수 아이템 휴식 제거, 점수 배율과 보간, 고속 회피 및 모바일 가로 제목 두 줄을 검사합니다.

`giant-contact.cjs`는 분리된 장애물30쌍의 실제 접촉·5종 투명 영역·실제 동시 접촉·만료 시 선제 파괴 없음·일반 피해 복귀를 검사합니다. `obstacle-spacing.cjs`는 `8fda285`와 360개 생성 상황을 비교해 간격/공통 주기 축소율과 이미지·배열·속도 보존을 측정합니다. `balance.cjs`의 만료 검사는 닿지 않은 물체가 남아 있어야 통과합니다. 착지 시간은 저프레임 관측 프레임이 아니라 실제 착지 후 경과 시간을 사용합니다.
