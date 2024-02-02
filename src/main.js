/* let url = document.currentScript.src
let filePath = url.slice(8).slice(0, -7) */
//let filePath = "D:/VsCodeProjects/RLOverlay/OBSRLOverlay/"


//console.log(filePath);

import config from "./config.json" assert { type: 'json'}
const { WebviewWindow } = window.__TAURI__.window

let spreadsheetLink = (id, tabname, range, apikey, dimension) => `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${tabname}!${range}?key=${apikey}&majorDimension=${dimension}`

async function getSheet(ID, tabname, range) {
  let getData = await fetch(spreadsheetLink(ID, tabname, range, config.apikey, config.dimension))
  let parseData = await getData.json()
  let data = await parseData.values;
  return data
}

let sheetData = await getSheet(config.spreadsheetID, config.tabname, config.range)

console.log(sheetData);

const obs = new OBSWebSocket();

//Connect to WS
try {
    const { obsWebSocketVersion, negotiatedRpcVersion } = await obs.connect('ws://127.0.0.1:4455', 'obswsserver', {
      rpcVersion: 1
    });
    $(".OBSws").text(`Connected to OBS server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`);
    console.log(`Connected to OBS server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`)
} catch (error) {
    $(".OBSws").text('Failed to connect to OBS', error.code, error.message);
    console.error('Failed to connect to OBS', error.code, error.message);
}

//Code for SOS plugin, DO NOT TOUCH
const WsSubscribers = {
    __subscribers: {},
    websocket: undefined,
    webSocketConnected: false,
    registerQueue: [],
    init: function(port, debug, debugFilters) {
        port = port || 49322;
        debug = debug || false;
        if (debug) {
            if (debugFilters !== undefined) {
                console.warn("WebSocket Debug Mode enabled with filtering. Only events not in the filter list will be dumped");
            } else {
                console.warn("WebSocket Debug Mode enabled without filters applied. All events will be dumped to console");
                console.warn("To use filters, pass in an array of 'channel:event' strings to the second parameter of the init function");
            }
        }
        WsSubscribers.webSocket = new WebSocket("ws://localhost:" + port);
        WsSubscribers.webSocket.onmessage = function (event) {
            let jEvent = JSON.parse(event.data);
            if (!jEvent.hasOwnProperty('event')) {
                return;
            }
            let eventSplit = jEvent.event.split(':');
            let channel = eventSplit[0];
            let event_event = eventSplit[1];
            if (debug) {
                if (!debugFilters) {
                    console.log(channel, event_event, jEvent);
                } else if (debugFilters && debugFilters.indexOf(jEvent.event) < 0) {
                    console.log(channel, event_event, jEvent);
                }
            }
            WsSubscribers.triggerSubscribers(channel, event_event, jEvent.data);
        };
        WsSubscribers.webSocket.onopen = function () {
            $(".RLws").text(`Connected to RL SOS server on port ${port}`);
            WsSubscribers.triggerSubscribers("ws", "open");
            WsSubscribers.webSocketConnected = true;
            WsSubscribers.registerQueue.forEach((r) => {
                WsSubscribers.send("wsRelay", "register", r);
            });
            WsSubscribers.registerQueue = [];
        };
        WsSubscribers.webSocket.onerror = function () {
            $(".RLws").text(`Failed to connect to RL SOS Server`);
            WsSubscribers.triggerSubscribers("ws", "error");
            WsSubscribers.webSocketConnected = false;
        };
        WsSubscribers.webSocket.onclose = function () {
            WsSubscribers.triggerSubscribers("ws", "close");
            WsSubscribers.webSocketConnected = false;
        };
    },
    /**
     * Add callbacks for when certain events are thrown
     * Execution is guaranteed to be in First In First Out order
     * @param channels
     * @param events
     * @param callback
     */
    subscribe: function(channels, events, callback) {
        if (typeof channels === "string") {
            let channel = channels;
            channels = [];
            channels.push(channel);
        }
        if (typeof events === "string") {
            let event = events;
            events = [];
            events.push(event);
        }
        channels.forEach(function(c) {
            events.forEach(function (e) {
                if (!WsSubscribers.__subscribers.hasOwnProperty(c)) {
                    WsSubscribers.__subscribers[c] = {};
                }
                if (!WsSubscribers.__subscribers[c].hasOwnProperty(e)) {
                    WsSubscribers.__subscribers[c][e] = [];
                    if (WsSubscribers.webSocketConnected) {
                        WsSubscribers.send("wsRelay", "register", `${c}:${e}`);
                    } else {
                        WsSubscribers.registerQueue.push(`${c}:${e}`);
                    }
                }
                WsSubscribers.__subscribers[c][e].push(callback);
            });
        })
    },
    clearEventCallbacks: function (channel, event) {
        if (WsSubscribers.__subscribers.hasOwnProperty(channel) && WsSubscribers.__subscribers[channel].hasOwnProperty(event)) {
            WsSubscribers.__subscribers[channel] = {};
        }
    },
    triggerSubscribers: function (channel, event, data) {
        if (WsSubscribers.__subscribers.hasOwnProperty(channel) && WsSubscribers.__subscribers[channel].hasOwnProperty(event)) {
            WsSubscribers.__subscribers[channel][event].forEach(function(callback) {
                if (callback instanceof Function) {
                    callback(data);
                }
            });
        }
    },
    send: function (channel, event, data) {
        if (typeof channel !== 'string') {
            console.error("Channel must be a string");
            return;
        }
        if (typeof event !== 'string') {
            console.error("Event must be a string");
            return;
        }
        if (channel === 'local') {
            this.triggerSubscribers(channel, event, data);
        } else {
            let cEvent = channel + ":" + event;
            WsSubscribers.webSocket.send(JSON.stringify({
                'event': cEvent,
                'data': data
            }));
        }
    }
};

