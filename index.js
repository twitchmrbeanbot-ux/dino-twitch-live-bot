require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const crypto = require("crypto");
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------
// CONSTANTS
// ----------------------------
const GUILD_ID = "1480080172400250992";
const WELCOME_CHANNEL_ID = "1480080173469532194";
const RULES_CHANNEL_ID = "1480080173469532195";
const PICK_ROLES_CHANNEL_ID = "1481032622460370954";
const NOTIFICATION_CHANNEL_ID = "1481033002308997120";
const BOT_INFO_CHANNEL_ID = "1481033456724082739";
const SUPPORT_CHANNEL_ID = "1481034688578719774";
const BIRTHDAY_REGISTER_CHANNEL_ID = "1480764987034304535";
const MOD_LOGS_CHANNEL_ID = "1480080173469532199";
const SPAM_LOGS_CHANNEL_ID = "1480080173868257333";
const MOD_CHAT_CHANNEL_ID = "1480080173868257334";
const MRBEAN_ANNOUNCEMENTS_CHANNEL_ID = "1480080173868257336";
const MRBEAN_CATEGORY_ID = "1480099688739901531";
const STREAMING_CATEGORY_ID = "1480080174123978822";
const MRBEAN_TWITCH_LOGIN = "mrbeanthedino";
const MRBEAN_SCHEDULE_CHANNEL_ID = "1481501043429871817";
const CREW_SCHEDULE_CHANNEL_ID = "1481501693333213286";
const GAME_SUGGESTIONS_CHANNEL_ID = "1480103931173408881";
const LOOKING_TO_PLAY_CHANNEL_ID = "1481751127841050735";

// PROJECT ZOMBOID
const PZ_OPEN_CHANNEL_ID = "1480253903407681599";   // #project-zomboid — control panel + application
const PZ_STATUS_CHANNEL_ID = "1481760930592460830"; // #server-status — live status embed
const PZ_ALERTS_CHANNEL_ID = "1481760621958660147"; // #dark-sorrows — restart alerts + app review

const FILTER_EXEMPT_CHANNELS = new Set([
  "1480089758490165433","1480090291469025380","1480092967464210502",
  "1480093057226379345","1480093454196412416","1480093712473391165",
  "1480700138090659931","1480700462461096038",
]);

const FILTERED_WORDS = ["nigger","faggot","fag","chink","spic","kike","gook","tranny","dyke"];

// ----------------------------
// LINK PROTECTION
// ----------------------------
const BLOCKED_DOMAINS = [
  "grabify.link","iplogger.org","iplogger.com","iplogger.ru","2no.co","yip.su","ps3cfw.com",
  "blasze.tk","blasze.com","iplis.ru","02ip.ru","ezstat.ru","lovelocator.net","locationtracker.mobi",
  "freegeoip.net","crbug.io","datauth.io","whatstheirip.com","bmwforum.co","leancoding.co",
  "progpress.com","gyazo.party","discordnitro.online","sitespy.io","discord-nitro.com",
  "discordnitro.com","discordgift.com","discord-giveaway.com","discordapp.io","discord-app.io",
  "discordapp.gift","discord.gifts","discordnitro.gift","steamcommunnity.com","stearn.com",
  "steamcommunlty.com","steamcomrnunity.com","trade-steam.com","steam-trade.net","steamtrade.net",
  "csgo-skins.com","cs-trade.com","metamask-airdrop.com","claimeth.io","nftdrop.io",
  "uniswap-claim.com","free-crypto.io","binance-airdrop.com","walletconnect.network",
  "anonfiles.com","bayfiles.com","letsupload.io","filechan.org","upload.ee",
  "pornhub.com","xvideos.com","xhamster.com","xnxx.com","onlyfans.com","fansly.com",
  "chaturbate.com","livejasmin.com",
];
const BLOCKED_URL_PATTERNS = [
  "free-nitro","discord-gift","nitro-free","claim-nitro",
  "freegift","discord.com-","steamcommunity.com-"
];
const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;

function isBlockedLink(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) return true;
    if (BLOCKED_URL_PATTERNS.some(p => url.toLowerCase().includes(p))) return true;
    return false;
  } catch { return false; }
}

// ----------------------------
// RAID PROTECTION
// ----------------------------
const RAID_JOIN_THRESHOLD = 5;
const RAID_JOIN_WINDOW = 60 * 1000;
let recentJoins = [];
let raidLockdownActive = false;

async function checkRaid(guild, newMember) {
  const now = Date.now();
  recentJoins = recentJoins.filter(t => now - t.timestamp < RAID_JOIN_WINDOW);
  recentJoins.push({ timestamp: now, userId: newMember.id, tag: newMember.user.tag });
  if (raidLockdownActive) {
    try { await newMember.send({ embeds: [new EmbedBuilder().setTitle("🔒 Server Temporarily Locked").setDescription("DinoGang is currently in lockdown mode due to a potential raid.\n\nThe server will reopen shortly. Please try joining again later! 🦕").setColor(0xED4245).setFooter({ text: "DinoGang • Anti-Raid Protection" })] }); } catch {}
    await newMember.kick("Server lockdown active — anti-raid protection");
    return true;
  }
  if (recentJoins.length >= RAID_JOIN_THRESHOLD) { await activateRaidLockdown(guild); return true; }
  return false;
}

async function activateRaidLockdown(guild) {
  if (raidLockdownActive) return;
  raidLockdownActive = true;
  try { await guild.setVerificationLevel(4, "Anti-raid lockdown activated"); } catch (err) { console.error("❌ Error setting verification level:", err); }
  const joinerList = recentJoins.map(j => `• <@${j.userId}> (${j.tag})`).join("\n");
  try {
    const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
    const embed = new EmbedBuilder().setTitle("🚨 RAID DETECTED — Server Locked Down").setDescription(`**${recentJoins.length} accounts joined within 60 seconds.**\n\n**Recent Joiners:**\n${joinerList}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔒 Server verification level has been set to maximum.\nNew joins are being auto-kicked until lockdown is lifted.\n\n*Click the button below to lift the lockdown when it's safe.*`).setColor(0xED4245).setTimestamp().setFooter({ text: "DinoBot • Anti-Raid Protection" });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("raid_lift_lockdown").setLabel("Lift Lockdown").setEmoji("🔓").setStyle(ButtonStyle.Success));
    await modLogs.send({ content: `<@&${ROLE_IDS.mods}> <@&${ROLE_IDS.admin}> 🚨 RAID ALERT!`, embeds: [embed], components: [row] });
  } catch (err) { console.error("❌ Error sending raid alert:", err); }
}

async function liftRaidLockdown(guild) {
  raidLockdownActive = false;
  recentJoins = [];
  try { await guild.setVerificationLevel(1, "Anti-raid lockdown lifted"); } catch (err) { console.error("❌ Error restoring verification level:", err); }
}

// ----------------------------
// STRIKE SYSTEM
// ----------------------------
const STRIKES_FILE = "./strikes.json";
let strikes = {};
if (fs.existsSync(STRIKES_FILE)) { try { strikes = JSON.parse(fs.readFileSync(STRIKES_FILE, "utf8")); } catch { strikes = {}; } }
function saveStrikes() { fs.writeFileSync(STRIKES_FILE, JSON.stringify(strikes, null, 2)); }
function addStrike(userId) {
  if (!strikes[userId]) strikes[userId] = [];
  strikes[userId].push({ timestamp: Date.now() });
  saveStrikes();
  return strikes[userId].length;
}

// ----------------------------
// ROLES + HELPERS
// ----------------------------
const ROLE_IDS = {
  unverified: "1480647122285236438",
  goofyGoobers: "1480088633540083732",
  streamer: "1480647124038455498",
  viewer: "1480647124529189128",
  gamers: "1480674153722937354",
  creative: "1480674490231816403",
  mods: "1480282547769573538",
  admin: "1480083446704509091",
  owner: "1480082698159525909",
  streamAlerts: "1480729998339080232",
  announcements: "1480730218896556075",
  birthday: "1480762436909928550",
  darkSorrowsPZ: "1481761033377943572"
};

function isStaff(member) {
  return member.roles.cache.has(ROLE_IDS.mods) ||
    member.roles.cache.has(ROLE_IDS.admin) ||
    member.roles.cache.has(ROLE_IDS.owner) ||
    member.id === member.guild.ownerId;
}

// ----------------------------
// DATA FILES
// ----------------------------
const MIN_ACCOUNT_AGE_DAYS = 7;
const BIRTHDAY_FILE = "./birthdays.json";
const SCHEDULE_FILE = "./schedules.json";

let birthdays = {};
if (fs.existsSync(BIRTHDAY_FILE)) { try { birthdays = JSON.parse(fs.readFileSync(BIRTHDAY_FILE, "utf8")); } catch { birthdays = {}; } }
let schedules = {};
if (fs.existsSync(SCHEDULE_FILE)) { try { schedules = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8")); } catch { schedules = {}; } }
function saveBirthdays() { fs.writeFileSync(BIRTHDAY_FILE, JSON.stringify(birthdays, null, 2)); }
function saveSchedules() { fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2)); }

// ----------------------------
// STATE VARS
// ----------------------------
let onboardingCategoryId = null;
let modTicketsChannelId = null;
let staffCategoryId = null;
let ticketsCategoryId = null;
let birthdayCategoryId = null;
let mrbeanScheduleChannelId = null;
let crewScheduleChannelId = null;
let crewScheduleMessageId = null;
let mrbeanScheduleMessageId = null;

let pzStatusMessageId = null;
let pzStatusInterval = null;
let pzControlPanelMessageId = null;

// poll state: pollId -> { messageId, channelId, question, options, emojis, isYesNo, endTime, timeout }
const activePolls = new Map();
const openTickets = new Map();
const activeLTPPosts = new Map(); // userId -> { messageId, timeout }

process.on("unhandledRejection", (reason) => console.error("❌ UNHANDLED REJECTION:", reason));
process.on("uncaughtException", (err) => console.error("❌ UNCAUGHT EXCEPTION:", err));

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// ----------------------------
// DISCORD CLIENT
// ----------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

// ----------------------------
// REGISTER SLASH COMMANDS
// ----------------------------
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
      .addUserOption(o => o.setName("member").setDescription("Member to warn").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),
    new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
      .addUserOption(o => o.setName("member").setDescription("Member to kick").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
    new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
      .addUserOption(o => o.setName("member").setDescription("Member to ban").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
    new SlashCommandBuilder().setName("mute").setDescription("Timeout a member")
      .addUserOption(o => o.setName("member").setDescription("Member to mute").setRequired(true))
      .addIntegerOption(o => o.setName("duration").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(10080))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
    new SlashCommandBuilder().setName("unmute").setDescription("Remove timeout from a member")
      .addUserOption(o => o.setName("member").setDescription("Member to unmute").setRequired(true)),
    new SlashCommandBuilder().setName("strikes").setDescription("Check a member's strike count")
      .addUserOption(o => o.setName("member").setDescription("Member to check").setRequired(true)),
    new SlashCommandBuilder().setName("clearstrikes").setDescription("Clear all strikes for a member")
      .addUserOption(o => o.setName("member").setDescription("Member to clear").setRequired(true)),
    new SlashCommandBuilder().setName("poll").setDescription("Create a poll (auto-closes after 24 hours)")
      .addStringOption(o => o.setName("question").setDescription("Your poll question").setRequired(true))
      .addStringOption(o => o.setName("option1").setDescription("Option 1 — leave all blank for Yes/No poll").setRequired(false))
      .addStringOption(o => o.setName("option2").setDescription("Option 2").setRequired(false))
      .addStringOption(o => o.setName("option3").setDescription("Option 3").setRequired(false))
      .addStringOption(o => o.setName("option4").setDescription("Option 4").setRequired(false))
      .addStringOption(o => o.setName("option5").setDescription("Option 5").setRequired(false))
      .addStringOption(o => o.setName("option6").setDescription("Option 6").setRequired(false)),
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) { console.error("❌ Failed to register slash commands:", err); }
}

// ----------------------------
// CLIENT READY
// ----------------------------
client.once("clientReady", async () => {
  console.log(`✅ DinoBot online as ${client.user.tag}`);
  try {
    await setupOnboardingCategory();
    await setupRulesMessage();
    await setupPickRolesChannel();
    await setupNotificationChannel();
    await setupBotInfoChannel();
    await setupStaffCategory();
    await setupTicketsCategory();
    await setupSupportChannel();
    await setupModTicketsChannel();
    await setupBirthdayCategory();
    await setupBirthdayRegisterChannel();
    await setupMrBeanScheduleChannel();
    await setupCrewScheduleChannel();
    await setupGameSuggestionsChannel();
    await setupLookingToPlayChannel();
    await setupPZChannels();
    await lockChannelsForUnverified();
    console.log("✅ All systems ready");
  } catch (err) { console.error("❌ Setup error:", err); }
  try {
    await subscribeToTwitchUsers();
    console.log("✅ Twitch subscriptions active");
  } catch (err) { console.error("❌ Twitch subscription error:", err); }
  await registerSlashCommands();
  startBirthdayScheduler();
});

