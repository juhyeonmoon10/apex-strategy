// 자동 생성 — tools/doc_params.py. 조사 문서의 방법으로 실측 랩에서 뽑은 계수.
// 화면의 '실측값 넣기' 와 연구 페이지가 읽는다. 엔진 기본값은 params.js 의 DOC_MODEL.
export const DOC_MEASURED = {
 "source": "data/laps.csv · tools/doc_params.py",
 "laps": 17996,
 "races": 20,
 "fuelPerLap": 0.035,
 "compounds": {
  "SOFT": {
   "k1": 0.0434,
   "stints": 188,
   "longStints": 91,
   "cliffDetected": 0,
   "tau": null,
   "b2": null,
   "rollTau": 9.0,
   "rollDetected": 19,
   "kc": 0.997
  },
  "MEDIUM": {
   "k1": 0.0358,
   "stints": 354,
   "longStints": 252,
   "cliffDetected": 0,
   "tau": null,
   "b2": null,
   "rollTau": 10.0,
   "rollDetected": 55,
   "kc": 1.0
  },
  "HARD": {
   "k1": 0.0407,
   "stints": 308,
   "longStints": 275,
   "cliffDetected": 0,
   "tau": null,
   "b2": null,
   "rollTau": 10.0,
   "rollDetected": 79,
   "kc": 0.99375
  }
 },
 "kcRatios": {
  "SOFT": 127,
  "HARD": 213
 }
};
