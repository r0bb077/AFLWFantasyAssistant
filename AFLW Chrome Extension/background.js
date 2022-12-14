function checkAndInjectContentScriptAlarm(secondsForNextAlarm = 5) {
  chrome.alarms.create("checkAndInjectContentScript", {
    when: Date.now() + (secondsForNextAlarm * 1000)
  });
}

chrome.runtime.onStartup.addListener(async () => {
  console.log("runtime.onStartup");
  await checkAndInjectContentScriptAlarmCallBack();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("runtime.onInstalled");
  await checkAndInjectContentScriptAlarmCallBack();
});

async function checkAndInjectContentScriptAlarmCallBack(){

  let currentGameWeekInfo = await getCurrentGameWeek();
  console.log("Current GameWeek Info", currentGameWeekInfo);  

  if (currentGameWeekInfo.IsGameweekLive === true) {
    console.log("Will check again in 5 seconds");
    checkAndInjectContentScriptAlarm(5);    
  } else {
    const nextMatch = await findAndStoreNextMatch();
    if (nextMatch) {
      const date = new Date(nextMatch.utcStartTime + "Z");
      const timeDiffUntiNextMatchStarts = date - new Date().getTime();
      console.log("Next Gameweek match starts:", date, "Milliseconds Until Start", timeDiffUntiNextMatchStarts);
      if (timeDiffUntiNextMatchStarts < 3600000) {
        console.log("Will check again in a minute");
        checkAndInjectContentScriptAlarm(60);
      } else {
        console.log("Will check again in a hour");
        checkAndInjectContentScriptAlarm(60 * 60);
      }
    }
  }

  await getAllPlayerRoundInfo(currentGameWeekInfo.CurrentGameWeekRound);
  injectData();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name == "checkAndInjectContentScript") {
    checkAndInjectContentScriptAlarmCallBack();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message == "getPlayerData") {
    processGetPlayerDataRequest(request).then(result => sendResponse(result));
    return true;
  }
});

async function processGetPlayerDataRequest() {
  return {
    players: (await chrome.storage.local.get("PlayerData")).PlayerData
  };
}

function getFormattedRoundNo(int) {
  int = parseInt(int);

  if (int < 10) {
    int = "0" + int
  }

  return `CD_R2101264${int}`;
}

async function getCurrentGameWeek(){
  console.log("Finding current gameweek");

  const maxRounds = 10;
  const token = await getToken();
  let currentGameweekRound;
  let isGameweekLive = false;

  for (let i = 1; i <= maxRounds; i++) {
    const matches = await getRoundMatches(getFormattedRoundNo(i), token);
    const finishedMatches = matches.items.filter(match => match.match.status === "CONCLUDED");
    if(finishedMatches.length == matches.items.length){
      isGameweekLive = false;
      currentGameweekRound = matches.items[0].match.round;
    } else {
      const liveMatches = matches.items.filter(match => match.match.status === "LIVE");
      if(liveMatches.length > 0){
        isGameweekLive = true;
        currentGameweekRound = matches.items[0].match.round;
      }

      // If the first game isn't scheduled and there is a scheduled game in the list then this is current gameweek
      const isFirstMatchScheduled = matches.items[0].match.status === "SCHEDULED";
      const isThereAScheduledMatchInTheList = matches.items.find(match => match.match.status === "SCHEDULED") != null;
      if(!isFirstMatchScheduled && isThereAScheduledMatchInTheList){
        isGameweekLive = true;
        currentGameweekRound = matches.items[0].match.round;
      }
      break;
    }
  }

  return {
    CurrentGameWeekRound: currentGameweekRound,
    IsGameweekLive: isGameweekLive
  };
}

async function findAndStoreNextMatch() {
  console.log("Finding next match");

  const maxRounds = 10;
  const token = await getToken();
  let nextMatch = null;

  for (let i = 1; i <= maxRounds; i++) {
    const matches = await getRoundMatches(getFormattedRoundNo(i), token);
    for (const [index, match] of matches.items.entries()) {
      if (match.match.status !== "CONCLUDED") {
        nextMatch = match.match;
        break;
      }
    }

    if (nextMatch) break;
  }

  console.log("Found next match", nextMatch);
  chrome.storage.local.set({
    NextMatch: nextMatch
  });

  return nextMatch;
}

async function injectData() {
  const tabs = await chrome.tabs.query({});

  tabs.forEach((tab) => {
    if (tab.url.indexOf("aflwfantasy.com.au/team-summary") == -1) {
      return;
    }
    console.log(`Injecting script onto tab:${tab.id}`);
    chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ['contentScript.js'],
    });

    chrome.scripting.insertCSS({
      target: {
        tabId: tab.id
      },
      files: ['contentScript.css']
    });
  });
}

async function getAllPlayerRoundInfo(round) {
  const token = await getToken();
  const roundMatches = await getRoundMatches(round, token);
  const players = await getAllPlayerData(roundMatches);
  chrome.storage.local.set({
    PlayerData: players
  });
  return players;
}

async function getToken() {
  return await new Promise((resolve) => {
    fetch("https://api.afl.com.au/cfs/afl/WMCTok", {
        method: "POST"
      })
      .then((resp) => {
        return resp.json();
      })
      .then((json) => {
        token = json.token;
        resolve(token);
      })
  });
}

async function getRoundMatches(roundNo, token) {
  const baseRoundUrl = "http://api.afl.com.au/cfs/afl/matchItems/round/";
  return await new Promise((resolve) => {
    fetch(baseRoundUrl + roundNo, {
        headers: {
          "x-media-mis-token": token
        }
      })
      .then((resp) => {
        return resp.json()
      })
      .then((json) => {
        resolve(json);
      });
  });
}

async function getMatchData(matchId, token) {
  const baseMatchUrl = "https://api.afl.com.au/cfs/afl/playerStats/match/";

  return await new Promise((resolve) => {
    //console.log(`Getting match ${matchId}`);
    fetch(baseMatchUrl + matchId, {
        headers: {
          "x-media-mis-token": token
        }
      })
      .then((resp) => {
        return resp.json()
      })
      .then((json) => {
        resolve(json);
      });
  });
}

function getPlayers(playerDataArray, clubInfo) {
  const players = [];

  playerDataArray?.forEach((player) => {
    const playerName = player.player.player.player.playerName;
    players.push({
      givenName: playerName.givenName,
      surname: playerName.surname,
      club: clubInfo,
      points: player.playerStats.stats.dreamTeamPoints
    });
  })

  return players;
}

async function getAllPlayerData(matchesResponse) {

  matches = matchesResponse.items;
  let players = [];

  const promises = [];
  matches.forEach((match) => {
    promises.push(new Promise(async (resolve) => {
      const matchId = match.match.matchId;
      const matchData = await getMatchData(matchId, await getToken());

      const homeTeam = match.match.homeTeam;
      const awayTeam = match.match.awayTeam;

      const homePlayers = matchData.homeTeamPlayerStats;
      const awayPlayers = matchData.awayTeamPlayerStats;

      players = players.concat(getPlayers(homePlayers, homeTeam));
      players = players.concat(getPlayers(awayPlayers, awayTeam));
      resolve();
    }));
  });

  await Promise.all(promises);
  return players;
}