client.on("error", (err) => console.error("❌ Discord client error:", err));
client.on("shardDisconnect", (event, id) => console.warn(`⚠️ Shard ${id} disconnected`));
client.on("shardError", (error, shardId) => console.error(`❌ Shard ${shardId} error:`, error));
client.on("invalidated", () => console.error("❌ Discord session invalidated"));

// ----------------------------
// MESSAGE LOGGING — edits & deletes (bots ignored)
// ----------------------------
client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.author?.bot) return;
  if (!oldMessage.content || !newMessage.content) return;
  if (oldMessage.content === newMessage.content) return;
  try {
    const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
    await modLogs.send({ embeds: [new EmbedBuilder()
      .setTitle("✏️ Message Edited")
      .setDescription(`**Author:** ${oldMessage.author} (${oldMessage.author.tag})\n**Channel:** ${oldMessage.channel}\n**[Jump to Message](${newMessage.url})**\n\n**Before:**\n${oldMessage.content.slice(0, 1000)}\n\n**After:**\n${newMessage.content.slice(0, 1000)}`)
      .setColor(0xFFA500).setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Message Log" })]
    });
  } catch (err) { console.error("❌ Error logging message edit:", err); }
});

client.on("messageDelete", async (message) => {
  if (!message.guild) return;
  if (message.author?.bot) return;
  if (!message.content && message.embeds.length === 0) return;
  try {
    const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
    await modLogs.send({ embeds: [new EmbedBuilder()
      .setTitle("🗑️ Message Deleted")
      .setDescription(`**Author:** ${message.author} (${message.author.tag})\n**Channel:** ${message.channel}\n\n**Content:**\n${message.content?.slice(0, 1500) || "*No text content*"}`)
      .setColor(0xED4245).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Message Log" })]
    });
  } catch (err) { console.error("❌ Error logging message delete:", err); }
});

// ----------------------------
// MESSAGE CREATE — WORD FILTER + LINK PROTECTION
// ----------------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (FILTER_EXEMPT_CHANNELS.has(message.channel.id)) return;
  const member = message.member;
  if (!member) return;
  if (isStaff(member)) return;

  const content = message.content.toLowerCase().replace(/[^a-z]/g, "");
  const triggered = FILTERED_WORDS.find(word => content.includes(word.toLowerCase().replace(/[^a-z]/g, "")));
  if (triggered) {
    try { await message.delete(); } catch {}
    const strikeCount = addStrike(message.author.id);
    try {
      const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
      const strikeLabel = strikeCount === 1 ? "⚠️ Strike 1 — Warning" : strikeCount === 2 ? "⏱️ Strike 2 — Timeout" : "🔨 Strike 3 — Ban";
      await modLogs.send({ embeds: [new EmbedBuilder().setTitle(`🚫 Word Filter Triggered — ${strikeLabel}`).setDescription(`**Member:** ${message.author} (${message.author.tag})\n**Channel:** ${message.channel}\n**Word Detected:** ||\`${triggered}\`||\n**Strike:** ${strikeCount}/3\n**Message Content:** ||\`${message.content}\`||`).setColor(strikeCount === 1 ? 0xFFA500 : strikeCount === 2 ? 0xFF6B00 : 0xED4245).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Word Filter" })] });
    } catch (err) { console.error("❌ Error logging word filter:", err); }
    if (strikeCount === 1) {
      try { const warn = await message.channel.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Watch Your Language").setDescription(`${message.author} — that word isn't allowed here. **This is your first warning.**\n\nContinued use will result in a timeout and then a ban.`).setColor(0xFFA500).setFooter({ text: "DinoBot • Word Filter • Strike 1/3" })] }); setTimeout(() => warn.delete().catch(() => {}), 10000); } catch {}
      try { await message.author.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Warning — DinoGang").setDescription(`You used a word that isn't allowed in **DinoGang**.\n\n**Strike 1/3** — This is your first and only warning.\n\nAnother offense will result in a **10 minute timeout**. A third offense will result in a **permanent ban**.\n\nPlease review the server rules.`).setColor(0xFFA500).setFooter({ text: "DinoBot • Word Filter" })] }); } catch {}
    }
    if (strikeCount === 2) {
      try { await member.timeout(10 * 60 * 1000, "Word filter — Strike 2"); const warn = await message.channel.send({ embeds: [new EmbedBuilder().setTitle("⏱️ Member Timed Out").setDescription(`${message.author} has been timed out for **10 minutes** for repeated use of prohibited language.\n\n**Strike 2/3** — One more offense will result in a permanent ban.`).setColor(0xFF6B00).setFooter({ text: "DinoBot • Word Filter • Strike 2/3" })] }); setTimeout(() => warn.delete().catch(() => {}), 15000); } catch (err) { console.error("❌ Error timing out member:", err); }
      try { await message.author.send({ embeds: [new EmbedBuilder().setTitle("⏱️ You've Been Timed Out — DinoGang").setDescription(`You've been timed out for **10 minutes** for using prohibited language in **DinoGang**.\n\n**Strike 2/3** — This is your final warning.\n\nOne more offense will result in a **permanent ban** from the server.`).setColor(0xFF6B00).setFooter({ text: "DinoBot • Word Filter" })] }); } catch {}
    }
    if (strikeCount >= 3) {
      try { await message.author.send({ embeds: [new EmbedBuilder().setTitle("🔨 You've Been Banned — DinoGang").setDescription(`You have been **permanently banned** from **DinoGang** for repeated use of prohibited language.\n\n**Strike 3/3** — This is the result of multiple warnings and a timeout.\n\nThis decision is final.`).setColor(0xED4245).setFooter({ text: "DinoBot • Word Filter" })] }); } catch {}
      try { await member.ban({ reason: "Word filter — Strike 3 — repeated hate speech" }); const warn = await message.channel.send({ embeds: [new EmbedBuilder().setTitle("🔨 Member Banned").setDescription(`A member has been permanently banned for repeated use of prohibited language.\n\n**Strike 3/3**`).setColor(0xED4245).setFooter({ text: "DinoBot • Word Filter • Strike 3/3" })] }); setTimeout(() => warn.delete().catch(() => {}), 15000); } catch (err) { console.error("❌ Error banning member:", err); }
    }
    console.log(`🚫 Word filter: ${message.author.tag} — strike ${strikeCount}/3 — word: ${triggered}`);
    return;
  }

  const urls = message.content.match(URL_REGEX);
  if (urls) {
    const blocked = urls.find(url => isBlockedLink(url));
    if (blocked) {
      try { await message.delete(); } catch {}
      let blockedHost = blocked; try { blockedHost = new URL(blocked).hostname; } catch {}
      try { const warn = await message.channel.send({ embeds: [new EmbedBuilder().setTitle("🔗 Blocked Link Removed").setDescription(`${message.author} — that link isn't allowed here.\n\n🚫 **Blocked domain:** \`${blockedHost}\`\n\nIf you think this was a mistake, please contact a mod.`).setColor(0xED4245).setFooter({ text: "DinoBot • Link Protection" })] }); setTimeout(() => warn.delete().catch(() => {}), 10000); } catch (err) { console.error("❌ Error sending link warning:", err); }
      try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("🔗 Blocked Link Detected").setDescription(`**Member:** ${message.author} (${message.author.tag})\n**Channel:** ${message.channel}\n**Blocked Domain:** \`${blockedHost}\`\n**Full URL:** ||\`${blocked}\`||\n**Message Content:** ||\`${message.content}\`||`).setColor(0xED4245).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Link Protection" })] }); } catch (err) { console.error("❌ Error logging blocked link:", err); }
      console.log(`🔗 Blocked link: ${message.author.tag} — ${blockedHost}`);
    }
  }
});

// ----------------------------
// POLL AUTO-CLOSE
// ----------------------------
async function closePoll(pollId) {
  const poll = activePolls.get(pollId);
  if (!poll) return;
  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(poll.messageId);
    let totalVotes = 0;
    const results = [];
    for (const emoji of poll.emojis) {
      const reaction = message.reactions.cache.find(r => r.emoji.name === emoji);
      const count = reaction ? Math.max(0, reaction.count - 1) : 0;
      totalVotes += count;
      results.push({ emoji, count });
    }
    let resultsText = "";
    results.forEach((r, i) => {
      const label = poll.isYesNo ? (i === 0 ? "Yes" : "No") : poll.options[i].replace(/^[^\s]+ /, "");
      const pct = totalVotes > 0 ? Math.round((r.count / totalVotes) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      resultsText += `${r.emoji} **${label}** — ${r.count} vote${r.count !== 1 ? "s" : ""} (${pct}%)\n\`${bar}\`\n\n`;
    });
    await channel.send({ embeds: [new EmbedBuilder().setTitle("📊 Poll Closed — Results").setDescription(`**${poll.question}**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${resultsText}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Total votes:** ${totalVotes}`).setColor(0x57F287).setTimestamp().setFooter({ text: "DinoBot • Poll • Closed" })] });
    const closedEmbed = EmbedBuilder.from(message.embeds[0]).setTitle("📊 Poll — CLOSED").setColor(0x4F545C).setFooter({ text: "DinoBot • Poll • This poll has ended" });
    await message.edit({ embeds: [closedEmbed] });
    activePolls.delete(pollId);
    console.log(`📊 Poll closed: "${poll.question}"`);
  } catch (err) { console.error("❌ Error closing poll:", err); activePolls.delete(pollId); }
}

// ----------------------------
// PROJECT ZOMBOID — RCON
// ----------------------------
async function sendRconCommand(command) {
  const host = process.env.PZ_RCON_HOST;
  const port = parseInt(process.env.PZ_RCON_PORT || "27015");
  const password = process.env.PZ_RCON_PASSWORD;
  if (!host || !password) return null;

  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();
    let authenticated = false;
    let responseBuffer = Buffer.alloc(0);
    const REQUEST_ID = Math.floor(Math.random() * 1000) + 1;

    function buildPacket(id, type, body) {
      const bodyBuf = Buffer.from(body + "\0", "utf8");
      const size = 4 + 4 + bodyBuf.length + 1;
      const buf = Buffer.alloc(4 + size);
      buf.writeInt32LE(size, 0);
      buf.writeInt32LE(id, 4);
      buf.writeInt32LE(type, 8);
      bodyBuf.copy(buf, 12);
      buf[buf.length - 1] = 0;
      return buf;
    }

    socket.setTimeout(5000);
    socket.connect(port, host, () => { socket.write(buildPacket(REQUEST_ID, 3, password)); });

    socket.on("data", (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);
      if (responseBuffer.length >= 14) {
        const packetSize = responseBuffer.readInt32LE(0);
        if (responseBuffer.length >= packetSize + 4) {
          const type = responseBuffer.readInt32LE(8);
          const body = responseBuffer.slice(12, packetSize + 4 - 2).toString("utf8");
          if (!authenticated) {
            if (type !== -1) { authenticated = true; responseBuffer = Buffer.alloc(0); socket.write(buildPacket(REQUEST_ID + 1, 2, command)); }
            else { socket.destroy(); resolve(null); }
          } else { socket.destroy(); resolve(body || "OK"); }
        }
      }
    });

    socket.on("timeout", () => { socket.destroy(); resolve(null); });
    socket.on("error", () => { resolve(null); });
  });
}

async function getPZServerStatus() {
  try {
    const result = await sendRconCommand("players");
    if (result === null) return { online: false, players: [], playerCount: 0 };
    const lines = result.split("\n").map(l => l.trim()).filter(l => l && !l.toLowerCase().includes("players"));
    return { online: true, players: lines, playerCount: lines.length };
  } catch { return { online: false, players: [], playerCount: 0 }; }
}

function buildPZStatusEmbed(status) {
  const statusIcon = status.online ? "🟢" : "🔴";
  const color = status.online ? 0x57F287 : 0xED4245;
  let description = `**Server Status:** ${statusIcon} ${status.online ? "Online" : "Offline"}\n\n`;
  if (status.online) {
    description += `👥 **Players Online:** ${status.playerCount}\n\n`;
    if (status.playerCount > 0) description += `**Online Now:**\n${status.players.map(p => `• ${p}`).join("\n")}\n\n`;
  } else {
    description += `*The server appears to be offline or unreachable.*\n\n`;
  }
  description += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏰ *Last updated: <t:${Math.floor(Date.now() / 1000)}:R>*`;
  return new EmbedBuilder().setTitle("🧟 Dark Sorrows — Project Zomboid Server").setDescription(description).setColor(color).setFooter({ text: "DinoBot • PZ Status • Auto-refreshes every 5 minutes" }).setTimestamp();
}

async function updatePZStatusEmbed() {
  try {
    const status = await getPZServerStatus();
    const statusChannel = await client.channels.fetch(PZ_STATUS_CHANNEL_ID);
    if (pzStatusMessageId) {
      try { const msg = await statusChannel.messages.fetch(pzStatusMessageId); await msg.edit({ embeds: [buildPZStatusEmbed(status)] }); return; }
      catch { pzStatusMessageId = null; }
    }
    const msg = await statusChannel.send({ embeds: [buildPZStatusEmbed(status)] });
    pzStatusMessageId = msg.id;
  } catch (err) { console.error("❌ Error updating PZ status:", err); }
}

async function setupPZChannels() {
  try {
    const openChannel = await client.channels.fetch(PZ_OPEN_CHANNEL_ID);
    const openMessages = await openChannel.messages.fetch({ limit: 10 });
    const existingPanel = openMessages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0]?.title?.includes("Dark Sorrows"));
    if (!existingPanel) {
      await postPZControlPanel(openChannel);
    } else {
      pzControlPanelMessageId = existingPanel.id;
      console.log("ℹ️ PZ control panel already set up");
    }
    const statusChannel = await client.channels.fetch(PZ_STATUS_CHANNEL_ID);
    const statusMessages = await statusChannel.messages.fetch({ limit: 5 });
    const existingStatus = statusMessages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (existingStatus) pzStatusMessageId = existingStatus.id;
    await updatePZStatusEmbed();
    if (pzStatusInterval) clearInterval(pzStatusInterval);
    pzStatusInterval = setInterval(updatePZStatusEmbed, 5 * 60 * 1000);
    console.log("✅ PZ channels set up");
  } catch (err) { console.error("❌ Error setting up PZ channels:", err); }
}

async function postPZControlPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🧟 Dark Sorrows — Project Zomboid")
    .setDescription(
      "**Build 42 Unstable** | Slots: 3-4\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Dark Sorrows is our heavy hitter zombie apocalypse dedicated server. " +
      "When you go out in the world you probably won't come back unless you got the team with you. " +
      "This isn't a \"hardcore\" server. We fight to survive and have fun doing it. " +
      "If you don't enjoy the hustle and dying a lot — this isn't for you.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "📋 **Want to join?** Click **Apply to Join** below!\n\n" +
      "🔄 **Dark Sorrows PZ role** can restart or check the server using the buttons below.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setColor(0xED4245)
    .setFooter({ text: "DinoBot • Dark Sorrows PZ" });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("pz_apply").setLabel("Apply to Join").setEmoji("📋").setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("pz_restart").setLabel("Restart Server").setEmoji("🔄").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("pz_status_refresh").setLabel("Check Status").setEmoji("📡").setStyle(ButtonStyle.Secondary)
  );

  const msg = await channel.send({ embeds: [embed], components: [row1, row2] });
  pzControlPanelMessageId = msg.id;
  console.log("✅ PZ control panel posted");
}

// =================== END OF PART 1 ===================
// Continue with Part 2: slash command handler, button handler, modal handler
// =================== PART 2 ===================
// Slash command handler, button handler, modal handler
// Paste this directly after Part 1

// ----------------------------
// SLASH COMMAND HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, user } = interaction;
  const member = await guild.members.fetch(user.id);

  // /poll — all verified members
  if (commandName === "poll") {
    if (!member.roles.cache.has(ROLE_IDS.goofyGoobers) && !isStaff(member)) {
      await interaction.reply({ content: "❌ You need to be a verified member to create polls.", flags: 64 }); return;
    }
    const question = interaction.options.getString("question");
    const opts = [1,2,3,4,5,6].map(n => interaction.options.getString(`option${n}`)).filter(Boolean);
    const isYesNo = opts.length === 0;
    const MULTI_EMOJIS = ["🔵","🟡","🟢","🔴","🟠","🟣"];
    const endsAt = Date.now() + 24 * 60 * 60 * 1000;
    const endsTimestamp = Math.floor(endsAt / 1000);

    let description = `**${question}**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (isYesNo) {
      description += `👍 **Yes**\n👎 **No**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏰ **Closes:** <t:${endsTimestamp}:R>`;
    } else {
      opts.forEach((opt, i) => { description += `${MULTI_EMOJIS[i]} **${opt}**\n`; });
      description += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏰ **Closes:** <t:${endsTimestamp}:R>`;
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 Poll")
      .setDescription(description)
      .setColor(0x9146FF)
      .setFooter({ text: `Created by ${member.displayName} • DinoBot • Poll • React to vote!` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    const pollMsg = await interaction.fetchReply();
    const emojis = isYesNo ? ["👍","👎"] : MULTI_EMOJIS.slice(0, opts.length);
    for (const emoji of emojis) { await pollMsg.react(emoji); }

    const pollId = pollMsg.id;
    const timeout = setTimeout(() => closePoll(pollId), 24 * 60 * 60 * 1000);
    activePolls.set(pollId, {
      messageId: pollMsg.id, channelId: interaction.channel.id, question,
      options: isYesNo ? ["👍 Yes","👎 No"] : opts.map((o,i) => `${MULTI_EMOJIS[i]} ${o}`),
      emojis, isYesNo, endTime: endsAt, timeout
    });
    console.log(`📊 Poll created: "${question}" by ${user.tag}`);
    return;
  }

  // All moderation commands — staff only
  if (!isStaff(member)) {
    await interaction.reply({ content: "❌ You don't have permission to use moderation commands.", flags: 64 }); return;
  }

  if (commandName === "warn") {
    const target = interaction.options.getMember("member");
    const reason = interaction.options.getString("reason");
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    if (isStaff(target)) { await interaction.reply({ content: "❌ You can't warn staff members.", flags: 64 }); return; }
    const strikeCount = addStrike(target.id);
    try { await target.send({ embeds: [new EmbedBuilder().setTitle("⚠️ You've Been Warned — DinoGang").setDescription(`You received a warning from the mod team.\n\n**Reason:** ${reason}\n\n**Strike count:** ${strikeCount}\n\nPlease review the server rules and avoid further violations.`).setColor(0xFFA500).setFooter({ text: "DinoBot • Moderation" })] }); } catch {}
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Member Warned").setDescription(`**Member:** ${target} (${target.user.tag})\n**Warned by:** ${user}\n**Reason:** ${reason}\n**Strike count:** ${strikeCount}`).setColor(0xFFA500).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging warn:", err); }
    await interaction.reply({ content: `✅ **${target.user.tag}** warned. Strike count: **${strikeCount}**`, flags: 64 }); return;
  }

  if (commandName === "kick") {
    const target = interaction.options.getMember("member");
    const reason = interaction.options.getString("reason") || "No reason provided";
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    if (isStaff(target)) { await interaction.reply({ content: "❌ You can't kick staff members.", flags: 64 }); return; }
    try { await target.send({ embeds: [new EmbedBuilder().setTitle("🦵 You've Been Kicked — DinoGang").setDescription(`You were kicked from **DinoGang**.\n\n**Reason:** ${reason}\n\nYou're welcome to rejoin anytime.`).setColor(0xFF6B00).setFooter({ text: "DinoBot • Moderation" })] }); } catch {}
    try { await target.kick(reason); } catch (err) { await interaction.reply({ content: `❌ Failed to kick: ${err.message}`, flags: 64 }); return; }
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("🦵 Member Kicked").setDescription(`**Member:** ${target.user.tag}\n**Kicked by:** ${user}\n**Reason:** ${reason}`).setColor(0xFF6B00).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging kick:", err); }
    await interaction.reply({ content: `✅ **${target.user.tag}** kicked.`, flags: 64 }); return;
  }

  if (commandName === "ban") {
    const target = interaction.options.getMember("member");
    const reason = interaction.options.getString("reason") || "No reason provided";
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    if (isStaff(target)) { await interaction.reply({ content: "❌ You can't ban staff members.", flags: 64 }); return; }
    try { await target.send({ embeds: [new EmbedBuilder().setTitle("🔨 You've Been Banned — DinoGang").setDescription(`You have been **permanently banned** from **DinoGang**.\n\n**Reason:** ${reason}\n\nIf you believe this is a mistake, you may appeal via the support ticket system.`).setColor(0xED4245).setFooter({ text: "DinoBot • Moderation" })] }); } catch {}
    try { await target.ban({ reason }); } catch (err) { await interaction.reply({ content: `❌ Failed to ban: ${err.message}`, flags: 64 }); return; }
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("🔨 Member Banned").setDescription(`**Member:** ${target.user.tag}\n**Banned by:** ${user}\n**Reason:** ${reason}`).setColor(0xED4245).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging ban:", err); }
    await interaction.reply({ content: `✅ **${target.user.tag}** banned.`, flags: 64 }); return;
  }

  if (commandName === "mute") {
    const target = interaction.options.getMember("member");
    const duration = interaction.options.getInteger("duration");
    const reason = interaction.options.getString("reason") || "No reason provided";
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    if (isStaff(target)) { await interaction.reply({ content: "❌ You can't mute staff members.", flags: 64 }); return; }
    try { await target.timeout(duration * 60 * 1000, reason); } catch (err) { await interaction.reply({ content: `❌ Failed to mute: ${err.message}`, flags: 64 }); return; }
    try { await target.send({ embeds: [new EmbedBuilder().setTitle("⏱️ You've Been Muted — DinoGang").setDescription(`You have been timed out in **DinoGang** for **${duration} minute${duration === 1 ? "" : "s"}**.\n\n**Reason:** ${reason}`).setColor(0xFF6B00).setFooter({ text: "DinoBot • Moderation" })] }); } catch {}
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("⏱️ Member Muted").setDescription(`**Member:** ${target.user.tag}\n**Muted by:** ${user}\n**Duration:** ${duration} minute${duration === 1 ? "" : "s"}\n**Reason:** ${reason}`).setColor(0xFF6B00).setThumbnail(target.user.displayAvatarURL({ dynamic: true })).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging mute:", err); }
    await interaction.reply({ content: `✅ **${target.user.tag}** muted for **${duration} minute${duration === 1 ? "" : "s"}**.`, flags: 64 }); return;
  }

  if (commandName === "unmute") {
    const target = interaction.options.getMember("member");
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    try { await target.timeout(null); } catch (err) { await interaction.reply({ content: `❌ Failed to unmute: ${err.message}`, flags: 64 }); return; }
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("✅ Member Unmuted").setDescription(`**Member:** ${target.user.tag}\n**Unmuted by:** ${user}`).setColor(0x57F287).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging unmute:", err); }
    await interaction.reply({ content: `✅ **${target.user.tag}** unmuted.`, flags: 64 }); return;
  }

  if (commandName === "strikes") {
    const target = interaction.options.getMember("member");
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    const count = strikes[target.id]?.length || 0;
    await interaction.reply({ content: `📊 **${target.user.tag}** has **${count}** strike${count === 1 ? "" : "s"}.`, flags: 64 }); return;
  }

  if (commandName === "clearstrikes") {
    const target = interaction.options.getMember("member");
    if (!target) { await interaction.reply({ content: "❌ Member not found.", flags: 64 }); return; }
    delete strikes[target.id]; saveStrikes();
    try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("🗑️ Strikes Cleared").setDescription(`**Member:** ${target.user.tag}\n**Cleared by:** ${user}`).setColor(0x57F287).setTimestamp().setFooter({ text: "DinoBot • Moderation" })] }); } catch (err) { console.error("❌ Error logging clear strikes:", err); }
    await interaction.reply({ content: `✅ All strikes cleared for **${target.user.tag}**.`, flags: 64 }); return;
  }
});

