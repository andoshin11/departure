import holidayJp from '@holiday-jp/holiday_jp'

// 鉄道の「運行日」と ODPT のカレンダー（odpt:calendar）の対応を扱う純粋関数群。
//
// 鉄道の時刻表は日付を跨いでも同じ運行日のダイヤとして扱われる（例: 00:30 発の終電は
// 前日のダイヤに "00:30" として載っている）。このアプリでは JST 03:00 を運行日の境界とし、
// 03:00 未満の時刻は前日の運行日の「24時台以降」として扱う。

export const SERVICE_DAY_BOUNDARY_HOUR = 3
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const MINUTES_PER_DAY = 24 * 60

export interface ServiceMoment {
  /** 運行日（JST, YYYY-MM-DD） */
  date: string
  /** 運行日 0:00 からの経過分。境界（03:00）より前の深夜帯は 1440 以上になる */
  minutes: number
}

function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function toServiceMoment(now: Date): ServiceMoment {
  // JST の壁時計時刻を UTC フィールドに載せ、そこから境界ぶん戻した日付を運行日とする。
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  const shifted = new Date(jst.getTime() - SERVICE_DAY_BOUNDARY_HOUR * 60 * 60 * 1000)
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes() + SERVICE_DAY_BOUNDARY_HOUR * 60
  return { date: formatUtcDate(shifted), minutes }
}

export function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return formatUtcDate(d)
}

/** "HH:MM" を運行日 0:00 からの経過分に変換する（境界より前の時刻は翌日扱いで +1440） */
export function departureMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const minutes = h * 60 + m
  return h < SERVICE_DAY_BOUNDARY_HOUR ? minutes + MINUTES_PER_DAY : minutes
}

const DAY_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/**
 * 年末年始（12/30〜1/3）。首都圏の主要事業者はこの期間を土休日ダイヤで運行するため、
 * 祝日と同じ扱いにする（事業者ごとの例外には対応しない。README 参照）。
 */
function isYearEndHoliday(date: string): boolean {
  const md = date.slice(5)
  return md === '12-30' || md === '12-31' || md === '01-01' || md === '01-02' || md === '01-03'
}

/**
 * 運行日 date に適用すべき odpt:calendar の候補を、より限定的なものから順に返す。
 * 呼び出し側は、方面ごとに「候補のうち時刻表が存在する最初のカレンダー」を採用する。
 *
 * これはフォールバックではなく ODPT のカレンダー体系そのものの解釈:
 * 事業者によって「平日 / 土曜 / 休日」と分けるものと「平日 / 土休日」と分けるものがあり、
 * 同じ日に対応するカレンダー ID が事業者によって異なるため、両方を候補にする必要がある。
 * odpt.Calendar:Specific.* （臨時ダイヤ等）には対応しない。
 */
export function calendarCandidates(date: string): string[] {
  const dow = DAY_OF_WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]!
  const holiday = holidayJp.isHoliday(date) || isYearEndHoliday(date)
  const cal = (name: string) => `odpt.Calendar:${name}`

  if (dow === 'Sunday') return [cal('Sunday'), cal('Holiday'), cal('SaturdayHoliday')]
  if (holiday) return [cal('Holiday'), cal('SaturdayHoliday')]
  if (dow === 'Saturday') return [cal('Saturday'), cal('SaturdayHoliday')]
  return [cal(dow), cal('Weekday')]
}
