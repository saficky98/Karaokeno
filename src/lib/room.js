import mqtt from 'mqtt'
import { importRoomKey, encryptJson, decryptJson } from './roomCrypto.js'

// Sdílená místnost běží přes veřejný MQTT broker (zdarma, bez registrace).
// - hostitel drží pravdu: publikuje zašifrovaný snímek místnosti (retained)
// - každý host publikuje svůj zašifrovaný profil + písničky (retained),
//   takže se neztratí, ani když je hostitel zrovna offline
// Klíč šifrování je jen v odkazu místnosti — broker vidí šum.

const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]

function brokerList() {
  try {
    const override = localStorage.getItem('vdui-broker')
    if (override) return [override]
  } catch {
    // bez localStorage jedeme na výchozí
  }
  return DEFAULT_BROKERS
}

function topics(roomId) {
  return {
    room: `vdui/1/${roomId}/room`,
    guestAll: `vdui/1/${roomId}/guest/+`,
    guest: (guestId) => `vdui/1/${roomId}/guest/${guestId}`,
    // efemérní kanály (bez retain, QoS 0): pozice přehrávání a živé skóre —
    // létají často, nesmí se ukládat na brokeru ani tahat celý snímek
    pos: `vdui/1/${roomId}/pos`,
    scoreAll: `vdui/1/${roomId}/score/+`,
    score: (guestId) => `vdui/1/${roomId}/score/${guestId}`,
  }
}

// role: 'host' | 'guest'
// onRoom(state|null)          — příchozí snímek místnosti (guest); null = zavřeno
// onGuest(guestId, data|null) — příchozí data hosta (host); null = host odešel
// onPos(data)                 — pozice přehrávání od hostitele (guest)
// onScore(guestId, data)      — živé skóre zpívajícího hosta
// onStatus('connecting'|'connected'|'offline')
export async function connectRoom({ roomId, secret, role, onRoom, onGuest, onPos, onScore, onStatus }) {
  const key = await importRoomKey(secret)
  const T = topics(roomId)
  const brokers = brokerList()
  let brokerIndex = 0
  let failures = 0
  let ended = false

  let client = connect()

  function connect() {
    onStatus?.('connecting')
    const c = mqtt.connect(brokers[brokerIndex], {
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
    })

    c.on('connect', () => {
      failures = 0
      onStatus?.('connected')
      if (role === 'host') {
        c.subscribe(T.guestAll, { qos: 1 })
        c.subscribe(T.scoreAll, { qos: 0 })
      } else {
        c.subscribe(T.room, { qos: 1 })
        c.subscribe(T.pos, { qos: 0 })
        c.subscribe(T.scoreAll, { qos: 0 }) // obrazovka i hráči vidí živá skóre ostatních
      }
    })

    c.on('message', async (topic, payload) => {
      const text = payload.toString()
      if (topic === T.room) {
        onRoom?.(text ? await decryptJson(key, text) : null)
        return
      }
      if (topic === T.pos) {
        if (text) {
          const data = await decryptJson(key, text)
          if (data) onPos?.(data)
        }
        return
      }
      const scoreMatch = topic.match(/\/score\/([^/]+)$/)
      if (scoreMatch) {
        if (text) {
          const data = await decryptJson(key, text)
          if (data) onScore?.(scoreMatch[1], data)
        }
        return
      }
      const match = topic.match(/\/guest\/([^/]+)$/)
      if (match) {
        onGuest?.(match[1], text ? await decryptJson(key, text) : null)
      }
    })

    c.on('close', () => {
      if (ended) return
      onStatus?.('offline')
      failures += 1
      // po třech neúspěších zkusíme záložní broker
      if (failures >= 3 && brokers.length > 1) {
        failures = 0
        brokerIndex = (brokerIndex + 1) % brokers.length
        c.end(true)
        client = connect()
      }
    })

    c.on('error', () => {
      // řeší 'close'
    })

    return c
  }

  async function publishRetained(topic, obj) {
    const payload = obj === null ? '' : await encryptJson(key, obj)
    client.publish(topic, payload, { qos: 1, retain: true })
  }

  async function publishEphemeral(topic, obj) {
    const payload = await encryptJson(key, obj)
    client.publish(topic, payload, { qos: 0, retain: false })
  }

  return {
    publishRoom: (state) => publishRetained(T.room, state),
    publishGuest: (guestId, data) => publishRetained(T.guest(guestId), data),
    clearGuest: (guestId) => publishRetained(T.guest(guestId), null),
    clearRoom: () => publishRetained(T.room, null),
    publishPos: (data) => publishEphemeral(T.pos, data),
    publishScore: (guestId, data) => publishEphemeral(T.score(guestId), data),
    end: () => {
      ended = true
      client.end(true)
    },
  }
}
