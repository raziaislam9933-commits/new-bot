// ============================================================
// CONFIGURATION — set these as Environment Variables in Render
// ============================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // e.g. @yourchannel or -1001234567890

const EVENTS_URL = "https://cfygsjskhdk102.top/categories/live-events.txt";
const NOTIFY_BEFORE_START_MS = 10 * 60 * 1000; // 10 minutes before start
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

// ============================================================
// FETCH HELPER
// ============================================================
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON. Response: ${text.slice(0, 200)}`);
  }
}

// ============================================================
// CORE LOGIC
// ============================================================
async function checkAndNotify() {
  const now = Date.now();
  console.log(`\n[${new Date().toUTCString()}] Checking events...`);

  // 1. Fetch events
  let events;
  try {
    events = await fetchJSON(EVENTS_URL);
    console.log(`✅ Fetched ${events.length} events`);
  } catch (e) {
    console.error(`❌ Failed to fetch events: ${e.message}`);
    return;
  }

  // 2. Filter active/upcoming events
  const activeEvents = events.filter((event) => {
    if (!event.publish) return false;
    const info = event.eventInfo;
    if (!info?.startTime || !info?.endTime) return false;

    const start = new Date(info.startTime).getTime();
    const end = new Date(info.endTime).getTime();

    return now >= start - NOTIFY_BEFORE_START_MS && now <= end;
  });

  console.log(`📅 Active/upcoming events: ${activeEvents.length}`);

  // 3. Fetch streams and notify
  for (const event of activeEvents) {
    if (!event.channelUrl) continue;

    try {
      // Strip proxy wrapper if present: ?url=https://...
      let channelUrl = event.channelUrl;
      const match = channelUrl.match(/[?&]url=([^&]+)/);
      if (match) channelUrl = decodeURIComponent(match[1]);

      console.log(`🔍 Fetching streams for: ${event.title}`);
      const streamData = await fetchJSON(channelUrl);

      if (!streamData?.streamUrls?.length) {
        console.log(`⚠️  No streams for: ${event.title}`);
        continue;
      }

      const message = buildMessage(event, streamData);
      await sendTelegramMessage(message);
      console.log(`✅ Notified: ${event.title}`);

      await sleep(1000); // avoid Telegram rate limits
    } catch (e) {
      console.error(`❌ Error for ${event.title}: ${e.message}`);
    }
  }
}

// ============================================================
// MESSAGE FORMATTER
// ============================================================
function buildMessage(event, streamData) {
  const info = event.eventInfo || {};

  const teamA = info.teamA || "Team A";
  const teamB = info.teamB || "Team B";
  const eventType = info.eventType || info.eventName || "";
  const cat = info.eventCat || event.cat || "";

  const startTime = info.startTime
    ? new Date(info.startTime).toUTCString().replace(" GMT", " UTC")
    : "N/A";
  const endTime = info.endTime
    ? new Date(info.endTime).toUTCString().replace(" GMT", " UTC")
    : "N/A";

  let msg = `🔴 *LIVE EVENT*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 *${teamA}  vs  ${teamB}*\n`;
  if (eventType) msg += `📌 ${eventType}\n`;
  if (cat) msg += `🎯 Category: ${cat}\n`;
  msg += `🕐 Start: ${startTime}\n`;
  msg += `🕓 End:   ${endTime}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 *STREAM LINKS*\n\n`;

  streamData.streamUrls.forEach((stream, i) => {
    const typeLabel = getStreamTypeLabel(stream.type);
    msg += `*${i + 1}. ${stream.title}*\n`;
    msg += `   📺 Type: ${typeLabel}\n`;
    msg += `   🔗 Link:\n\`${stream.link}\`\n`;
    if (stream.api) {
      const [key, iv] = stream.api.split(":");
      msg += `   🔑 Key: \`${key}\`\n`;
      if (iv) msg += `   🔐 IV:  \`${iv}\`\n`;
    }
    if (stream.webLink) msg += `   🌐 Web: ${stream.webLink}\n`;
    msg += "\n";
  });

  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Powered by LiveBot_`;

  return msg;
}

function getStreamTypeLabel(type) {
  const types = {
    "1": "HLS (M3U8)",
    "2": "DASH (MPD)",
    "3": "MP4",
    "4": "YouTube",
    "5": "Twitch",
    "6": "HLS Encrypted",
    "7": "DASH Encrypted (CENC)",
  };
  return types[String(type)] || `Type ${type}`;
}

// ============================================================
// TELEGRAM API
// ============================================================
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram error: ${data.description}`);
  }
  return data;
}

// ============================================================
// UTILS
// ============================================================
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// START — runs immediately then every 5 minutes forever
// ============================================================
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ Missing BOT_TOKEN or CHANNEL_ID environment variables!");
  process.exit(1);
}

console.log("🤖 Sports Bot started!");
console.log(`⏱️  Checking every ${CHECK_INTERVAL_MS / 60000} minutes`);

// Run immediately on start
checkAndNotify();

// Then repeat every 5 minutes
setInterval(checkAndNotify, CHECK_INTERVAL_MS);