// ----------------------------
// BUTTON INTERACTION HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  try {

    // RAID
    if (customId === "raid_lift_lockdown") {
      if (!isStaff(member)) { await interaction.reply({ content: "❌ Only mods can lift the lockdown.", flags: 64 }); return; }
      await liftRaidLockdown(guild);
      await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setTitle("✅ Lockdown Lifted").setColor(0x57F287).setFooter({ text: `Lifted by ${interaction.user.tag} • DinoBot • Anti-Raid Protection` })], components: [] });
      try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("✅ Raid Lockdown Lifted").setDescription(`Lockdown was lifted by **${interaction.user.tag}**.\n\nServer verification level has been restored to normal.`).setColor(0x57F287).setTimestamp().setFooter({ text: "DinoBot • Anti-Raid Protection" })] }); } catch {}
      return;
    }

    // ACCOUNT AGE CHECK
    if (customId.startsWith("agecheck_approve_")) {
      if (!isStaff(member)) { await interaction.reply({ content: "❌ Only mods can approve members.", flags: 64 }); return; }
      await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setTitle("✅ Member Approved").setFooter({ text: `Approved by ${interaction.user.tag} • DinoBot • Account Age Filter` })], components: [] });
      return;
    }
    if (customId.startsWith("agecheck_kick_")) {
      if (!isStaff(member)) { await interaction.reply({ content: "❌ Only mods can kick members.", flags: 64 }); return; }
      const targetUserId = customId.replace("agecheck_kick_", "");
      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      if (targetMember) {
        try { await targetMember.send({ embeds: [new EmbedBuilder().setTitle("👋 You were removed from DinoGang").setDescription(`Your account is too new to join this server.\n\n**Minimum account age required:** ${MIN_ACCOUNT_AGE_DAYS} days\n\nThis is an automatic security measure. Please try again once your account is older. 🦕`).setColor(0xED4245).setFooter({ text: "DinoGang • Account Age Filter" })] }); } catch {}
        await targetMember.kick("Account too new — under 7 days old");
      }
      await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setTitle("🦵 Member Kicked").setFooter({ text: `Kicked by ${interaction.user.tag} • DinoBot • Account Age Filter` })], components: [] });
      return;
    }

    // PROJECT ZOMBOID — APPLY
    if (customId === "pz_apply") {
      const modal = new ModalBuilder().setCustomId("pz_apply_modal").setTitle("📋 Dark Sorrows — Application");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pz_why").setLabel("Why do you want to join Dark Sorrows?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Tell us why you want to join...").setMinLength(10).setMaxLength(500).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pz_experience").setLabel("Tell us about your PZ experience").setStyle(TextInputStyle.Paragraph).setPlaceholder("How long have you played? What's your playstyle?").setMinLength(5).setMaxLength(500).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pz_active").setLabel("How active are you?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. A few evenings a week, weekends only, daily").setMaxLength(200).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pz_mic").setLabel("Do you have a mic?").setStyle(TextInputStyle.Short).setPlaceholder("Yes / No / Sometimes").setMaxLength(50).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pz_playstyle").setLabel("What's your playstyle?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Survivor, builder, scavenger, team player").setMaxLength(200).setRequired(true))
      );
      await interaction.showModal(modal); return;
    }

    // PROJECT ZOMBOID — RESTART
    if (customId === "pz_restart") {
      if (!member.roles.cache.has(ROLE_IDS.darkSorrowsPZ) && !isStaff(member)) {
        await interaction.reply({ content: "❌ Only the **Dark Sorrows PZ** role can restart the server.", flags: 64 }); return;
      }
      const confirmEmbed = new EmbedBuilder().setTitle("⚠️ Confirm Server Restart").setDescription("Are you sure you want to restart the **Dark Sorrows PZ** server?\n\n*This will disconnect all current players.*").setColor(0xFFA500);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("pz_restart_confirm").setLabel("Yes, Restart").setEmoji("🔄").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("pz_restart_cancel").setLabel("Cancel").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 }); return;
    }

    if (customId === "pz_restart_confirm") {
      if (!member.roles.cache.has(ROLE_IDS.darkSorrowsPZ) && !isStaff(member)) {
        await interaction.reply({ content: "❌ Only the **Dark Sorrows PZ** role can restart the server.", flags: 64 }); return;
      }
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🔄 Restarting Server...").setDescription("Sending restart command to Dark Sorrows PZ server...").setColor(0xFFA500)], components: [] });
      const result = await sendRconCommand("quit");
      if (result !== null) {
        try { const modLogs = await client.channels.fetch(MOD_LOGS_CHANNEL_ID); await modLogs.send({ embeds: [new EmbedBuilder().setTitle("🔄 PZ Server Restart").setDescription(`**Dark Sorrows PZ** server restart triggered by ${member} (${user.tag})`).setColor(0xFFA500).setTimestamp().setFooter({ text: "DinoBot • PZ Server" })] }); } catch {}
        try {
          const alertsChannel = await client.channels.fetch(PZ_ALERTS_CHANNEL_ID);
          await alertsChannel.send({ content: `<@&${ROLE_IDS.darkSorrowsPZ}>`, embeds: [new EmbedBuilder().setTitle("🔄 Server Restarting").setDescription(`The **Dark Sorrows PZ** server is restarting.\n\nTriggered by ${member}\n\nServer should be back online shortly!`).setColor(0xFFA500).setTimestamp().setFooter({ text: "DinoBot • Dark Sorrows PZ" })] });
        } catch {}
        // Poll for server coming back online, notify when ready
        setTimeout(async () => {
          let attempts = 0;
          const checkOnline = setInterval(async () => {
            attempts++;
            const status = await getPZServerStatus();
            if (status.online || attempts >= 6) {
              clearInterval(checkOnline);
              if (status.online) {
                try {
                  const alertsChannel = await client.channels.fetch(PZ_ALERTS_CHANNEL_ID);
                  await alertsChannel.send({ content: `<@&${ROLE_IDS.darkSorrowsPZ}>`, embeds: [new EmbedBuilder().setTitle("🟢 Server Back Online!").setDescription("**Dark Sorrows PZ** is back online and ready to play!\n\n🧟 Come get some!").setColor(0x57F287).setTimestamp().setFooter({ text: "DinoBot • Dark Sorrows PZ" })] });
                } catch {}
                await updatePZStatusEmbed();
              }
            }
          }, 30000);
        }, 2 * 60 * 1000);
      } else {
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Restart Failed").setDescription("Could not connect to the server via RCON. The server may already be offline or RCON is not configured.").setColor(0xED4245)], components: [] });
      }
      return;
    }

    if (customId === "pz_restart_cancel") {
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Restart Cancelled").setDescription("Server restart was cancelled.").setColor(0x57F287)], components: [] });
      return;
    }

    if (customId === "pz_status_refresh") {
      await interaction.deferReply({ flags: 64 });
      const status = await getPZServerStatus();
      const statusIcon = status.online ? "🟢 Online" : "🔴 Offline";
      let desc = `**Status:** ${statusIcon}\n**Players:** ${status.playerCount}`;
      if (status.playerCount > 0) desc += `\n\n${status.players.map(p => `• ${p}`).join("\n")}`;
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("📡 Dark Sorrows PZ — Current Status").setDescription(desc).setColor(status.online ? 0x57F287 : 0xED4245).setTimestamp().setFooter({ text: "DinoBot • Live Status Check" })] });
      await updatePZStatusEmbed();
      return;
    }

    // PROJECT ZOMBOID — APPROVE / REJECT APPLICATION
    if (customId.startsWith("pz_approve_")) {
      if (!member.roles.cache.has(ROLE_IDS.darkSorrowsPZ) && !isStaff(member)) {
        await interaction.reply({ content: "❌ Only the **Dark Sorrows PZ** role can review applications.", flags: 64 }); return;
      }
      const applicantId = customId.replace("pz_approve_", "");
      const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
      if (applicantMember) {
        await applicantMember.roles.add(ROLE_IDS.darkSorrowsPZ).catch(() => {});
        try { await applicantMember.send({ embeds: [new EmbedBuilder().setTitle("✅ Application Approved — Dark Sorrows PZ").setDescription("Your application to join **Dark Sorrows** has been **approved**! 🧟\n\nYou've been given the **Dark Sorrows PZ** role. Welcome to the crew — survive out there!\n\n*Check the #project-zomboid channel for server details.*").setColor(0x57F287).setFooter({ text: "DinoGang • Dark Sorrows PZ" })] }); } catch {}
      }
      await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setTitle(`✅ Application Approved`).setFooter({ text: `Approved by ${interaction.user.tag} • DinoBot • Dark Sorrows PZ` })], components: [] });
      return;
    }

    if (customId.startsWith("pz_reject_")) {
      if (!member.roles.cache.has(ROLE_IDS.darkSorrowsPZ) && !isStaff(member)) {
        await interaction.reply({ content: "❌ Only the **Dark Sorrows PZ** role can review applications.", flags: 64 }); return;
      }
      const applicantId = customId.replace("pz_reject_", "");
      const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
      if (applicantMember) {
        try { await applicantMember.send({ embeds: [new EmbedBuilder().setTitle("❌ Application Not Approved — Dark Sorrows PZ").setDescription("Your application to join **Dark Sorrows** was not approved at this time.\n\nSlots are limited and the crew may be full. Feel free to apply again in the future! 🦕").setColor(0xED4245).setFooter({ text: "DinoGang • Dark Sorrows PZ" })] }); } catch {}
      }
      await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ Application Rejected`).setFooter({ text: `Rejected by ${interaction.user.tag} • DinoBot • Dark Sorrows PZ` })], components: [] });
      return;
    }

    // SCHEDULE BUTTONS
    if (customId === "mrbean_update_schedule") {
      if (user.id !== guild.ownerId && !isStaff(member)) { await interaction.reply({ content: "❌ Only MrBeanTheDino and mods can update this schedule.", flags: 64 }); return; }
      const modal = new ModalBuilder().setCustomId("mrbean_schedule_modal").setTitle("📅 Update Your Stream Schedule");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("schedule_content").setLabel("Your Schedule").setStyle(TextInputStyle.Paragraph).setPlaceholder("Mon-Wed: Retro Day | Thu-Fri: Regular Day | Add times & games").setMinLength(10).setMaxLength(1000).setRequired(true)));
      await interaction.showModal(modal); return;
    }
    if (customId === "crew_update_schedule") {
      if (!member.roles.cache.has(ROLE_IDS.streamer) && !isStaff(member)) { await interaction.reply({ content: "❌ Only streamers can update the crew schedule. Assign yourself the Streamer role in #🎭pick-your-roles first!", flags: 64 }); return; }
      const modal = new ModalBuilder().setCustomId("crew_schedule_modal").setTitle("📅 Update Your Schedule");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_days").setLabel("Stream Days").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Mon / Wed / Fri").setMaxLength(100).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_time").setLabel("Stream Time").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 8PM EST").setMaxLength(50).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("sched_game").setLabel("What do you play?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Variety / Fortnite / Horror Games").setMaxLength(100).setRequired(true))
      );
      await interaction.showModal(modal); return;
    }

    // BIRTHDAY BUTTONS
    if (customId === "birthday_set") {
      const modal = new ModalBuilder().setCustomId("birthday_modal_set").setTitle("🎂 Set Your Birthday");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("birthday_month").setLabel("Birth Month (1-12)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 3 for March, 12 for December").setMinLength(1).setMaxLength(2).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("birthday_day").setLabel("Birth Day (1-31)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 15").setMinLength(1).setMaxLength(2).setRequired(true))
      );
      await interaction.showModal(modal); return;
    }
    if (customId === "birthday_remove") {
      if (!birthdays[user.id]) { await interaction.reply({ content: "❌ You don't have a birthday registered!", flags: 64 }); return; }
      delete birthdays[user.id]; saveBirthdays();
      await interaction.reply({ content: "🗑️ Your birthday has been removed.", flags: 64 }); return;
    }

    // GAME SUGGESTIONS
    if (customId === "game_suggest") {
      if (!member.roles.cache.has(ROLE_IDS.goofyGoobers) && !isStaff(member)) { await interaction.reply({ content: "❌ You need to be a verified member to suggest games.", flags: 64 }); return; }
      const modal = new ModalBuilder().setCustomId("game_suggest_modal").setTitle("🎮 Suggest a Game");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("game_name").setLabel("Game Name").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Lethal Company").setMinLength(1).setMaxLength(100).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("game_reason").setLabel("Why should the crew play this?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Tell us why it'd be fun for the group!").setMinLength(5).setMaxLength(500).setRequired(true))
      );
      await interaction.showModal(modal); return;
    }

    // LOOKING TO PLAY
    if (customId === "ltp_post") {
      if (!member.roles.cache.has(ROLE_IDS.goofyGoobers) && !isStaff(member)) { await interaction.reply({ content: "❌ You need to be a verified member to post here.", flags: 64 }); return; }
      if (activeLTPPosts.has(user.id)) { await interaction.reply({ content: "❌ You already have an active looking-to-play post! It will expire after 8 hours.", flags: 64 }); return; }
      const modal = new ModalBuilder().setCustomId("ltp_modal").setTitle("🕹️ Looking to Play");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ltp_game").setLabel("What are you playing?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Minecraft, Phasmophobia, Warzone").setMinLength(1).setMaxLength(100).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ltp_platform").setLabel("Platform").setStyle(TextInputStyle.Short).setPlaceholder("e.g. PC, PS5, Xbox, Cross-platform").setMinLength(1).setMaxLength(50).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ltp_note").setLabel("Any extra info? (optional)").setStyle(TextInputStyle.Paragraph).setPlaceholder("e.g. Looking for 2-3 people, beginner friendly, rank, etc.").setMaxLength(300).setRequired(false))
      );
      await interaction.showModal(modal); return;
    }

    // TICKET BUTTONS
    const ticketTypes = ["report","feedback","suggestion","question","appeal"];
    const ticketMatch = ticketTypes.find(t => customId === `ticket_${t}`);
    if (ticketMatch) {
      if (openTickets.has(user.id)) { await interaction.reply({ content: `❌ You already have an open ticket! <#${openTickets.get(user.id)}>`, flags: 64 }); return; }
      const modalTitles = { report: "🚨 Report a User", feedback: "💬 General Feedback", suggestion: "💡 Server Suggestion", question: "❓ Question for Mods", appeal: "⚖️ Appeal a Ban" };
      const modal = new ModalBuilder().setCustomId(`ticket_modal_${ticketMatch}_${user.id}`).setTitle(modalTitles[ticketMatch]);
      if (ticketMatch === "report") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reported_user").setLabel("Who are you reporting?").setStyle(TextInputStyle.Short).setPlaceholder("Username of the person you're reporting").setMinLength(1).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_location").setLabel("Where did this happen?").setStyle(TextInputStyle.Short).setPlaceholder("e.g. #general, voice chat, DMs").setMinLength(1).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_description").setLabel("What happened?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Describe what happened in as much detail as possible. Your identity will remain anonymous.").setMinLength(10).setMaxLength(1000).setRequired(true))
        );
      } else {
        const placeholders = { feedback: "Share your feedback about the server...", suggestion: "What would you like to suggest?", question: "What would you like to ask the mod team?", appeal: "Describe your situation and why you'd like to appeal..." };
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setPlaceholder(placeholders[ticketMatch]).setMinLength(10).setMaxLength(1000).setRequired(true)));
      }
      await interaction.showModal(modal); return;
    }

    if (customId.startsWith("ticket_resolve_")) { await logAndCloseTicket(guild, interaction.channel, customId.replace("ticket_resolve_", ""), "resolved", interaction.user); await interaction.update({ components: [] }).catch(() => {}); return; }
    if (customId.startsWith("ticket_close_")) { await logAndCloseTicket(guild, interaction.channel, customId.replace("ticket_close_", ""), "closed", interaction.user); await interaction.update({ components: [] }).catch(() => {}); return; }

    // NOTIFICATION TOGGLES
    if (customId === "notif_stream_alerts") {
      if (member.roles.cache.has(ROLE_IDS.streamAlerts)) { await member.roles.remove(ROLE_IDS.streamAlerts); await interaction.reply({ content: "🔕 **Stream Alerts** disabled.", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.streamAlerts); await interaction.reply({ content: "🔔 **Stream Alerts** enabled!", flags: 64 }); }
      return;
    }
    if (customId === "notif_announcements") {
      if (member.roles.cache.has(ROLE_IDS.announcements)) { await member.roles.remove(ROLE_IDS.announcements); await interaction.reply({ content: "🔕 **Announcements** disabled.", flags: 64 }); }
      else { await member.roles.add(ROLE_IDS.announcements); await interaction.reply({ content: "🔔 **Announcements** enabled!", flags: 64 }); }
      return;
    }

    // ROLE TOGGLES
    if (customId === "roles_gamers") { if (member.roles.cache.has(ROLE_IDS.gamers)) { await member.roles.remove(ROLE_IDS.gamers); await interaction.reply({ content: "✅ **Gamers** 🎮 role removed!", flags: 64 }); } else { await member.roles.add(ROLE_IDS.gamers); await interaction.reply({ content: "✅ **Gamers** 🎮 role assigned!", flags: 64 }); } return; }
    if (customId === "roles_creative") { if (member.roles.cache.has(ROLE_IDS.creative)) { await member.roles.remove(ROLE_IDS.creative); await interaction.reply({ content: "✅ **Creative** 🎨 role removed!", flags: 64 }); } else { await member.roles.add(ROLE_IDS.creative); await interaction.reply({ content: "✅ **Creative** 🎨 role assigned!", flags: 64 }); } return; }
    if (customId === "roles_streamer") { if (member.roles.cache.has(ROLE_IDS.streamer)) { await member.roles.remove(ROLE_IDS.streamer); await interaction.reply({ content: "✅ **Streamer** 🎙️ role removed!", flags: 64 }); } else { await member.roles.add(ROLE_IDS.streamer); await interaction.reply({ content: "✅ **Streamer** 🎙️ role assigned!", flags: 64 }); } return; }
    if (customId === "roles_viewer") { if (member.roles.cache.has(ROLE_IDS.viewer)) { await member.roles.remove(ROLE_IDS.viewer); await interaction.reply({ content: "✅ **Viewer** 👀 role removed!", flags: 64 }); } else { await member.roles.add(ROLE_IDS.viewer); await interaction.reply({ content: "✅ **Viewer** 👀 role assigned!", flags: 64 }); } return; }

    // ONBOARDING FLOW
    const parts = customId.split("_");
    const memberId = parts[parts.length - 1];
    if (memberId !== user.id) { await interaction.reply({ content: "❌ These buttons are not for you!", flags: 64 }); return; }

    if (customId.startsWith("onboard_accept_rules_")) {
      await member.roles.remove(ROLE_IDS.unverified);
      await member.roles.add(ROLE_IDS.goofyGoobers);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("✅ Rules Accepted!").setDescription("You're verified! Now let's get your roles set up.").setColor(0x57F287).setFooter({ text: "Step 1 of 4 — Complete ✅" })], components: [] });
      await sendInterestRoleSelection(interaction.channel, member); return;
    }
    if (customId.startsWith("onboard_gamers_")) { await member.roles.add(ROLE_IDS.gamers); await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎮 Gamers role assigned!").setDescription("Nice! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] }); await sendContentRoleSelection(interaction.channel, member); return; }
    if (customId.startsWith("onboard_creative_")) { await member.roles.add(ROLE_IDS.creative); await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎨 Creative role assigned!").setDescription("Nice! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] }); await sendContentRoleSelection(interaction.channel, member); return; }
    if (customId.startsWith("onboard_skip_interest_")) { await interaction.update({ embeds: [new EmbedBuilder().setTitle("⏭️ Skipped!").setDescription("No worries! Keep going...").setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Complete ✅" })], components: [] }); await sendContentRoleSelection(interaction.channel, member); return; }
    if (customId.startsWith("onboard_streamer_")) { await member.roles.add(ROLE_IDS.streamer); await interaction.update({ embeds: [new EmbedBuilder().setTitle("🎙️ Streamer role assigned!").setDescription("Almost done!").setColor(0x57F287).setFooter({ text: "Step 3 of 4 — Complete ✅" })], components: [] }); await sendNotificationSelection(interaction.channel, member); return; }
    if (customId.startsWith("onboard_viewer_")) { await member.roles.add(ROLE_IDS.viewer); await interaction.update({ embeds: [new EmbedBuilder().setTitle("👀 Viewer role assigned!").setDescription("Almost done!").setColor(0x57F287).setFooter({ text: "Step 3 of 4 — Complete ✅" })], components: [] }); await sendNotificationSelection(interaction.channel, member); return; }
    if (customId.startsWith("onboard_notif_")) {
      const stripped = customId.replace("onboard_notif_", "").replace(`_${memberId}`, "");
      if (stripped.includes("stream")) await member.roles.add(ROLE_IDS.streamAlerts);
      if (stripped.includes("announcements")) await member.roles.add(ROLE_IDS.announcements);
      const selected = [];
      if (stripped.includes("stream")) selected.push("🔴 Stream Alerts");
      if (stripped.includes("announcements")) selected.push("📢 Announcements");
      await interaction.update({ embeds: [new EmbedBuilder().setTitle("🔔 Notifications set!").setDescription(selected.length ? `You selected: **${selected.join(", ")}**\n\nYou can change this anytime in #🔔notification-settings.` : "No notifications selected. You can opt in anytime in #🔔notification-settings.").setColor(0x57F287).setFooter({ text: "Step 4 of 4 — Complete ✅" })], components: [] });
      await finishOnboarding(interaction.channel, member); return;
    }

  } catch (err) {
    console.error("❌ Button interaction error:", err);
    await interaction.reply({ content: "❌ Something went wrong. Please contact a mod.", flags: 64 }).catch(() => {});
  }
});

// ----------------------------
// MODAL SUBMIT HANDLER
// ----------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId, user, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  // PZ APPLICATION
  if (customId === "pz_apply_modal") {
    const why = interaction.fields.getTextInputValue("pz_why").trim();
    const experience = interaction.fields.getTextInputValue("pz_experience").trim();
    const active = interaction.fields.getTextInputValue("pz_active").trim();
    const mic = interaction.fields.getTextInputValue("pz_mic").trim();
    const playstyle = interaction.fields.getTextInputValue("pz_playstyle").trim();
    try {
      const reviewChannel = await client.channels.fetch(PZ_ALERTS_CHANNEL_ID);
      const appEmbed = new EmbedBuilder()
        .setTitle(`📋 PZ Application — ${member.displayName}`)
        .setDescription(
          `**Applicant:** ${member} (${user.tag})\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**Why do you want to join?**\n${why}\n\n` +
          `**PZ Experience:**\n${experience}\n\n` +
          `**How active?** ${active}\n\n` +
          `**Mic?** ${mic}\n\n` +
          `**Playstyle:** ${playstyle}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Use the buttons below to approve or reject.*`
        )
        .setColor(0xED4245)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: "DinoBot • Dark Sorrows PZ Application" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pz_approve_${user.id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pz_reject_${user.id}`).setLabel("Reject").setEmoji("❌").setStyle(ButtonStyle.Danger)
      );
      await reviewChannel.send({ content: `<@&${ROLE_IDS.darkSorrowsPZ}> 📋 New PZ application!`, embeds: [appEmbed], components: [row] });
      await interaction.reply({ content: "✅ Your application has been submitted! The Dark Sorrows crew will review it and get back to you. 🧟", flags: 64 });
      console.log(`📋 PZ application from ${user.tag}`);
    } catch (err) { console.error("❌ Error submitting PZ application:", err); await interaction.reply({ content: "❌ Failed to submit application. Please try again or contact a mod.", flags: 64 }); }
    return;
  }

  // MRBEAN SCHEDULE
  if (customId === "mrbean_schedule_modal") {
    const content = interaction.fields.getTextInputValue("schedule_content").trim();
    try {
      const channel = await client.channels.fetch(mrbeanScheduleChannelId);
      const msg = await channel.messages.fetch(mrbeanScheduleMessageId);
      await msg.edit({ embeds: [new EmbedBuilder().setTitle("📅 MrBeanTheDino — Stream Schedule").setDescription("Here's when MrBeanTheDino is live!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" + content + "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Schedule subject to change. Follow on Twitch for live notifications!*").setColor(0x9146FF).setFooter({ text: "DinoBot • Stream Schedule • Last updated" }).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("mrbean_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary))] });
      await interaction.reply({ content: "✅ Your schedule has been updated!", flags: 64 });
    } catch (err) { console.error("❌ Error updating MrBean schedule:", err); await interaction.reply({ content: "❌ Failed to update schedule.", flags: 64 }); }
    return;
  }

  // CREW SCHEDULE
  if (customId === "crew_schedule_modal") {
    const days = interaction.fields.getTextInputValue("sched_days").trim();
    const time = interaction.fields.getTextInputValue("sched_time").trim();
    const game = interaction.fields.getTextInputValue("sched_game").trim();
    schedules[user.id] = { username: member.displayName, days, time, game };
    saveSchedules();
    await updateCrewScheduleEmbed();
    await interaction.reply({ content: `✅ Schedule updated!\n\n📆 **${days}** • 🕐 **${time}** • 🎮 **${game}**`, flags: 64 });
    return;
  }

  // BIRTHDAY
  if (customId === "birthday_modal_set") {
    const month = parseInt(interaction.fields.getTextInputValue("birthday_month").trim());
    const day = parseInt(interaction.fields.getTextInputValue("birthday_day").trim());
    if (isNaN(month) || month < 1 || month > 12) { await interaction.reply({ content: "❌ Invalid month! Please enter a number between 1 and 12.", flags: 64 }); return; }
    if (isNaN(day) || day < 1 || day > 31) { await interaction.reply({ content: "❌ Invalid day! Please enter a number between 1 and 31.", flags: 64 }); return; }
    birthdays[user.id] = { month, day }; saveBirthdays();
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    await interaction.reply({ content: `🎂 Your birthday has been set to **${monthNames[month - 1]} ${day}**! DinoBot will celebrate with you on your special day! 🦕🎉`, flags: 64 });
    return;
  }

  // GAME SUGGESTION
  if (customId === "game_suggest_modal") {
    const gameName = interaction.fields.getTextInputValue("game_name").trim();
    const gameReason = interaction.fields.getTextInputValue("game_reason").trim();
    try {
      const channel = await client.channels.fetch(GAME_SUGGESTIONS_CHANNEL_ID);
      const embed = new EmbedBuilder().setTitle(`🎮 ${gameName}`).setDescription(`${gameReason}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ React to vote yes  •  ❌ React to vote no`).setColor(0x57F287).setFooter({ text: `Suggested by ${member.displayName} • DinoBot • Game Suggestions` }).setTimestamp();
      const suggestionMsg = await channel.send({ embeds: [embed] });
      await suggestionMsg.react("✅");
      await suggestionMsg.react("❌");
      await interaction.reply({ content: `✅ Your suggestion for **${gameName}** has been posted!`, flags: 64 });
      console.log(`🎮 Game suggestion: ${gameName} by ${user.tag}`);
    } catch (err) { console.error("❌ Error posting game suggestion:", err); await interaction.reply({ content: "❌ Failed to post suggestion.", flags: 64 }); }
    return;
  }

  // LOOKING TO PLAY
  if (customId === "ltp_modal") {
    const game = interaction.fields.getTextInputValue("ltp_game").trim();
    const platform = interaction.fields.getTextInputValue("ltp_platform").trim();
    const note = interaction.fields.getTextInputValue("ltp_note")?.trim() || null;
    try {
      const channel = await client.channels.fetch(LOOKING_TO_PLAY_CHANNEL_ID);
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      const expiresTimestamp = Math.floor(expiresAt / 1000);
      const embed = new EmbedBuilder()
        .setTitle(`🕹️ ${member.displayName} is looking to play!`)
        .setDescription(`🎮 **Game:** ${game}\n🖥️ **Platform:** ${platform}\n${note ? `📝 **Note:** ${note}\n` : ""}\n⏰ **Expires:** <t:${expiresTimestamp}:R>`)
        .setColor(0x9146FF).setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "DinoBot • Looking to Play • Posts expire after 8 hours" }).setTimestamp();
      const ltpMsg = await channel.send({ content: `<@${user.id}>`, embeds: [embed] });
      const timeout = setTimeout(async () => {
        try { await ltpMsg.delete(); activeLTPPosts.delete(user.id); console.log(`🗑️ LTP post expired for ${user.tag}`); } catch {}
      }, 8 * 60 * 60 * 1000);
      activeLTPPosts.set(user.id, { messageId: ltpMsg.id, timeout });
      await interaction.reply({ content: `✅ Your looking-to-play post for **${game}** has been posted! It will automatically be removed after 8 hours.`, flags: 64 });
      console.log(`🕹️ LTP post: ${user.tag} — ${game} on ${platform}`);
    } catch (err) { console.error("❌ Error posting LTP:", err); await interaction.reply({ content: "❌ Failed to post. Please try again.", flags: 64 }); }
    return;
  }

  // TICKETS
  if (!customId.startsWith("ticket_modal_")) return;
  const ticketType = customId.replace("ticket_modal_", "").split("_")[0];
  const anonymous = ticketType === "report";
  const description = interaction.fields.getTextInputValue("ticket_description");
  const location = ticketType === "report" ? interaction.fields.getTextInputValue("ticket_location") : null;
  const reportedUser = ticketType === "report" ? interaction.fields.getTextInputValue("reported_user") : null;
  try {
    if (openTickets.has(user.id)) { await interaction.reply({ content: `❌ You already have an open ticket! <#${openTickets.get(user.id)}>`, flags: 64 }); return; }
    const ticketChannel = await createTicketChannel(guild, member, ticketType, anonymous, description, location, reportedUser);
    if (!ticketChannel) { await interaction.reply({ content: "❌ You already have an open ticket!", flags: 64 }); return; }
    if (anonymous) { await interaction.reply({ content: "🔒 Your anonymous report has been submitted. The mod team will handle it shortly.", flags: 64 }); }
    else { await interaction.reply({ content: `✅ Your ticket has been created! <#${ticketChannel.id}>`, flags: 64 }); }
  } catch (err) { console.error("❌ Modal submit error:", err); await interaction.reply({ content: "❌ Something went wrong. Please contact a mod.", flags: 64 }).catch(() => {}); }
});

// =================== END OF PART 2 ===================
// Continue with Part 3: setup functions, channel builders, onboarding, Twitch, server boot
// =================== PART 3 ===================
// All setup functions, onboarding, tickets, birthday, schedules, Twitch, server boot
// Paste this directly after Part 2

// ----------------------------
// ACCOUNT AGE CHECK
// ----------------------------
async function checkAccountAge(member) {
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays >= MIN_ACCOUNT_AGE_DAYS) return;
  const ageDisplay = accountAgeDays < 1 ? `${Math.floor(accountAgeDays * 24)} hours` : `${Math.floor(accountAgeDays)} days`;
  try {
    const modLogsChannel = await client.channels.fetch(MOD_LOGS_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setTitle("⚠️ New Account Flagged")
      .setDescription(`A new member joined with a suspiciously new account.\n\n**Member:** ${member} (${member.user.tag})\n**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>\n**Account Age:** ${ageDisplay}\n**Minimum Required:** ${MIN_ACCOUNT_AGE_DAYS} days\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Use the buttons below to approve or kick this member.*`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0xFFA500).setTimestamp().setFooter({ text: "DinoBot • Account Age Filter" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`agecheck_approve_${member.id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`agecheck_kick_${member.id}`).setLabel("Kick").setEmoji("🦵").setStyle(ButtonStyle.Danger)
    );
    await modLogsChannel.send({ content: `<@&${ROLE_IDS.mods}> ⚠️ New account flagged!`, embeds: [embed], components: [row] });
  } catch (err) { console.error("❌ Error sending account age alert:", err); }
}

// ----------------------------
// WELCOME NEW MEMBERS
// ----------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    const isRaiding = await checkRaid(await client.guilds.fetch(GUILD_ID), member);
    if (isRaiding) return;
    await member.roles.add(ROLE_IDS.unverified);
    const guild = await client.guilds.fetch(GUILD_ID);
    const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    await welcomeChannel.send({ embeds: [new EmbedBuilder()
      .setTitle(`🦕 Welcome to the server, ${member.user.username}!`)
      .setDescription(`Hey ${member}! Welcome to the community! 🎉\n\n**To get started:**\nHead over to your **private onboarding channel** under the ONBOARDING category — DinoBot has set it up just for you!\n\nInside you'll find the server rules and everything you need to get set up. See you in there! 🦕`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x9146FF).setFooter({ text: `Member #${guild.memberCount}` }).setTimestamp()]
    });
    await checkAccountAge(member);
    await createOnboardingChannel(guild, member);
  } catch (err) { console.error("❌ Error handling new member:", err); }
});

