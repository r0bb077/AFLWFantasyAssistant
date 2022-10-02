function checkAndInjectContentScriptAlarm(secondsForNextAlarm = 5) {
  chrome.alarms.create("checkAndInjectContentScript", {
    when: Date.now() + (secondsForNextAlarm * 1000)
  });
}

function updateLastUpdatedDate() {
  chrome.storage.local.set({
    LastUpdatedDate: new Date().getTime()
  });
}

async function getLastUpdatedDate() {
  return (await chrome.storage.local.get("LastUpdatedDate"))?.LastUpdatedDate;
}

chrome.runtime.onStartup.addListener(() => {
  console.log("runtime.onStartup");
  findNextMatch();
  checkAndInjectContentScriptAlarm();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("runtime.onInstalled");
  findNextMatch();
  checkAndInjectContentScriptAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name == "checkAndInjectContentScript") {
    let secondsToCheckAgain = 60;
    let currentGameWeekInfo = await getCurrentGameWeek();
    console.log("Current GameWeek Info", currentGameWeekInfo);
    if (currentGameWeekInfo.isGameWeekComplete === false) {
      // Update more frequently during a game
      secondsToCheckAgain = 5;
    }    
    await updatePlayerDataInStorage(currentGameWeekInfo.CurrentGameWeekRound, secondsToCheckAgain);
    injectData();
    checkAndInjectContentScriptAlarm(secondsToCheckAgain);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message == "getPlayerData") {
    processGetPlayerDataRequest(request).then(result => sendResponse(result));
    return true;
  }
});

async function updatePlayerDataInStorage(round, timeDiffThreshold){
  const lastUpdatedDate = await getLastUpdatedDate();

  if (!isNaN(lastUpdatedDate)) {
    const timeDiffInSeconds = (new Date().getTime() - lastUpdatedDate) / 1000;
    if (timeDiffInSeconds <= timeDiffThreshold) {
      const playerData = (await chrome.storage.local.get("PlayerData")).PlayerData;
      if (Array.isArray(playerData)) {
        console.log(`Made a request within last ${timeDiffThreshold} seconds, will use cached data`);
        return;
      }
    }
  }

  console.log("Getting fresh data");
  await getAllPlayerRoundInfo(round)
}
async function processGetPlayerDataRequest() {
  return {
    players: (await chrome.storage.local.get("PlayerData")).PlayerData
  };
}

async function isMatchInProgress() {
  return await new Promise(async (resolve) => {
    let resolveOutcome = false;
    const storageItem = await chrome.storage.local.get("NextMatch");
    if (storageItem.NextMatch) {
      const token = await getToken();
      const matches = await getRoundMatches(storageItem.NextMatch.round, token);
      for (const [index, match] of matches.items.entries()) {
        if (match.match.matchId === storageItem.NextMatch.matchId) {         
          console.log(`Stored match status ${match.match.abbr} is ${match.match.status}`);
          chrome.storage.local.set({
            NextMatch: match.match
          });
          if (match.match.status === "CONFIRMED_TEAMS" ||
            match.match.status === "LIVE" ||
            match.match.status === "POSTGAME") {
            resolveOutcome = true;
            break;
          }

          if (match.match.status === "CONCLUDED") {
            console.log(`Match has finished, removing match from storage`);
            await chrome.storage.local.remove("NextMatch");
            await findNextMatch();
            break;
          }
        }
      }
    } else {
      await findNextMatch();
    }

    console.log("Is Gameweek live", resolveOutcome);
    resolve(resolveOutcome);
  });
}

function getFormattedRoundNo(int) {
  int = parseInt(int);

  if (int < 10) {
    int = "0" + int
  }

  return `CD_R2101264${int}`;
}

async function getCurrentGameWeek(){
  console.log("Finding next match");

  const maxRounds = 10;
  const token = await getToken();
  let currentGameweekRound;
  let isGameWeekComplete = false;

  for (let i = 1; i <= maxRounds; i++) {
    const matches = await getRoundMatches(getFormattedRoundNo(i), token);
    const finishedMatches = matches.items.filter(match => match.match.status === "CONCLUDED");
    if(finishedMatches.length == matches.items.length){
      currentGameweekRound = matches.items[0].match.round;
      isGameWeekComplete = true;
    } else {
      const liveMatches = matches.items.filter(match => match.match.status === "LIVE");
      if(liveMatches.length > 0){
        currentGameweekRound = matches.items[0].match.round;
        isGameWeekComplete = false;
        break;
      }
    }
  }

  return {
    CurrentGameWeekRound: currentGameweekRound,
    IsGameWeekComplete: isGameWeekComplete
  };
}

async function findNextMatch() {
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
}

async function updateNextMatch() {
  chrome.storage.local.get("NextMatch", async (match) => {
    if (!match.NextMatch) {
      await findNextMatch();
    } else {
      const now = new Date();
      const matchStart = new Date(match.NextMatch.date);

      console.log(`Next Match stored starts at ${matchStart}`);

      if (matchStart < now) {
        await findNextMatch();
      }
    }
  });
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
  updateLastUpdatedDate();
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