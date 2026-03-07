const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const EVENTS_URL = "https://noisy-mountain-8f1a.mominulislamm3u8.workers.dev/?url=https://cfygsjskhdk102.top/categories/live-events.txt&enrich=1";
const NOTIFY_BEFORE_START_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON. Response: ${text.slice(0, 300)}`);
  }
}

async function checkAndNotify() {
  const now = Date.now();
  console.log(`\n[${new Date().toUTCString()}] Checking events...`);

  let events;
  try {
    events = await fetchJSON(EVENTS_URL);
    console.log(`✅ Fetched ${events.length} events`);
  } catch (e) {
    console.error(`❌ Failed to fetch events: ${e.message}`);
    return;
  }

  const activeEvents = events.filter((event) => {
    if (!event.publish) return false;
    const info = event.eventInfo;
    if (!info?.startTime || !info?.endTime) return false;
    const start = new Date(info.startTime).getTime();
    const end = new Date(info.endTime).getTime();
    return now >= start - NOTIFY_BEFORE_START_MS && now <= end;
  });

  console.log(`📅 Active/upcoming events: ${activeEvents.length}`);

  for (const event of activeEvents) {
    console.log(`\n--- Processing: ${event.title} ---`);

    if (!event.channelUrl) {
      console.log(`   ⚠️  No channelUrl, skipping`);
      continue;
    }

    try {
      // Always use the channelUrl AS-IS (proxy decrypts the response)
      console.log(`   🔗 Fetching: ${event.channelUrl}`);
      const streamData = await fetchJSON(event.channelUrl);

      if (!streamData?.streamUrls?.length) {
        console.log(`   ⚠️  No streamUrls found`);
        console.log(`   Raw: ${JSON.stringify(streamData).slice(0, 200)}`);
        continue;
      }

      console.log(`   ✅ Found ${streamData.streamUrls.length} stream(s)`);
      const message = buildMessage(event, streamData);

      const result = await sendTelegramMessage(message);
      console.log(`   📤 Sent! Message ID: ${result.result?.message_id}`);

      await sleep(1000);
    } catch (e) {
      console.error(`   ❌ Error: ${e.message}`);
    }
  }
}

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
    "1": "HLS (M3U8)", "2": "DASH (MPD)", "3": "MP4",
    "4": "YouTube", "5": "Twitch", "6": "HLS Encrypted",
    "7": "DASH Encrypted (CENC)",
  };
  return types[String(type)] || `Type ${type}`;
}

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
    throw new Error(`Telegram error: ${JSON.stringify(data)}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ Missing BOT_TOKEN or CHANNEL_ID!");
  process.exit(1);
}

console.log("🤖 Sports Bot started!");
console.log(`⏱️  Checking every ${CHECK_INTERVAL_MS / 60000} minutes`);
console.log(`📢 Sending to: ${CHANNEL_ID}`);

checkAndNotify();
setInterval(checkAndNotify, CHECK_INTERVAL_MS);