// ----------------------------
// CREATE ONBOARDING CHANNEL
// ----------------------------
async function createOnboardingChannel(guild, member) {
  try {
    const channelName = `welcome-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const channels = await guild.channels.fetch();
    const existing = channels.find(c => c.parentId === onboardingCategoryId && c.name === channelName);
    if (existing) return;

    const channel = await guild.channels.create({
      name: channelName, type: ChannelType.GuildText, parent: onboardingCategoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });

    // 24hr timeout — kick if still unverified, delete channel either way
    setTimeout(async () => {
      try {
        const freshMember = await guild.members.fetch(member.id).catch(() => null);
        const staleChannel = await guild.channels.fetch(channel.id).catch(() => null);
        if (freshMember && freshMember.roles.cache.has(ROLE_IDS.unverified)) {
          try { await freshMember.send({ embeds: [new EmbedBuilder().setTitle("👋 You were removed from DinoGang").setDescription("Hey! You didn't complete onboarding in time.\n\n**You need to accept the rules to join the server.**\n\nYou're always welcome to rejoin and finish onboarding — it only takes a minute! 🦕\n\n*If you have any issues joining, feel free to reach out.*").setColor(0xED4245).setFooter({ text: "DinoGang • Onboarding Timeout" })] }); } catch {}
          await freshMember.kick("Did not complete onboarding within 24 hours");
        }
        if (staleChannel) await staleChannel.delete().catch(() => {});
      } catch (err) { console.error("❌ Onboarding timeout error:", err); }
    }, 24 * 60 * 60 * 1000);

    await channel.send({
      content: `${member}`,
      embeds: [new EmbedBuilder()
        .setTitle("📋 Server Rules")
        .setDescription(
          `Hey ${member}! Welcome to **DinoGang** 🦕\n\nBefore you get access to the server please read and accept the rules below.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**🔞 Age Requirement**\nThis server is 18+ only. Anyone found to be under 18 will be removed immediately.\n\n` +
          `**🤝 Respect Everyone**\nNo harassment, bullying, hate speech, personal attacks, or threats. Friendly banter is fine — targeted harassment is not.\n\n` +
          `**🚫 Illegal Content**\nNo illegal material, piracy, doxxing, malware, scams, or phishing. Violations result in immediate removal.\n\n` +
          `**🔞 Mature Content**\nMature humor is allowed. No explicit pornography, non-consensual content, or illegal adult material.\n\n` +
          `**💬 Spam & Channel Use**\nKeep channels on topic. No spam, flooding, or mass pinging.\n\n` +
          `**📢 Advertising**\nSelf promotion is allowed only in #shameless-plug. No advertising in other channels.\n\n` +
          `**🎙️ Voice Chat**\nNo intentional disruption, soundboard spam, or disrespecting others in voice.\n\n` +
          `**⚠️ Moderation**\nFollow moderator instructions. Breaking rules may result in a warning, mute, kick, or ban.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✔️ **We're all here to hang out, game, and have fun. Be respectful and enjoy the community.**\n\n` +
          `*By clicking **Accept Rules** below you confirm you are 18+ and agree to follow all server rules.*`
        )
        .setColor(0x9146FF).setFooter({ text: "Step 1 of 4 — Accept Rules" })
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`onboard_accept_rules_${member.id}`).setLabel("Accept Rules").setEmoji("✅").setStyle(ButtonStyle.Success)
      )]
    });
  } catch (err) { console.error("❌ Error creating onboarding channel:", err); }
}

