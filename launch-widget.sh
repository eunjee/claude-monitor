#!/usr/bin/env bash
# Claude 세션 위젯 실행 스크립트
# Windows 바로가기(세션위젯.vbs)에서 호출되며, npm 명령을 직접 칠 필요 없이
# 더블클릭만으로 위젯을 띄우기 위한 런처.

cd "$(dirname "$0")" || exit 1

# nvm 으로 설치된 node 를 PATH 에 등록 (비대화형 셸에서도 동작하도록)
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# Electron 실행에 필요한 GUI 라이브러리 확인
if ! ldconfig -p 2>/dev/null | grep -q 'libgtk-3'; then
  echo "[!] Electron 실행에 필요한 GUI 라이브러리가 없습니다."
  echo "    아래 명령을 한 번만 실행한 뒤 다시 시도하세요:"
  echo
  echo "    sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 \\"
  echo "      libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libasound2"
  echo
  exit 1
fi

npm run widget
