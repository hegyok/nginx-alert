const fs = require('fs');
const QuickChart = require('quickchart-js');
const { request } = require('undici')

//detection settings
const path = `/var/log/nginx/access.log`;
const maxAvgRps = 10;
const maxRps = 20; 
const discordWebhook = "";

//cloudflare settings
const cfEmail = "";
const cfApiKey = "";
const cfZoneId = "";


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
  if (ua) {
    uafrom = Date.now();
  }
  uagraph.push(r);
  if (r > maxuarps) maxuarps = r;
  if (ua) return;
  ua = true;
  uafrom = Date.now();
  if (Date.now() - lastAttack < 60000*5) return;
  const chart = new QuickChart();
  chart.setBackgroundColor("#2f3136")
  chart.setConfig({
    type: 'line',
    data: {
      labels: new Array(rps.length).fill(''),
      datasets: [
        {
          label: 'Current RPS',
          data: rps
        }
      ]
    }
  })
  request(discordWebhook, {
    method: 'POST',
    body: JSON.stringify({
      "username": "DDoS Sensor",
      "embeds": [
        {
          "title": "DDoS Attack has been detected",
          "color": 16711680,
          "description": `Average: ${a}r/s\nCurrent: ${r}r/s\n\nAttack is being captured`,
          "timestamp": "",
          "author": {},
          "image": {
            "url": chart.getUrl()
          },
          "thumbnail": {},
          "footer": {
            "text": `Attack started at ${new Date(uafrom).toISOString()}`
          },
          "fields": []
        }
      ],
      "components": []
    }),
    headers: {
      'content-type': 'application/json'
    }
  })
}
async function attackEnd(r, a) {
  if (!ua || Date.now() - uafrom < 20000) return;
  if (Date.now() - lastAttack > 60000*5) {
    const chart = new QuickChart();
    lastAttack = Date.now();
    chart.setBackgroundColor("#2f3136")
    chart.setConfig({
      type: 'line',
      data: {
        labels: new Array(uagraph.length).fill(''),
        datasets: [
          {
            label: 'Current RPS',
            data: uagraph
          }
        ]
      }
    })
    request(discordWebhook, {
      method: 'POST',
      body: JSON.stringify({
        "username": "DDoS Sensor",
        "embeds": [
          {
            "title": "DDoS Attack has been mitigated",
            "color": 16711680,
            "description": `Average: ${calcAvg(uagraph)}r/s\nCurrent: ${r}r/s\nMax: ${maxuarps}r/s\n`,
            "timestamp": "",
            "author": {},
            "image": {
              "url": await chart.getShortUrl()
            },
            "thumbnail": {},
            "footer": {
              "text": ``
            },
            "fields": []
          }
        ],
        "components": []
      }),
      headers: {
        'content-type': 'application/json'
      }
    })
  }
  uafrom = 0;
  uagraph = [];
  ua = false;
  maxuarps = 0;
}
function calcAvg(array) {
  var total = 0;
  var count = 0;

  array.forEach((item) => {
    total += item;
    count++;
  });

  return Math.floor(total / count);
}


function enableUam() {
  request(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/security_level`, {
    method: "PATCH",
    headers: {
      'X-Auth-Email': cfEmail,
      "X-Auth-Key": cfApiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      value: "under_attack"
    })
  })
}

function disableUam() {
  request(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/security_level`, {
    method: "PATCH",
    headers: {
      'X-Auth-Email': cfEmail,
      "X-Auth-Key": cfApiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      value: "high"
    })
  })
}