// ----------------------------
// ONBOARDING STEP SENDERS
// ----------------------------
async function sendInterestRoleSelection(channel, member) {
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("🎭 Optional Role")
      .setDescription("Want access to a private interest space?\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 **Gamers** — private hangout for gamers\n🎨 **Creative** — private hangout for creative types\n⏭️ **Skip** — no role assigned, no questions asked\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ **This role is completely optional.**\n\n*This selection is completely private. Nobody else can see what you choose.*")
      .setColor(0x9146FF).setFooter({ text: "Step 2 of 4 — Pick a role or skip" })
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`onboard_gamers_${member.id}`).setLabel("Gamers").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_creative_${member.id}`).setLabel("Creative").setEmoji("🎨").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_skip_interest_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
    )]
  });
}

async function sendContentRoleSelection(channel, member) {
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("🎮 Content Role")
      .setDescription("Are you a streamer or a viewer?\n\n🎙️ **Streamer** — You stream on Twitch\n👀 **Viewer** — You watch streams")
      .setColor(0x9146FF).setFooter({ text: "Step 3 of 4 — Pick your content role" })
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`onboard_streamer_${member.id}`).setLabel("Streamer").setEmoji("🎙️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_viewer_${member.id}`).setLabel("Viewer").setEmoji("👀").setStyle(ButtonStyle.Secondary)
    )]
  });
}

