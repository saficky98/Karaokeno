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
  }
}

// role: 'host' | 'guest'
// onRoom(state|null)          — příchozí snímek místnosti (guest); null = zavřeno
// onGuest(guestId, data|null) — příchozí data hosta (host); null = host odešel
// onStatus('connecting'|'connected'|'offline')
export async function connectRoom({ roomId, secret, role, onRoom, onGuest, onStatus }) {
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
      if (role === 'host') c.subscribe(T.guestAll, { qos: 1 })
      else c.subscribe(T.room, { qos: 1 })
    })

    c.on('message', async (topic, payload) => {
      const text = payload.toString()
      if (topic === T.room) {
        onRoom?.(text ? await decryptJson(key, text) : null)
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

  return {
    publishRoom: (state) => publishRetained(T.room, state),
    publishGuest: (guestId, data) => publishRetained(T.guest(guestId), data),
    clearGuest: (guestId) => publishRetained(T.guest(guestId), null),
    clearRoom: () => publishRetained(T.room, null),
    end: () => {
      ended = true
      client.end(true)
    },
  }
}