$('#Settings').click(() => {
    let settingsWindow = new WebviewWindow('settingsWindows', {
        url: 'set.html',
        title: 'Settings',
        resizable: false,
        width: 300
    })
})

let players1 = [sheetData[0][6], sheetData[0][7]]
let players2 = [sheetData[1][6], sheetData[1][7]]

$('#Player1Name').val(players1[0])
$('#Player2Name').val(players1[1])

$('#Player3Name').val(players2[0])
$('#Player4Name').val(players2[1])

let players = ["Chipper", "Centice", "Sundown", "Goose"]

WsSubscribers.init(49122, true);

let teams = [null,null];

let team1
let team2
let teamScores = [0,0]
let playerData
let scoreTextLeft
let scoreTextRight
let gametime

$("#Refresh").click(async function (e){
    async function getSheet() {
        let getData = await fetch(spreadsheetLink(config.spreadsheetID, config.tabname, config.range, config.apikey, config.dimension))
        let parseData = await getData.json()
        let data = await parseData.values;
        return data
      }
      
      sheetData = await getSheet()
      
      console.log(sheetData);

      players1 = [sheetData[0][6], sheetData[0][7]]
      players2 = [sheetData[1][6], sheetData[1][7]]


      $('#Player1Name').val(players1[0])
      $('#Player2Name').val(players1[1])

      $('#Player3Name').val(players2[0])
      $('#Player4Name').val(players2[1])
})

$("#Reset").click(function (e){
    e.preventDefault()
    $('.Score1').val("0"),
    $('.Score2').val("0")
})

