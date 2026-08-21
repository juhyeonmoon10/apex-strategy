// 한국어 조사 선택. 앞말의 받침 유무로 갈린다.
// "미디엄를", "공격적 대안이(가)" 같은 문장이 하나라도 나오면
// 설명 엔진 전체의 신뢰가 깎이기 때문에 별도 모듈로 분리해 두 곳에서 공유한다.

function hasFinalConsonant(word) {
  const last = word.charCodeAt(word.length - 1);
  if (Number.isNaN(last)) return false;
  if (last < 0xac00 || last > 0xd7a3) return null; // 한글이 아님
  return (last - 0xac00) % 28 !== 0;
}

function pick(word, withFinal, withoutFinal) {
  const f = hasFinalConsonant(word);
  if (f === null) return withoutFinal; // 영문·숫자는 받침 없는 쪽으로
  return f ? withFinal : withoutFinal;
}

/** 은/는 */
export const eun = (w) => `${w}${pick(w, '은', '는')}`;
/** 이/가 */
export const i = (w) => `${w}${pick(w, '이', '가')}`;
/** 을/를 */
export const eul = (w) => `${w}${pick(w, '을', '를')}`;
/** 과/와 */
export const gwa = (w) => `${w}${pick(w, '과', '와')}`;
/** 으로/로 */
export const ro = (w) => `${w}${pick(w, '으로', '로')}`;