async function sendNotificationSelection(channel, member) {
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("🔔 Notification Preferences")
      .setDescription("Last step! Choose which notifications you want to receive.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔴 **Stream Alerts** — get pinged when a DinoGang member goes live\n\n📢 **Announcements** — get pinged for important server announcements\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*You can change this anytime in #🔔notification-settings.*")
      .setColor(0x9146FF).setFooter({ text: "Step 4 of 4 — Notification preferences" })
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`onboard_notif_stream_${member.id}`).setLabel("Stream Alerts").setEmoji("🔴").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`onboard_notif_announcements_${member.id}`).setLabel("Announcements").setEmoji("📢").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_notif_stream_and_announcements_${member.id}`).setLabel("Both").setEmoji("🔔").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`onboard_notif_skip_${member.id}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
    )]
  });
}

async function finishOnboarding(channel, member) {
  await channel.send({ embeds: [new EmbedBuilder().setTitle("🦕 You're all set!").setDescription("Welcome to the crew! You now have full access to the server. 🎉\n\nThis channel will self-destruct in 30 seconds. See you in there!").setColor(0x57F287).setFooter({ text: "Onboarding complete — channel deleting in 30 seconds" })] });
  console.log(`✅ Onboarding complete for ${member.user.tag}`);
  setTimeout(async () => { await channel.delete().catch(() => {}); }, 30000);
}

// ----------------------------
// CREATE TICKET CHANNEL
// ----------------------------
async function createTicketChannel(guild, member, ticketType, anonymous, description = null, location = null, reportedUser = null) {
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
  const channelName = `ticket-${safeName}`;
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.parentId === ticketsCategoryId && c.name === channelName);
  if (existing) return null;

  const permOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
  ];
  if (!anonymous) permOverwrites.push({ id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: ticketsCategoryId, permissionOverwrites });
  openTickets.set(member.id, channel.id);

  const typeLabels = { report: "🚨 Report a User", feedback: "💬 General Feedback", suggestion: "💡 Server Suggestion", question: "❓ Question for Mods", appeal: "⚖️ Appeal a Ban" };
  let descriptionText = anonymous ? "🔒 **This ticket is anonymous.** The mod team cannot see who submitted it.\n\n" : `👤 **Submitted by:** ${member}\n\n`;
  if (reportedUser) descriptionText += `**Reported User:** ${reportedUser}\n\n`;
  if (location) descriptionText += `**Where did this happen?** ${location}\n\n`;
  if (description) descriptionText += `**Description:**\n${description}\n\n`;
  descriptionText += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Use the buttons below to close this ticket when resolved.*";

  await channel.send({
    content: anonymous ? `<@&${ROLE_IDS.mods}> 🎟️ New anonymous report!` : `<@&${ROLE_IDS.mods}> 🎟️ New ticket from ${member}!`,
    embeds: [new EmbedBuilder().setTitle(`🎟️ ${typeLabels[ticketType]}`).setDescription(descriptionText).setColor(0x9146FF).setTimestamp().setFooter({ text: `DinoBot • Ticket System • ${typeLabels[ticketType]}` })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_resolve_${member.id}`).setLabel("Resolve").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_close_${member.id}`).setLabel("Close Without Resolving").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
    )]
  });
  return channel;
}

