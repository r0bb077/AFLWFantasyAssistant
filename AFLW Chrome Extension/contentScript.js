// Usually the trades option only appears when lockout is open and scors are updated
const isGameInLockout = document.getElementById("trades") == null;

function getPlayerData() {
    console.log("Getting player data");
    chrome.runtime.sendMessage({
        "message": "getPlayerData"
    }, function (response) {
        updatePlayers(response.players);
    });
}

function loopNodesFindTextNode(node) {
    let returnNode;
    [...node.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            returnNode = node;
            return;
        } else {
            returnNode = loopNodesFindTextNode(node);
            if(returnNode){
                return;
            }
        }
    })

    return returnNode;
}

function addScoreCard(className, label, value){
    let scoreCard = document.querySelector("." + className);
    if (scoreCard != null) {
        const textNode = loopNodesFindTextNode(scoreCard);
        textNode.textContent = value;
        return;
    }

    const scoreCardGrid = document.querySelector("#main .grid");
    scoreCardGrid.classList.remove("md:grid-cols-6");
    scoreCardGrid.classList.add("md:grid-cols-7");

    const firstScoreCard = scoreCardGrid.childNodes[0];

    scoreCard = document.createElement("div");
    scoreCardGrid.appendChild(scoreCard);
    scoreCard.innerHTML = firstScoreCard.innerHTML;
    scoreCard = document.querySelector("#main .grid").childNodes[6];

    const textNode = loopNodesFindTextNode(scoreCard);
    textNode.textContent = value;
    scoreCard.querySelector("span").innerText = label;
    scoreCard.classList.add(className);
}

function insertLiveScoreCard(liveScore, expectedScore) {
    let expectedScoreCard = document.querySelector(".aflwExpectedScoreCard");
    if(expectedScoreCard){
        expectedScore.remove();
    }

    addScoreCard("aflwLiveScoreCard", "Live Score (expected)", `${liveScore} (${(liveScore + expectedScore)})`);
}

function insertExpectedScoreCard(expectedScore) {
    addScoreCard("aflwExpectedScoreCard", "Expected Score", expectedScore);
}

function updatePlayers(players) {
    let totalScore = 0;
    let expectedScore = 0;

    const namesAdded = [];

    [...document.querySelectorAll(".aflwCustomCard, .px-6")].forEach((playerCardElement) => {
        if(playerCardElement.closest(".aflwCustomCard") === null) return;

        let nameSplit = playerCardElement.querySelector(".px-1")?.childNodes[0]?.textContent?.trim()?.split(" ");
        if (!nameSplit) {
            nameSplit = [...playerCardElement.childNodes].find(x => x.nodeType === Node.TEXT_NODE)?.textContent?.trim()?.split(" ");
            if (!nameSplit) return;
        }

        let name = "";
        for (var i = 0; i < 2; i++) name += nameSplit[i] + " ";

        if(namesAdded.indexOf(name) !== -1){
            return;
        }

        namesAdded.push(name);

        let score = 0;
        players.forEach((player) => {
            if (player.givenName + " " + player.surname == name.trim()) {
                score = player.points;
            }
        })

        const isOnField = playerCardElement.closest(".m-3") != null;
        const isCaptain = playerCardElement.querySelector(".bg-red-200") != null;
        if (isCaptain) {
            score = score * 2;
        }

        if (!score || !isGameInLockout && isOnField) {
            const averageScore = playerCardElement.querySelector(".font-light").lastChild?.textContent;
            const parsedScore = parseInt(/[0-9]{1,3}/.exec(averageScore));
            expectedScore += isCaptain === true ? parsedScore * 2 : parsedScore;
            return;
        }

        const scoreElement = playerCardElement.getElementsByTagName("strong")[0];
        const currentScore = parseInt(scoreElement.innerText);        

        let classToAdd;
        if (currentScore < score) {
            classToAdd = "positiveScoreUpdate";
        } else if (currentScore > score) {
            classToAdd = "negativeScoreUpdate"
        }

        if (classToAdd) {
            const onFieldContainer = playerCardElement.closest(".m-3");

            [playerCardElement, onFieldContainer].forEach((el) => {
                if (!el) return;
                el.classList.add(classToAdd)
                setTimeout(() => {
                    el.classList.remove(classToAdd);
                }, 2000);
            });
        }

        scoreElement.innerText = score;

        if (isOnField) {
            totalScore += score;
        }
    });

    if(isGameInLockout){
        insertLiveScoreCard(totalScore, expectedScore);
    } else {
        insertExpectedScoreCard(expectedScore);
    }
}

function updateCardLayout(playerCardElement) {
    playerCardElement.classList.remove("w-56");

    const cardTableData = playerCardElement.getElementsByTagName("table")[0];

    if (!cardTableData) return;

    const scoreElement = playerCardElement.getElementsByTagName("strong")[0];
    const teamImage = playerCardElement.querySelector("img");

    const cardContainer = document.createElement("div");
    cardContainer.classList.add("aflwCustomCard");

    const playerAndScoreContainer = document.createElement("div");
    playerAndScoreContainer.classList.add("aflwCustomPlayerScoreContainer");

    const scoreContainer = document.createElement("div");
    scoreContainer.classList.add("aflwCustomCardScoreContainer");

    scoreContainer.appendChild(scoreElement);
    scoreContainer.appendChild(teamImage);

    playerAndScoreContainer.appendChild(scoreContainer);
    cardContainer.appendChild(playerAndScoreContainer);
    playerCardElement.appendChild(cardContainer);

    const playerDataContainer = document.createElement("div");
    playerDataContainer.classList.add("aflwCustomCardPlayerDataContainer");
    playerAndScoreContainer.appendChild(playerDataContainer);

    const buttonsRow = cardTableData.querySelector(".mt-1");
    cardContainer.appendChild(buttonsRow);

    const playerData = cardTableData.querySelector(".px-1");

    const playerPlayingStatusIcon = playerData.querySelector(".rounded-full");

    let playerStatusBorderClass = "playerUnConfirmdPlayingBorder";
    if (playerPlayingStatusIcon.classList.contains("bg-green-500")) {
        playerStatusBorderClass = "playerPlayingBorder";
    } else if (playerPlayingStatusIcon.classList.contains("bg-red-500")) {
        playerStatusBorderClass = "playerNotPlayingBorder";
    }
    playerCardElement.classList.add(playerStatusBorderClass);

    playerPlayingStatusIcon.remove();

    playerDataContainer.appendChild(playerData);

    const scoreElem = [...playerDataContainer.querySelector(".font-light")?.childNodes].find(child => child.textContent?.trim() === "Score");
    scoreElem?.nextSibling?.remove();
    scoreElem?.remove();
    cardTableData.remove();
}

function updateCardLayouts() {
    const playerCardElements = [...document.getElementsByClassName("m-3")];

    for (const [index, playerCardElement] of playerCardElements.entries()) {
        updateCardLayout(playerCardElement);
    }
}

function updateSubLayouts() {
    const playerCardElements = [...document.querySelectorAll("#main > div.hidden > div.bg-white.shadow.rounded-md.mt-5.px-4.py-2.border-b.border-gray-200 > div > div > div > div > table tr")];

    for (const [index, playerCardElement] of playerCardElements.entries()) {
        if(playerCardElement.classList.contains("py-2")) continue;

        playerCardElement.classList.add("aflwCustomCard");
    }
}

updateCardLayouts();
updateSubLayouts();
getPlayerData();