$("#Save").click(function (e){
    e.preventDefault();
    team1 = sheetData[0][2];
    team2 = sheetData[1][2];
    teamScores = [$('#Score1').val(), $('#Score2').val()]

    for (let i = 0; i < 4; i++) {
        setItemVisibility(`BlueTicker${i+1}`, "TickersNS", false)
        setItemVisibility(`OrangeTicker${i+1}`, "TickersNS", false)
    }

    updateTickers(teamScores[0], teamScores[1])

    players = [$('#Player1Name').val(), $('#Player2Name').val(), $('#Player3Name').val(), $('#Player4Name').val()]

    obs.call("SetInputSettings", {
        inputName: 'Team1Name',
        inputSettings: {
            text: team1
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Team2Name',
        inputSettings: {
            text: team2
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Player1Start',
        inputSettings: {
            text: players[0]
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Player2Start',
        inputSettings: {
            text: players[1]
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Player3Start',
        inputSettings: {
            text: players[2]
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Player4Start',
        inputSettings: {
            text: players[3]
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Team1Logo',
        inputSettings: {
            file: sheetData[0][4]
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Team2Logo',
        inputSettings: {
            file: sheetData[1][4]
        }
    })
});

WsSubscribers.subscribe("game", "update_state", async (state) =>{

    let Timer1 = new Date(state['game']['time_seconds'] * 1000).toISOString().slice(14, 19);
    let Timer2
    if (state['game']['time_seconds'] > 59) {
        Timer2 = Timer1.replace(/^0+/, '');
    } else {
        Timer2 = Timer1.substring(1)
    }
    
    let Timer;

    gametime = state['game']['time_seconds'];

    playerData = (state['players'])

    if (state['game']['isOT'] === true) {
        Timer = Timer2.padStart(Timer2.length + 1, "+")
    } else {
        Timer = Timer2
    }

    await obs.call("SetInputSettings", {
        inputName: 'Timer',
        inputSettings: {
            text: Timer
        }
    })

    //teams = [state['game']['teams'][0].name.toLowerCase().charAt(0).toUpperCase() + state['game']['teams'][0].name.toLowerCase().slice(1), state['game']['teams'][1].name.toLowerCase().charAt(0).toUpperCase() + state['game']['teams'][1].name.toLowerCase().slice(1)];
    teams = [team1,team2];

    scoreTextLeft = state['game']['teams'][0]['score'].toString();
    await obs.call("SetInputSettings", {
        inputName: 'Score1',
        inputSettings: {
            text: scoreTextLeft
        }
    })

    scoreTextRight = state['game']['teams'][1]['score'].toString();
    await obs.call("SetInputSettings", {
        inputName: 'Score2',
        inputSettings: {
            text: scoreTextRight
        }
    })

    let targetPlayerFull = state['game']['target'].toString();
    let targetPlayer = targetPlayerFull.substring(0, targetPlayerFull.length - 2);
    
    console.log(Object.values(playerData));

    /* let test = playerData[0].filter((t) => t.team === 1)
    console.log(test); */

    let parsedPlayers = Object.values(playerData).sort((a,b) => a.team - b.team)

    console.log(parsedPlayers);

    try {
        for (let i = 0; i < 4; i++){
            await obs.call("SetInputSettings", {
                inputName: `Player${i + 1}GameName`,
                inputSettings: {
                    text: Object.values(parsedPlayers)[i].name
                }
            })
    
            await obs.call("SetInputSettings", {
                inputName: `Player${i + 1}Boost`,
                inputSettings: {
                    text: Object.values(parsedPlayers)[i].boost.toString()
                }
            })
        }
        setInputCrop(`Player1BoostBar`, "BluePlayersNS", 1039, 0, (1918 - (Object.values(parsedPlayers)[0].boost * 19.18)), 0)
        setInputCrop(`Player2BoostBar`, "BluePlayersNS", 1039, 0, (1918 - (Object.values(parsedPlayers)[1].boost * 19.18)), 0)
        setInputCrop(`Player3BoostBar`, "OrangePlayersNS", 1039, (1918 - (Object.values(parsedPlayers)[2].boost * 19.18)), 0, 0)
        setInputCrop(`Player4BoostBar`, "OrangePlayersNS", 1039, (1918 - (Object.values(parsedPlayers)[3].boost * 19.18)), 0, 0)
        
    } catch (error) {
    }
    
    //If Rocket League has a Target Player
    if (state['game']['hasTarget'] === true && state['game']['hasWinner'] === false) {

        let targetPlayerScore = state['players'][targetPlayerFull]['score'].toString();
        let targetPlayerGoals = state['players'][targetPlayerFull]['goals'].toString();
        let targetPlayerShots = state['players'][targetPlayerFull]['shots'].toString();
        let targetPlayerAssists = state['players'][targetPlayerFull]['assists'].toString();
        let targetPlayerSaves = state['players'][targetPlayerFull]['saves'].toString();
        let targetPlayerBoost = state['players'][targetPlayerFull]['boost'].toString();
        let targetPlayerTeam = state['players'][targetPlayerFull]['team']

        await updateTargetPlayerInfo(targetPlayer, targetPlayerScore, targetPlayerGoals, targetPlayerShots, targetPlayerAssists, targetPlayerSaves, targetPlayerBoost)
        
        await updateBoost(targetPlayerBoost)

        await setItemVisibility("TargetPlayerNS", "Game", true)
    
        if (targetPlayerTeam === 0) {
            await setItemVisibility("TargetPlayerBlue", "TargetPlayerNS", true)
            await setItemVisibility("TargetPlayerOrange", "TargetPlayerNS", false)
            await setItemVisibility("BlueTargetBoost", "TargetPlayerNS", true)
            await setItemVisibility("OrangeTargetBoost", "TargetPlayerNS", false)
            await setItemVisibility("BlueTargetBoostBG", "TargetPlayerNS", true)
            await setItemVisibility("OrangeTargetBoostBG", "TargetPlayerNS", false)
            await setItemVisibility("BoostBlueNS", "Game", true)
            await setItemVisibility("BoostOrangeNS", "Game", false)
        } else {
            await setItemVisibility("TargetPlayerOrange", "TargetPlayerNS", true)
            await setItemVisibility("TargetPlayerBlue", "TargetPlayerNS", false)
            await setItemVisibility("OrangeTargetBoost", "TargetPlayerNS", true)
            await setItemVisibility("BlueTargetBoost", "TargetPlayerNS", false)
            await setItemVisibility("BlueTargetBoostBG", "TargetPlayerNS", false)
            await setItemVisibility("OrangeTargetBoostBG", "TargetPlayerNS", true)
            await setItemVisibility("BoostBlueNS", "Game", false)
            await setItemVisibility("BoostOrangeNS", "Game", true)
            
        }
    } else {
        await setItemVisibility("TargetPlayerNS", "Game", false)
        await setItemVisibility("BoostBlueNS", "Game", false)
        await setItemVisibility("BoostOrangeNS", "Game", false)
    } 
})

WsSubscribers.subscribe("game", "match_ended", async (endState) =>{

    endscreenData(Object.values(playerData), scoreTextLeft, scoreTextRight)
    
    teamScores[endState['winner_team_num']]++;
    $("#Score1").val(teamScores[0]);
    $("#Score2").val(teamScores[1]);

    updateTickers(teamScores[0], teamScores[1])

    let gameNum = parseInt(teamScores[0]) + parseInt(teamScores[1])

    obs.call("SetInputSettings", {
        inputName: 'GameNum',
        inputSettings: {
            text: `Game ${gameNum} of 5`
        }
    })

    setTimeout(() => {
        obs.call("SetCurrentProgramScene", {
            sceneName: 'End'
        })
    }, 1000);
})

WsSubscribers.subscribe("game", "match_created", async (startState) =>{
    await obs.call("SetCurrentProgramScene", {
        sceneName: 'Start'
    })
})

WsSubscribers.subscribe("game", "pre_countdown_begin", async (gamestartState) =>{
    await obs.call("SetCurrentProgramScene", {
        sceneName: 'Game'
    })
})

WsSubscribers.subscribe("game", "match_destroyed", async (destroyedState) =>{
})

WsSubscribers.subscribe("game", "replay_start", async (replayState) =>{
    await obs.call("SetCurrentProgramScene", {
        sceneName: 'Replay'
    })
})

WsSubscribers.subscribe("game", "round_started_go", async (roundState) =>{
})

WsSubscribers.subscribe("game", "goal_scored", async (goalState) =>{

    let scorer = goalState['scorer']['name'];
    let assister = goalState['assister']['name'];
    
    await obs.call("SetInputSettings", {
        inputName: 'Scorer',
        inputSettings: {
            text: scorer
        }
    })

    if (goalState['scorer']['teamnum'] === 0) {
        await setItemVisibility("ReplayBlue", "Replay", true)
        await setItemVisibility("ReplayOrange", "Replay", false)
    } else {
        await setItemVisibility("ReplayBlue", "Replay", false)
        await setItemVisibility("ReplayOrange", "Replay", true)
    }

    if (assister === "") { 
        await setItemVisibility("ReplayAssisterBlue", "Replay", false)
        await setItemVisibility("ReplayAssisterOrange", "Replay", false)
    } else {
        if (goalState['scorer']['teamnum'] === 0) {
            await setItemVisibility("ReplayAssisterBlue", "Replay", true)
            await setItemVisibility("ReplayAssisterOrange", "Replay", false)
        } else {
            await setItemVisibility("ReplayAssisterBlue", "Replay", false)
            await setItemVisibility("ReplayAssisterOrange", "Replay", true)
        }
    }
    await obs.call("SetInputSettings", {
        inputName: 'Assister',
        inputSettings: {
            text: assister
        }
    })

})

function updateTargetPlayerInfo(Name, Score, Goals, Shots, Assists, Saves, Boost) {
    //Can create an array with data arranged from left to right, then loop through to set all settings with less code
    obs.call("SetInputSettings", {
        inputName: 'Player',
        inputSettings: {
            text: Name
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Score',
        inputSettings: {
            text: Score
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Goals',
        inputSettings: {
            text: Goals
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Shots',
        inputSettings: {
            text: Shots
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Assists',
        inputSettings: {
            text: Assists
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Saves',
        inputSettings: {
            text: Saves
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'Boost',
        inputSettings: {
            text: Boost
        }
    })
}

function endscreenData(Players, score1, score2) {

    obs.call("SetInputSettings", {
        inputName: 'EndScore1',
        inputSettings: {
            text: score1
        }
    })

    obs.call("SetInputSettings", {
        inputName: 'EndScore2',
        inputSettings: {
            text: score2
        }
    })

    let parsedPlayers = Players.sort((a,b) => a.team - b.team)

    console.log(parsedPlayers);

    for (let i = 0; i < 4; i++) {
        console.log(parsedPlayers[i])

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Score`,
            inputSettings: {
                text: parsedPlayers[i]['score'].toString()
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Name`,
            inputSettings: { 
                text: parsedPlayers[i]['name']
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Goals`,
            inputSettings: {
                text: parsedPlayers[i]['goals'].toString()
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Assists`,
            inputSettings: {
                text: parsedPlayers[i]['assists'].toString()
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Saves`,
            inputSettings: {
                text: parsedPlayers[i]['saves'].toString()
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Shots`,
            inputSettings: {
                text: parsedPlayers[i]['shots'].toString()
            }
        })

        obs.call("SetInputSettings", {
            inputName: `Player${i + 1}Demos`,
            inputSettings: {
                text: parsedPlayers[i]['demos'].toString()
            }
        })
    }
}

function updateBoost(PlayerBoost) {
    //Blue
    setInputRotation("BoostSliceBlue1", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 45))

    setInputRotation("BoostSliceBlue2", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 90))

    setInputRotation("BoostSliceBlue3", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 135))

    setInputRotation("BoostSliceBlue4", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 180))

    setInputRotation("BoostSliceBlue5", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 225))

    setInputRotation("BoostSliceBlue6", "BoostBlueNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 270))

    setInputRotation("BoostSliceBlue7", "BoostBlueNS", PlayerBoost * 3.15)

    //Orange
    setInputRotation("BoostSliceOrange1", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 45))

    setInputRotation("BoostSliceOrange2", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 90))

    setInputRotation("BoostSliceOrange3", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 135))

    setInputRotation("BoostSliceOrange4", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 180))

    setInputRotation("BoostSliceOrange5", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 225))

    setInputRotation("BoostSliceOrange6", "BoostOrangeNS", limitNumberWithinRange(PlayerBoost * 3.15, -1, 270))

    setInputRotation("BoostSliceOrange7", "BoostOrangeNS", PlayerBoost * 3.15)

}

async function setItemVisibility(Name, Scene, Visible) {

    let inputList = await obs.call("GetSceneItemList", {
        sceneName: Scene
    })

    let selectedItem = inputList.sceneItems[0].sceneItemId;

    try {
        for (let i = 0; inputList.sceneItems[i].sourceName != Name; i++) {
            selectedItem = inputList.sceneItems[i + 1].sceneItemId
        }
    } catch (error) {
        
    }

    await obs.call("SetSceneItemEnabled", {
        sceneName: Scene,
        sceneItemId: selectedItem,
        sceneItemEnabled: Visible
    })

    return 1;
}

async function setInputRotation(Name, Scene, Angle) {

    let inputList = await obs.call("GetSceneItemList", {
        sceneName: Scene
    })

    let selectedItem = inputList.sceneItems[0].sceneItemId;

    for (let i = 0; inputList.sceneItems[i].sourceName != Name; i++) {
        selectedItem = inputList.sceneItems[i + 1].sceneItemId
    }

    obs.call("SetSceneItemTransform", {
        sceneName: Scene,
        sceneItemId: selectedItem,
        sceneItemTransform: {
            rotation: Angle
        }
    })
}

async function setInputCrop(Name, Scene, CropBottom, CropLeft, CropRight, CropTop) {
    let inputList = await obs.call("GetSceneItemList", {
        sceneName: Scene
    })

    let selectedItem = inputList.sceneItems[0].sceneItemId;

    try {
        for (let i = 0; inputList.sceneItems[i].sourceName != Name; i++) {
            selectedItem = inputList.sceneItems[i + 1].sceneItemId
        }
    } catch (error) {
        
    }

    obs.call("SetSceneItemTransform", {
        sceneName: Scene,
        sceneItemId: selectedItem,
        sceneItemTransform: {
            cropBottom: CropBottom,
            cropLeft : CropLeft,
            cropRight : CropRight,
            cropTop : CropTop
        }
    })
}

function updateTickers (score1, score2) {
    console.log(score1, score2);
    for (let i = 0; i < score1; i++) {
        setItemVisibility(`BlueTicker${i+1}`, "TickersNS", true)
    }

    for (let i = 0; i < score2; i++) {
        setItemVisibility(`OrangeTicker${i+1}`, "TickersNS", true)
    }
}

function limitNumberWithinRange(num, min, max){
    const MIN = min || 1;
    const MAX = max || 20;
    const parsed = parseInt(num)
    return Math.min(Math.max(parsed, MIN), MAX)
}

  