// ----------------------------
// LOG AND CLOSE TICKET
// ----------------------------
async function logAndCloseTicket(guild, channel, ticketUserId, status, closedBy) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const firstEmbed = messages.filter(m => m.embeds.length > 0).last();
    const ticketType = firstEmbed?.embeds[0]?.footer?.text?.replace("DinoBot • Ticket System • ", "") || "Unknown";
    openTickets.delete(ticketUserId);
    if (modTicketsChannelId) {
      const logChannel = await guild.channels.fetch(modTicketsChannelId).catch(() => null);
      if (logChannel) {
        await logChannel.send({ embeds: [new EmbedBuilder()
          .setTitle(`🎟️ Ticket ${status === "resolved" ? "Resolved ✅" : "Closed 🗑️"}`)
          .setDescription(`**Type:** ${ticketType}\n**Status:** ${status === "resolved" ? "✅ Resolved" : "🗑️ Closed without resolving"}\n**Closed by:** ${closedBy}\n**Channel:** ${channel.name}`)
          .setColor(status === "resolved" ? 0x57F287 : 0xED4245).setTimestamp().setFooter({ text: "DinoBot • Ticket Log" })]
        });
      }
    }
    setTimeout(async () => { await channel.delete().catch(() => {}); }, 5000);
  } catch (err) { console.error("❌ Error closing ticket:", err); }
}

// ----------------------------
// BIRTHDAY SCHEDULER
// ----------------------------
function startBirthdayScheduler() {
  console.log("🎂 Birthday scheduler started");
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const msUntilMidnight = nextMidnightUTC - now;
  setTimeout(async () => { await runBirthdayCheck(); setInterval(runBirthdayCheck, 24 * 60 * 60 * 1000); }, msUntilMidnight);
  console.log(`⏰ Next birthday check in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
}

async function runBirthdayCheck() {
  const now = new Date();
  const todayMonth = now.getUTCMonth() + 1;
  const todayDay = now.getUTCDate();
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await cleanupBirthdays(guild);
    for (const [userId, data] of Object.entries(birthdays)) {
      if (data.month === todayMonth && data.day === todayDay) await celebrateBirthday(guild, userId);
    }
  } catch (err) { console.error("❌ Birthday check error:", err); }
}

async function cleanupBirthdays(guild) {
  try {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.roles.cache.has(ROLE_IDS.birthday)) await member.roles.remove(ROLE_IDS.birthday).catch(() => {});
    }
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel && channel.parentId === birthdayCategoryId && channel.name.startsWith("🎉happy-birthday-")) await channel.delete().catch(() => {});
    }
  } catch (err) { console.error("❌ Birthday cleanup error:", err); }
}

async function celebrateBirthday(guild, userId) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await member.roles.add(ROLE_IDS.birthday).catch(() => {});
    const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const channel = await guild.channels.create({
      name: `🎉happy-birthday-${safeName}`, type: ChannelType.GuildText, parent: birthdayCategoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ROLE_IDS.goofyGoobers, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions] }
      ]
    });
    await channel.send({
      content: `<@&${ROLE_IDS.announcements}> 🎂 It's someone's birthday!`,
      embeds: [new EmbedBuilder()
        .setTitle(`🎂 Happy Birthday, ${member.user.username}! 🎉`)
        .setDescription(`${member} — today is YOUR day! 🦕🎉\n\nThe whole DinoGang is here to celebrate with you!\n\nDrop your birthday wishes below and let's make it a great one! 🎈🎊🥳`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor(0xFF73FA).setFooter({ text: "DinoBot • Birthday System" }).setTimestamp()
      ]
    });
    try { await member.send({ embeds: [new EmbedBuilder().setTitle("🎂 Happy Birthday from DinoGang! 🦕").setDescription("Hey! The whole crew wants to wish you a **Happy Birthday**! 🎉\n\nHead to the server — there's a special birthday channel just for you today! 🎈\n\nHope your day is amazing! 🥳").setColor(0xFF73FA).setFooter({ text: "DinoBot • Happy Birthday! 🎂" })] }); } catch {}
  } catch (err) { console.error(`❌ Error celebrating birthday for ${userId}:`, err); }
}

// ----------------------------
// SETUP FUNCTIONS — CATEGORIES
// ----------------------------
async function setupOnboardingCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "ONBOARDING");
  if (existing) { onboardingCategoryId = existing.id; return; }
  const category = await guild.channels.create({ name: "ONBOARDING", type: ChannelType.GuildCategory, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] });
  onboardingCategoryId = category.id;
  console.log("✅ Onboarding category created");
}

async function setupStaffCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "STAFF ONLY");
  if (existing) { staffCategoryId = existing.id; return; }
  const category = await guild.channels.create({
    name: "STAFF ONLY", type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
    ]
  });
  staffCategoryId = category.id;
  console.log("✅ Staff Only category created");
}

async function setupTicketsCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "TICKETS");
  if (existing) { ticketsCategoryId = existing.id; return; }
  const category = await guild.channels.create({ name: "TICKETS", type: ChannelType.GuildCategory, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] });
  ticketsCategoryId = category.id;
  console.log("✅ Tickets category created");
}

async function setupBirthdayCategory() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.type === ChannelType.GuildCategory && c.name === "BIRTHDAYS");
  if (existing) { birthdayCategoryId = existing.id; return; }
  const category = await guild.channels.create({
    name: "BIRTHDAYS", type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.goofyGoobers, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });
  birthdayCategoryId = category.id;
  console.log("✅ Birthdays category created");
}

// ----------------------------
// SETUP FUNCTIONS — CHANNELS
// ----------------------------
async function setupRulesMessage() {
  const rulesChannel = await client.channels.fetch(RULES_CHANNEL_ID);
  const messages = await rulesChannel.messages.fetch({ limit: 10 });
  const botMessages = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMessages.size >= 1) { return; }
  await rulesChannel.send({ embeds: [new EmbedBuilder()
    .setTitle("📋 Server Rules")
    .setDescription(
      "Welcome to the server! This is a **private 18+ community** for gaming, streaming, and hanging out.\n\n" +
      "**🔞 Age Requirement**\nThis server is 18+ only. Anyone found to be under 18 will be removed immediately.\n\n" +
      "**🤝 Respect Everyone**\nNo harassment, bullying, hate speech, personal attacks, or threats. Friendly banter is fine — targeted harassment is not.\n\n" +
      "**🚫 Illegal Content**\nNo illegal material, piracy, doxxing, malware, scams, or phishing. Violations result in immediate removal.\n\n" +
      "**🔞 Mature Content**\nMature humor is allowed. No explicit pornography, non-consensual content, or illegal adult material.\n\n" +
      "**💬 Spam & Channel Use**\nKeep channels on topic. No spam, flooding, or mass pinging.\n\n" +
      "**📢 Advertising**\nSelf promotion is allowed only in #shameless-plug. No advertising in other channels.\n\n" +
      "**🎙️ Voice Chat**\nNo intentional disruption, soundboard spam, or disrespecting others in voice.\n\n" +
      "**⚠️ Moderation**\nFollow moderator instructions. Breaking rules may result in a warning, mute, kick, or ban.\n\n" +
      "✔️ **We're all here to hang out, game, and have fun. Be respectful and enjoy the community.**"
    )
    .setColor(0x9146FF)
  ]});
  console.log("✅ Rules message posted");
}

async function setupPickRolesChannel() {
  const channel = await client.channels.fetch(PICK_ROLES_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { return; }
  const embed = new EmbedBuilder()
    .setTitle("🎭 Pick Your Roles")
    .setDescription("Use the buttons below to assign or update your roles anytime!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Optional — Interest Space**\n\n🎮 **Gamers** — private hangout space for gamers\n🎨 **Creative** — private hangout space for creative types\n\n⚠️ These roles are completely optional and exist as private spaces for members with shared interests. These unlock private hidden channels. You are under no obligation to pick one.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n**Content Role**\n\n🎙️ **Streamer** — You stream on Twitch\n👀 **Viewer** — You watch streams\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Clicking a role button will toggle it on or off.*")
    .setColor(0x9146FF).setFooter({ text: "DinoBot • Role Selection" });
  await channel.send({ embeds: [embed], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("roles_gamers").setLabel("Gamers").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("roles_creative").setLabel("Creative").setEmoji("🎨").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("roles_streamer").setLabel("Streamer").setEmoji("🎙️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("roles_viewer").setLabel("Viewer").setEmoji("👀").setStyle(ButtonStyle.Secondary)
    )
  ]});
  console.log("✅ Pick your roles message posted");
}

async function setupNotificationChannel() {
  const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { return; }
  const embed = new EmbedBuilder()
    .setTitle("🔔 Notification Settings")
    .setDescription("Choose which notifications you want to receive.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔴 **Stream Alerts** — get pinged when a DinoGang member goes live on Twitch\n\n📢 **Announcements** — get pinged for important server announcements\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Clicking a button will toggle the notification on or off. Only you can see the confirmation message.*")
    .setColor(0x9146FF).setFooter({ text: "DinoBot • Notification Settings" });
  await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("notif_stream_alerts").setLabel("Stream Alerts").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("notif_announcements").setLabel("Announcements").setEmoji("📢").setStyle(ButtonStyle.Primary)
  )]});
  console.log("✅ Notification settings message posted");
}

async function setupBotInfoChannel() {
  const channel = await client.channels.fetch(BOT_INFO_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 10 });
  const botMsgs = messages.filter(m => m.author.id === client.user.id);
  for (const msg of botMsgs.values()) await msg.delete().catch(() => {});
  await channel.send({ embeds: [new EmbedBuilder()
    .setTitle("🤖 DinoBot — Server Guide")
    .setDescription(
      "Hey there! I'm **DinoBot** 🦕 — the custom bot built specifically for **DinoGang**.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**⚙️ What DinoBot Does**\n\n" +
      "🔴 **Twitch Live Alerts** — posts an alert whenever a DinoGang member goes live\n\n" +
      "👋 **Member Onboarding** — private channel setup flow for new members\n\n" +
      "🎭 **Role Management** — self-assign interest, content, and notification roles\n\n" +
      "🔔 **Notification Controls** — opt in or out of stream alerts and announcements\n\n" +
      "🔗 **Link Protection** — blocks known scam, phishing, malware, and adult domains\n\n" +
      "🎟️ **Ticket System** — private tickets to the mod team\n\n" +
      "⚠️ **Account Age Filter** — accounts under 7 days old are flagged for mod review\n\n" +
      "🎂 **Birthday System** — register your birthday for a celebration channel\n\n" +
      "📅 **Stream Schedules** — MrBeanTheDino's schedule and the full crew schedule\n\n" +
      "🚫 **Word Filter** — auto-deletes hate speech with a 3-strike system\n\n" +
      "🛡️ **Anti-Raid Protection** — locks down if a raid is detected\n\n" +
      "🎮 **Game Suggestions** — suggest and vote on games for the crew to play\n\n" +
      "🕹️ **Looking to Play** — post what you're playing and find others to game with\n\n" +
      "📊 **Poll System** — create Yes/No or multi-option polls, auto-close after 24hrs\n\n" +
      "✏️ **Message Logging** — edited and deleted messages logged to mod-logs\n\n" +
      "🧟 **Project Zomboid** — Dark Sorrows server panel, live status & applications\n\n" +
      "🔨 **Moderation Tools** — /warn, /kick, /ban, /mute, /unmute, /strikes, /clearstrikes\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "**🛠️ Commands**\n\n" +
      "`/poll question [options]` — create a poll (24hr auto-close, up to 6 options)\n" +
      "`/warn @member reason` — warn a member (adds a strike)\n" +
      "`/kick @member reason` — kick a member\n" +
      "`/ban @member reason` — permanently ban a member\n" +
      "`/mute @member duration reason` — timeout a member (minutes)\n" +
      "`/unmute @member` — remove a timeout\n" +
      "`/strikes @member` — check a member's strike count\n" +
      "`/clearstrikes @member` — clear all strikes for a member\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*DinoBot is a custom bot built for DinoGang* 🦕"
    )
    .setColor(0x9146FF).setFooter({ text: "DinoBot • Server Guide" })
  ]});
  console.log("✅ Bot info message posted");
}

async function setupSupportChannel() {
  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { return; }
  const embed = new EmbedBuilder()
    .setTitle("🎟️ Support & Tickets")
    .setDescription("Need help or want to reach the mods? Use the buttons below to open a ticket.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🚨 **Report a User** — report a member for breaking rules *(anonymous)*\n\n💬 **General Feedback** — share general feedback about the server\n\n💡 **Server Suggestion** — suggest a new feature or change\n\n❓ **Question for Mods** — ask the mod team something privately\n\n⚖️ **Appeal a Ban** — appeal a ban or punishment\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚠️ **You can only have one open ticket at a time.**\nPlease be patient — mods will respond as soon as possible.\n\n*All tickets are private between you and the mod team.*")
    .setColor(0x9146FF).setFooter({ text: "DinoBot • Support System" });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_report").setLabel("Report a User").setEmoji("🚨").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_feedback").setLabel("General Feedback").setEmoji("💬").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_suggestion").setLabel("Server Suggestion").setEmoji("💡").setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_question").setLabel("Question for Mods").setEmoji("❓").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_appeal").setLabel("Appeal a Ban").setEmoji("⚖️").setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed], components: [row1, row2] });
  console.log("✅ Support message posted");
}

