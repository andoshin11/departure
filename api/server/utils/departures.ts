import { MAX_DEPARTURES_PER_DIRECTION, type Departure, type DirectionDepartures, type TrainInformation } from '@departure/shared'
import type { OdptStationTimetable, OdptTimetableEntry, OdptTrainInformation } from '#server/utils/odpt-parser'
import { calendarCandidates, departureMinutes, nextDate, type ServiceMoment } from '#server/utils/service-day'

/** 名前解決（owl:sameAs → 日本語名）の結果。ODPT に該当データが無い ID は含まれない */
export type TitleMap = ReadonlyMap<string, string>

/** 方面を持たない時刻表の方面名 */
export const UNKNOWN_DIRECTION_NAME = '方面不明'

/**
 * 他事業者への直通先など、ODPT にデータが無い駅・路線・事業者・方面の名前を ID から組み立てる。
 * "odpt.<型>:<事業者>.<路線>.<駅>" のコロン以降の最後の要素（ローマ字表記）を使う
 * （例: odpt.Station:TokyoMetro.Ginza.Asakusa → Asakusa、odpt.Operator:Keio → Keio）。
 *
 * 行き先名が1つ解決できないだけで発車予定全体をエラーにすると、直通運転のある路線が
 * 丸ごと使えなくなるため、ここだけは表示上の縮退を許容する（呼び出し側で警告ログを出す）。
 */
export function nameFromOdptId(id: string): string {
  const local = id.slice(id.indexOf(':') + 1)
  const last = local.split('.').pop()
  return last && last !== '' ? last : id
}

interface Candidate {
  entry: OdptTimetableEntry
  nextServiceDay: boolean
}

function pickTimetable(timetables: OdptStationTimetable[], date: string): OdptStationTimetable | undefined {
  for (const calendarId of calendarCandidates(date)) {
    const found = timetables.find((t) => t.calendarId === calendarId)
    if (found) return found
  }
  return undefined
}

function sortedByTime(entries: OdptTimetableEntry[]): OdptTimetableEntry[] {
  return [...entries].sort((a, b) => departureMinutes(a.departureTime) - departureMinutes(b.departureTime))
}

/**
 * ある方面の時刻表群（カレンダー違い）から、moment 以降に発車する列車を最大 limit 本選ぶ。
 * 当日の運行日ダイヤで足りなければ（終電間際・終電後）、翌運行日のダイヤの始発から補う。
 */
export function selectUpcoming(
  timetables: OdptStationTimetable[],
  moment: ServiceMoment,
  limit: number = MAX_DEPARTURES_PER_DIRECTION,
): Candidate[] {
  const result: Candidate[] = []

  const today = pickTimetable(timetables, moment.date)
  if (today) {
    for (const entry of sortedByTime(today.entries)) {
      if (result.length >= limit) break
      if (departureMinutes(entry.departureTime) >= moment.minutes) result.push({ entry, nextServiceDay: false })
    }
  }

  if (result.length < limit) {
    const tomorrow = pickTimetable(timetables, nextDate(moment.date))
    if (tomorrow) {
      for (const entry of sortedByTime(tomorrow.entries)) {
        if (result.length >= limit) break
        result.push({ entry, nextServiceDay: true })
      }
    }
  }

  return result
}

/** 行き先・方面・種別の名前解決が必要な ID をすべて集める */
export function collectReferencedIds(timetables: OdptStationTimetable[]): {
  stationIds: string[]
  railDirectionIds: string[]
  trainTypeIds: string[]
} {
  const stationIds = new Set<string>()
  const railDirectionIds = new Set<string>()
  const trainTypeIds = new Set<string>()
  for (const t of timetables) {
    if (t.railDirectionId) railDirectionIds.add(t.railDirectionId)
    for (const e of t.entries) {
      e.destinationStationIds.forEach((id) => stationIds.add(id))
      if (e.trainTypeId) trainTypeIds.add(e.trainTypeId)
    }
  }
  return { stationIds: [...stationIds], railDirectionIds: [...railDirectionIds], trainTypeIds: [...trainTypeIds] }
}

export interface BuildDirectionsInput {
  timetables: OdptStationTimetable[]
  moment: ServiceMoment
  stationTitles: TitleMap
  railDirectionTitles: TitleMap
  trainTypeTitles: TitleMap
  /** 名前を解決できなかった駅 ID の通知先（ログ出力用） */
  onUnresolvedStation?: (id: string) => void
}

/**
 * 時刻表を方面ごとにまとめ、それぞれ次の発車予定を最大 MAX_DEPARTURES_PER_DIRECTION 本返す。
 * 方面の並びは railDirection ID の昇順（毎回同じ順序で表示するため）。
 */
export function buildDirections(input: BuildDirectionsInput): DirectionDepartures[] {
  const { timetables, moment, stationTitles, railDirectionTitles, trainTypeTitles, onUnresolvedStation } = input

  const byDirection = new Map<string, OdptStationTimetable[]>()
  for (const t of timetables) {
    const key = t.railDirectionId ?? ''
    byDirection.set(key, [...(byDirection.get(key) ?? []), t])
  }

  const destinationName = (ids: string[]): string => {
    if (ids.length === 0) return '行き先不明'
    return ids
      .map((id) => {
        const title = stationTitles.get(id)
        if (title !== undefined) return title
        onUnresolvedStation?.(id)
        return nameFromOdptId(id)
      })
      .join('・')
  }

  return [...byDirection.keys()]
    .sort()
    .map((directionId) => {
      const directionName =
        directionId === '' ? UNKNOWN_DIRECTION_NAME : (railDirectionTitles.get(directionId) ?? nameFromOdptId(directionId))
      const departures: Departure[] = selectUpcoming(byDirection.get(directionId)!, moment).map(({ entry, nextServiceDay }) => ({
        time: entry.departureTime,
        destination: destinationName(entry.destinationStationIds),
        trainType: entry.trainTypeId ? (trainTypeTitles.get(entry.trainTypeId) ?? null) : null,
        nextServiceDay,
        isLast: entry.isLast,
      }))
      return { directionName, departures }
    })
}

/**
 * 路線の運行情報を選ぶ。開発者ガイドライン 2.1.2 に従い、有効期限（dct:valid）を過ぎた情報は使わない。
 * 有効期限が無い情報は、表示してよい期間が判断できないため使わない（onDiscard で理由を通知する）。
 * 同じ路線の情報が複数ある場合は、生成時刻（dc:date）が最も新しいものを使う。
 */
export function selectTrainInformation(
  records: OdptTrainInformation[],
  railwayId: string,
  now: Date,
  onDiscard?: (reason: string) => void,
): TrainInformation {
  const candidates = records
    .filter((r) => r.railwayId === railwayId)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const latest = candidates[0]
  if (!latest) return { kind: 'unavailable' }
  if (latest.validUntil === null) {
    onDiscard?.(`no dct:valid for ${railwayId}`)
    return { kind: 'unavailable' }
  }
  if (Date.parse(latest.validUntil) <= now.getTime()) {
    onDiscard?.(`expired (dct:valid=${latest.validUntil}) for ${railwayId}`)
    return { kind: 'unavailable' }
  }
  return {
    kind: 'available',
    text: latest.text,
    status: latest.status,
    cause: latest.cause,
    date: latest.date,
    validUntil: latest.validUntil,
  }
}

