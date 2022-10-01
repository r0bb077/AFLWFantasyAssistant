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

function insertLiveScoreCard(liveScore) {
    let liveScoreCard = document.querySelector(".aflwLiveScoreCard");
    if (liveScoreCard != null) {
        const textNode = loopNodesFindTextNode(liveScoreCard);
        textNode.textContent = liveScore;
        return;
    }

    const scoreCardGrid = document.querySelector("#main .grid");
    scoreCardGrid.classList.remove("md:grid-cols-6");
    scoreCardGrid.classList.add("md:grid-cols-7");

    const firstScoreCard = scoreCardGrid.childNodes[0];

    liveScoreCard = document.createElement("div");
    scoreCardGrid.appendChild(liveScoreCard);
    liveScoreCard.innerHTML = firstScoreCard.innerHTML;
    liveScoreCard = document.querySelector("#main .grid").childNodes[6];

    const textNode = loopNodesFindTextNode(liveScoreCard);
    textNode.textContent = liveScore;
    liveScoreCard.querySelector("span").innerText = "Live Score";
    liveScoreCard.classList.add("aflwLiveScoreCard");
}

function updatePlayers(players) {
    let totalScore = 0;
    [...document.querySelectorAll(".aflwCustomCard, .px-6")].forEach((playerCardElement) => {
        let nameSplit = playerCardElement.querySelector(".px-1")?.childNodes[0]?.textContent?.trim()?.split(" ");
        if (!nameSplit) {
            nameSplit = [...playerCardElement.childNodes].find(x => x.nodeType === Node.TEXT_NODE)?.textContent?.trim()?.split(" ");
            if (!nameSplit) return;
        }

        let name = "";
        for (var i = 0; i < 2; i++) name += nameSplit[i] + " ";

        let score = 0;
        players.forEach((player) => {
            if (player.givenName + " " + player.surname == name.trim()) {
                score = player.points;
            }
        })

        const scoreElement = playerCardElement.getElementsByTagName("strong")[0];
        const currentScore = parseInt(scoreElement.innerText);

        const isCaptain = playerCardElement.querySelector(".bg-red-200") != null;
        if (isCaptain) {
            score = score * 2;
        }

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

        const isOnField = playerCardElement.closest(".m-3") != null;

        if (isOnField) {
            totalScore += score;
        }
    });

    insertLiveScoreCard(totalScore);
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

    console.log([...playerDataContainer.querySelector(".font-light")?.childNodes]);
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

updateCardLayouts();
getPlayerData();