async function setupModTicketsChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const existing = channels.find(c => c.parentId === staffCategoryId && c.name === "🔒mod-tickets");
  if (existing) { modTicketsChannelId = existing.id; return; }
  const channel = await guild.channels.create({
    name: "🔒mod-tickets", type: ChannelType.GuildText, parent: staffCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ROLE_IDS.mods, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
      { id: ROLE_IDS.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }
    ]
  });
  modTicketsChannelId = channel.id;
  console.log("✅ Mod tickets channel created");
}

async function setupBirthdayRegisterChannel() {
  const channel = await client.channels.fetch(BIRTHDAY_REGISTER_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (botMsg) { console.log("ℹ️ Birthday register channel already exists"); return; }
  const embed = new EmbedBuilder()
    .setTitle("🎂 Birthday Register")
    .setDescription("Want DinoBot to celebrate your birthday? Register it below! 🦕\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🎉 **What happens on your birthday:**\n\n- A private birthday channel is created just for you\n- The whole server can come wish you happy birthday\n- You get a special 🎂 Birthday role for the day\n- DinoBot will DM you happy birthday\n- Channel and role are removed at midnight 🕛\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔒 **Privacy:** Only your month and day are stored — no year is ever collected.\n\n*Use the buttons below to set or remove your birthday.*")
    .setColor(0xFF73FA).setFooter({ text: "DinoBot • Birthday System" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("birthday_set").setLabel("Set My Birthday").setEmoji("🎂").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("birthday_remove").setLabel("Remove My Birthday").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  await channel.send({ embeds: [embed], components: [row] });
  console.log("✅ Birthday register message posted");
}

async function setupMrBeanScheduleChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  let channel;
  try { channel = await client.channels.fetch(MRBEAN_SCHEDULE_CHANNEL_ID); } catch {
    channel = await guild.channels.create({ name: "📅mrbean-schedule", type: ChannelType.GuildText, parent: MRBEAN_CATEGORY_ID, permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] }] });
  }
  mrbeanScheduleChannelId = channel.id;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (existing) { mrbeanScheduleMessageId = existing.id; return; }
  const msg = await channel.send({ embeds: [buildMrBeanScheduleEmbed()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("mrbean_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary))] });
  mrbeanScheduleMessageId = msg.id;
  console.log("✅ MrBean schedule posted");
}

function buildMrBeanScheduleEmbed() {
  return new EmbedBuilder()
    .setTitle("📅 MrBeanTheDino — Stream Schedule")
    .setDescription("Here's when MrBeanTheDino is live! All times are **PST**.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🕹️ **Retro Day**\n📆 Monday / Tuesday / Wednesday\n🕐 2:00PM – 6:00PM PST\n🎮 Retro Games\n\n🎲 **Regular Day**\n📆 Thursday / Friday\n🕐 2:00PM – 6:00PM PST\n🎮 Variety\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Schedule subject to change. Follow on Twitch for live notifications!*")
    .setColor(0x9146FF).setFooter({ text: "DinoBot • Stream Schedule • Last updated" }).setTimestamp();
}

async function setupCrewScheduleChannel() {
  const guild = await client.guilds.fetch(GUILD_ID);
  let channel;
  try { channel = await client.channels.fetch(CREW_SCHEDULE_CHANNEL_ID); } catch {
    channel = await guild.channels.create({ name: "📅crew-schedule", type: ChannelType.GuildText, parent: STREAMING_CATEGORY_ID, permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: ROLE_IDS.unverified, deny: [PermissionFlagsBits.ViewChannel] }] });
  }
  crewScheduleChannelId = channel.id;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (existing) { crewScheduleMessageId = existing.id; return; }
  const msg = await channel.send({ embeds: [buildCrewScheduleEmbed()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("crew_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary))] });
  crewScheduleMessageId = msg.id;
  console.log("✅ Crew schedule posted");
}

function buildCrewScheduleEmbed() {
  const entries = Object.entries(schedules);
  let description = "Click **Update My Schedule** below to add or update your stream schedule.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  if (entries.length === 0) { description += "*No schedules set yet. Streamers — add yours below!*\n\n"; }
  else { for (const [, data] of entries) { description += `🎮 **${data.username}**\n📆 ${data.days}  🕐 ${data.time}  🎮 ${data.game}\n\n`; } }
  description += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*All times in the streamer's local timezone unless noted.*";
  return new EmbedBuilder().setTitle("📅 DinoGang Crew — Stream Schedule").setDescription(description).setColor(0x9146FF).setFooter({ text: "DinoBot • Crew Schedule • Last updated" }).setTimestamp();
}

async function updateCrewScheduleEmbed() {
  try {
    const channel = await client.channels.fetch(crewScheduleChannelId);
    const msg = await channel.messages.fetch(crewScheduleMessageId);
    await msg.edit({ embeds: [buildCrewScheduleEmbed()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("crew_update_schedule").setLabel("Update My Schedule").setEmoji("📅").setStyle(ButtonStyle.Primary))] });
  } catch (err) { console.error("❌ Error updating crew schedule:", err); }
}

async function setupGameSuggestionsChannel() {
  try {
    const channel = await client.channels.fetch(GAME_SUGGESTIONS_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) { console.log("ℹ️ Game suggestions channel already set up"); return; }
    await channel.send({
      embeds: [new EmbedBuilder().setTitle("🎮 Game Suggestions").setDescription("Got a game you want the crew to play together? Suggest it below!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📝 Click **Suggest a Game** to submit your idea.\n\n✅ React with ✅ if you want to play it!\n❌ React with ❌ if you're not feeling it.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Anyone in the server can suggest and vote. Keep it fun! 🦕*").setColor(0x57F287).setFooter({ text: "DinoBot • Game Suggestions" })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("game_suggest").setLabel("Suggest a Game").setEmoji("🎮").setStyle(ButtonStyle.Success))]
    });
    console.log("✅ Game suggestions message posted");
  } catch (err) { console.error("❌ Error setting up game suggestions channel:", err); }
}

async function setupLookingToPlayChannel() {
  try {
    const channel = await client.channels.fetch(LOOKING_TO_PLAY_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) { console.log("ℹ️ Looking to play channel already set up"); return; }
    await channel.send({
      embeds: [new EmbedBuilder().setTitle("🎮 Looking to Play").setDescription("Want to find someone to game with? Post below!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🕹️ Click **Looking to Play** to post what you're playing.\n\nPosts automatically expire and are removed after **8 hours**.\nYou can only have **one active post** at a time.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Anyone in the server can post. 🦕*").setColor(0x9146FF).setFooter({ text: "DinoBot • Looking to Play" })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ltp_post").setLabel("Looking to Play").setEmoji("🕹️").setStyle(ButtonStyle.Primary))]
    });
    console.log("✅ Looking to play message posted");
  } catch (err) { console.error("❌ Error setting up looking to play channel:", err); }
}

async function lockChannelsForUnverified() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!channel) continue;
    if ([onboardingCategoryId, staffCategoryId, ticketsCategoryId, birthdayCategoryId].includes(channel.id)) continue;
    if ([onboardingCategoryId, staffCategoryId, ticketsCategoryId, birthdayCategoryId].includes(channel.parentId)) continue;
    if (channel.id === WELCOME_CHANNEL_ID || channel.id === RULES_CHANNEL_ID) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, { ViewChannel: true, SendMessages: false, AddReactions: false, ReadMessageHistory: true }).catch(() => {});
      continue;
    }
    if ([ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement].includes(channel.type)) {
      await channel.permissionOverwrites.edit(ROLE_IDS.unverified, { ViewChannel: false }).catch(() => {});
    }
  }
  console.log("✅ Channel lockdown applied for Unverified role");
}

// ----------------------------
// TWITCH
// ----------------------------
async function getTwitchToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" }) });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Twitch OAuth failure: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function getTwitchUserIds(token, logins) {
  const params = logins.map(l => `login=${encodeURIComponent(l)}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, { headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get Twitch users: ${JSON.stringify(data)}`);
  return data.data || [];
}

async function createEventSubSubscription(token, userId) {
  const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", { method: "POST", headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "stream.online", version: "1", condition: { broadcaster_user_id: userId }, transport: { method: "webhook", callback: process.env.TWITCH_CALLBACK_URL, secret: process.env.TWITCH_WEBHOOK_SECRET } }) });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function getStreamInfoWithRetry(token, userId, retries = 3, delayMs = 15000) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`, { headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, "Authorization": `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`Failed to get stream info: ${JSON.stringify(data)}`);
    if (data.data[0]) return data.data[0];
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

async function subscribeToTwitchUsers() {
  const logins = process.env.TWITCH_USER_LOGINS.split(",").map(l => l.trim().toLowerCase()).filter(Boolean);
  const token = await getTwitchToken();
  const users = await getTwitchUserIds(token, logins);
  if (!users.length) { console.warn("⚠️ No Twitch users found"); return; }
  for (const user of users) {
    const result = await createEventSubSubscription(token, user.id);
    if (!result.ok && result.status !== 409) { console.error(`❌ Failed to subscribe to ${user.login}:`, result.data); }
    else { console.log(result.status === 409 ? `ℹ️ Already subscribed: ${user.login}` : `✅ Subscribed: ${user.login}`); }
  }
}

// ----------------------------
// TWITCH WEBHOOK
// ----------------------------
const processedMessageIds = new Set();

app.post("/twitch/eventsub", async (req, res) => {
  try {
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const messageId = req.headers["twitch-eventsub-message-id"];
    const timestamp = req.headers["twitch-eventsub-message-timestamp"];
    const signature = req.headers["twitch-eventsub-message-signature"];
    const messageType = req.headers["twitch-eventsub-message-type"];
    if (!messageId || !timestamp || !signature) return res.status(400).send("Missing headers");
    const hmacMessage = messageId + timestamp + req.rawBody;
    const expectedSignature = "sha256=" + crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");
    const valid = expectedSignature.length === signature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!valid) return res.status(403).send("Forbidden");
    if (processedMessageIds.has(messageId)) return res.status(200).send("Duplicate ignored");
    processedMessageIds.add(messageId);
    if (processedMessageIds.size > 1000) processedMessageIds.delete(processedMessageIds.values().next().value);
    if (messageType === "webhook_callback_verification") return res.status(200).type("text/plain").send(req.body.challenge);
    if (messageType === "notification" && req.body.subscription?.type === "stream.online") {
      const { broadcaster_user_id, broadcaster_user_login, broadcaster_user_name } = req.body.event;
      const token = await getTwitchToken();
      const stream = await getStreamInfoWithRetry(token, broadcaster_user_id);
      if (!stream) return res.status(200).send("Missing data");
      const thumbnailUrl = stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720");
      const isMrBean = broadcaster_user_login.toLowerCase() === MRBEAN_TWITCH_LOGIN.toLowerCase();
      const targetChannelId = isMrBean ? MRBEAN_ANNOUNCEMENTS_CHANNEL_ID : process.env.DISCORD_CHANNEL_ID;
      const pingContent = isMrBean ? `<@&${ROLE_IDS.announcements}> <@&${ROLE_IDS.streamAlerts}> 🔴 MrBeanTheDino is LIVE!` : `<@&${ROLE_IDS.streamAlerts}> 🔴 A friend just went live!`;
      const channel = await client.channels.fetch(targetChannelId);
      if (!channel) return res.status(200).send("Missing channel");
      await channel.send({ content: pingContent, embeds: [new EmbedBuilder().setTitle(`🦕 ${broadcaster_user_name} is now LIVE on Twitch!`).setURL(`https://twitch.tv/${broadcaster_user_login}`).setDescription(`**${stream.title}**\n\n🎮 Playing: ${stream.game_name}`).setImage(thumbnailUrl).setColor(0x9146FF).setFooter({ text: "Twitch Live Alert • DinoBot" }).setTimestamp()] });
      console.log(`✅ Alert sent for ${broadcaster_user_name}`);
      return res.status(200).send("Notification processed");
    }
    if (messageType === "revocation") { console.warn("⚠️ Subscription revoked:", req.body.subscription?.type); return res.status(200).send("Revocation received"); }
    return res.status(200).send("OK");
  } catch (err) { console.error("❌ Webhook error:", err); return res.status(500).send("Internal Server Error"); }
});

// ----------------------------
// HEALTH CHECK + SERVER BOOT
// ----------------------------
app.get("/", (req, res) => res.send("DinoBot running"));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

(async () => {
  try {
    const token = (process.env.DISCORD_TOKEN || "").trim();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await Promise.race([
      client.login(token),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Discord login timeout")), 30000))
    ]);
  } catch (err) { console.error("❌ Discord login failed:", err.message); }
})();

// =================== END OF PART 3 — FILE COMPLETE ===================