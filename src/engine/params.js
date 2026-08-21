// ★ 모든 모델 계수는 이 파일에만 존재한다.
// 캘리브레이션은 여기 숫자만 고쳐서 한다. 다른 파일에 상수를 흩뿌리지 말 것.

export const COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTER', 'WET'];

export const COMPOUND_KO = {
  SOFT: '소프트',
  MEDIUM: '미디엄',
  HARD: '하드',
  INTER: '인터미디에이트',
  WET: '웨트',
};

export const COMPOUND_COLOR = {
  SOFT: '#DA291C',
  MEDIUM: '#FFD12E',
  HARD: '#F0F0EC',
  INTER: '#43B02A',
  WET: '#0067AD',
};

export const SLICKS = ['SOFT', 'MEDIUM', 'HARD'];

/**
 * 기획서 6.3 표.
 *  delta     컴파운드 순수 페이스 (초/랩, 음수 = 빠름)
 *  wear      선형 마모 (초/랩²)
 *  cliffLap  이 랩 수를 넘으면 제곱 마모 시작
 *  cliffK    클리프 계수
 *  idealTemp 최적 노면 온도 (°C)
 *  thermalK  노면 온도 초과분 1°C 당 마모 증가율
 *  warmup    첫 랩 워밍업 손실 (초)
 */
export const TYRE = {
  SOFT:   { delta: -0.55, wear: 0.055, cliffLap: 14, cliffK: 0.030, idealTemp: 28, thermalK: 0.018, warmup: 0.15 },
  MEDIUM: { delta:  0.00, wear: 0.035, cliffLap: 24, cliffK: 0.020, idealTemp: 32, thermalK: 0.012, warmup: 0.45 },
  HARD:   { delta:  0.50, wear: 0.022, cliffLap: 36, cliffK: 0.012, idealTemp: 36, thermalK: 0.009, warmup: 1.00 },
  INTER:  { delta:  6.50, wear: 0.045, cliffLap: 20, cliffK: 0.025, idealTemp: 22, thermalK: 0.030, warmup: 0.35 },
  WET:    { delta: 13.00, wear: 0.035, cliffLap: 18, cliffK: 0.020, idealTemp: 18, thermalK: 0.035, warmup: 0.55 },
};

/** 클리프가 폭주하지 않도록 상한 (v1 의 +50초 격차 원인 중 하나) */
export const CLIFF_CAP = 3.0;

/** 노면 상태별 컴파운드 적합도 페널티 (초/랩) */
export const SURFACE_PENALTY = {
  dry:   { SOFT: 0,    MEDIUM: 0,    HARD: 0,    INTER: 0,   WET: 0    },
  rain:  { SOFT: 8.0,  MEDIUM: 7.6,  HARD: 7.2,  INTER: 0,   WET: 2.5  },
  heavy: { SOFT: 20.0, MEDIUM: 19.5, HARD: 19.0, INTER: 5.0, WET: 0    },
};

/** 젖은 노면에서 인터/웨트는 마모가 반대로 급증 */
export const SURFACE_WEAR = {
  dry:   { INTER: 3.0, WET: 3.5 },
  rain:  { INTER: 1.0, WET: 1.4 },
  heavy: { INTER: 1.3, WET: 1.0 },
};

export const TRAFFIC_DELTA = { clean: 0, light: 0.08, medium: 0.20, heavy: 0.45 };

export const SAFETY_CAR = {
  minLaps: 3,
  maxLaps: 5,
  lapMultiplier: 1.35,   // SC 중 랩타임
  vscMultiplier: 1.15,   // VSC 중 랩타임
  wearFactor: 0.30,      // SC/VSC 중 마모 누적 비율
  pitLossSc: 0.40,       // SC 중 피트인 시 손실 비율
  pitLossVsc: 0.60,
  vscLaps: 2,
};

export const RACE = {
  lapNoiseSigma: 0.12,      // 랩타임 랜덤 노이즈
  pitNoiseSigma: 0.6,       // 피트스톱 실수 변동
  gridPenaltyPerPos: 0.045, // 그리드 1칸당 초기 손실 (초/랩 환산)
  trackEvoTau: 12,          // 트랙 진화 시상수
  trackEvoDry: 0.8,
  trackEvoWet: 0.2,
  minStintLaps: 4,
};

/** 몬테카를로 기본 실행 횟수 */
export const MC_RUNS = 500;
