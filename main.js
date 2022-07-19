const { Client, MessageEmbed } = require('discord.js');
const client = new Client({ intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MEMBERS'] });
const QuickChart = require('quickchart-js');
const config = require('./config.json');
const { request } = require('undici');
require('dotenv').config();
const fs = require('fs');

const channelID = `${config.channelID}`;
const path = `/var/log/nginx/access.log`;
const maxAvgRps = `${config.maxAvgRps}`;
const maxRps = `${config.maxRps}`;
const cfEmail = `${config.cfEmail}`;
const cfApiKey = `${config.cfApiKey}`;
const cfZoneId = `${config.cfZoneId}`;

let ua = false;
let uafrom = 0;
let maxuarps = 0;
let uagraph = [];
let rps = [];
let start = null;
let avg = 0;
let underAttackCf = 0;
let underAttackCfEnabled = false;
let lastAttack = 0;

client.on('ready', () => {
  setInterval(() => { client.user.setActivity({ name: `${config.activity}`, type: 'WATCHING' }) }, 15000)
  console.log(`Logged in as ${client.user.tag}!`);
});

setInterval(() => {
  const file = fs.readFileSync(path, 'utf-8').split('\n');
  if (!start) {
    start = file.length;
    return;
  }
  let rpsrn = file.length - start;
  rps.push(rpsrn);
  if (rps.length > 10) {
    rps.shift();
    avg = calcAvg(rps);
    if (avg > maxAvgRps || rpsrn > maxRps) {
      underAttackCf = Date.now() + 60000 * 3;
      if (!underAttackCfEnabled) {
        underAttackCfEnabled = true;
        enableUam();
      }
      underAttack(rpsrn, avg);
    } else {
      if (underAttackCfEnabled && Date.now() > underAttackCf) {
        underAttackCfEnabled = false;
        disableUam();
      }
      attackEnd(rpsrn, avg);
    }
  }
  start = file.length;
}, 1000)

async function underAttack(r, a) {
  const embed = new MessageEmbed()
  const channel = client.channels.cache.get(channelID);
  if (ua) {
    uafrom = Date.now();
  }
  uagraph.push(r);
  if (r > maxuarps) maxuarps = r;
  if (ua) return;
  ua = true;
  uafrom = Date.now();
  if (Date.now() - lastAttack < 60000 * 5) return;
  const chart = new QuickChart();
  chart.setBackgroundColor("#2f3136")
  chart.setConfig({
    type: 'line',
    data: {
      labels: new Array(rps.length).fill(''),
      datasets: [
        {
          label: 'Current DDoS Requests',
          data: rps
        }
      ]
    }
  })

  embed
    .setColor('2f3136')
    .setTitle('DDoS Attack Detected')
    .setDescription([
      `<a:Alert:998749530939985980> DDoS Protection detected a request rate of **${a}**req/s.`,
    ].join('\n'))
    .addFields(
      { name: 'Average Requests', value: `${a} per second`, inline: true },
      { name: 'Current Requests', value: `${r} per second`, inline: true },
    )
    .setImage(chart.getUrl())
    .setFooter({ text: `Attack started at: ${new Date(uafrom).toISOString()}` })
  channel.send({ embeds: [embed], content: `<@${config.ownerID}> DDoS Attack has been detected!` })
};

async function attackEnd(r, a) {
  const embed = new MessageEmbed()
  const channel = client.channels.cache.get(channelID);
  if (!ua || Date.now() - uafrom < 20000) return;
  if (Date.now() - lastAttack > 60000 * 5) {
    const chart = new QuickChart();
    lastAttack = Date.now();
    chart.setBackgroundColor("#2f3136")
    chart.setConfig({
      type: 'line',
      data: {
        labels: new Array(uagraph.length).fill(''),
        datasets: [
          {
            label: 'Current Requests',
            data: uagraph
          }
        ]
      }
    })

    embed
      .setColor('2f3136')
      .setTitle('DDoS Attack Stopped')
      .addFields(
        { name: 'Average Requests', value: `${a} per second`, inline: true },
        { name: 'Current Requests', value: `${r} per second`, inline: true },
        { name: 'Max Requests', value: `${maxuarps} per second`, inline: true },
      )
      .setImage(chart.getUrl())
      .setFooter({ text: `Attack stopped at: ${new Date().toISOString()}` })

    channel.send({ embeds: [embed] })

    uafrom = 0;
    uagraph = [];
    ua = false;
    maxuarps = 0;
  }
};

function calcAvg(array) {
  var total = 0;
  var count = 0;

  array.forEach((item) => {
    total += item;
    count++;
  });

  return Math.floor(total / count);
};

async function enableUam() {
  const channel = client.channels.cache.get(channelID);
  request(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/security_level`, {
    method: 'PATCH',
    headers: {
      'X-Auth-Email': cfEmail,
      'X-Auth-Key': cfApiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      value: 'under_attack'
    })
  })
  await channel.send(`<a:Alert:998749530939985980> Turning on CloudFlare Under Attack Mode`)
};

async function disableUam() {
  const channel = client.channels.cache.get(channelID);
  request(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/security_level`, {
    method: 'PATCH',
    headers: {
      'X-Auth-Email': cfEmail,
      'X-Auth-Key': cfApiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      value: 'high'
    })
  })
  await channel.send(`<:Success:990962137373474816> DDoS has been stopped. CloudFlare Under Attack Mode has been disabled.`)
};

client.login(process.env.TOKEN);