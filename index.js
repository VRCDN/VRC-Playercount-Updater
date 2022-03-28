//Standard require/imports, only one that is not abtainable publically yet is @vrcdn/node-vrc-log-parser
const VRCLogParser = require("@vrcdn/node-vrc-log-parser");
const os = require("os");
const path = require("path");
const fetch = require("node-fetch");
const log = require("npmlog");
const readline = require("readline");
const fs = require("fs");
const { info } = require("console");

//Add a timestamp to all logs
Object.defineProperty(log, "heading", {
  get: () => {
    return new Date().toUTCString();
  },
});
log.headingStyle = { bg: "", fg: "white" };

const API_URL = "https://api.vrcdn.live";

const DEBUG = true;

//Create the readline interface to let us get user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

//Credits to Klukule here ;)
const VRCPath = path.join(
  os.homedir(),
  "AppData",
  "LocalLow",
  "VRChat",
  "VRChat"
);

//Create a new instance of the VRCDN VRCLogParser which is used to read and interpret the logs
let logParser = new VRCLogParser();

//Sorting algo used to sort based on creation date
function dateSort(a, b) {
  return new Date(a.birthtime).getTime() - new Date(b.birthtime).getTime();
}

function GetKey() {
  //Ask the user to enter the appropriate key for the bot
  rl.question("Enter key: ", async (authKey) => {
    //Make a request to the test URL to see if they key is valid
    fetch(`${API_URL}/api/bots/test`, {
      headers: {
        "vrcdn-api-key": authKey,
      },
    })
      .then((res) => res.json())
      .then((keyCheckRes) => {
        if (keyCheckRes.success) {
          //If so, then continue to the next question about update rate
          GetUpdateRate(authKey);
        } else {
          //If not, Ask them again
          log.warn("[API]", "That key was invalid");
          return GetKey();
        }
      })
      .catch((err) => {
        //An oopsie occured somewhere
        log.error("[API]", "An error occured: ", err);
      });
  });
}

function GetUpdateRate(authKey) {
  //Ask the user how often they would like to update the user count
  rl.question("Update rate in minutes: [default 2] ", async (updateRate) => {
    //If they press enter without input, use the default of 2 minutes
    if (updateRate == "") {
      updateRate = 2;
      log.notice("[InstanceInfo]", "Using default update rate of 2 minutes");
    }
    //updateRate is currently a string, so we parse it into a Int
    updateRate = parseInt(updateRate);
    //Make sure that its correct and not 0
    if (isNaN(updateRate) || updateRate == undefined || updateRate <= 0) {
      log.warn(
        "[InstanceInfo]",
        "Invalid update rate, Must be a number and above 0"
      );
      //Try again
      return GetUpdateRate(authKey);
    }
    //Start the whole process that watches logs
    log.notice("[Timer]", `Waiting ${updateRate} minutes before reading log`);
    StartChecking(authKey, updateRate);
    //Close our readline interface so it doesn't hold the process open when you try to exit with (CTRL-C)
    rl.close();
  });
}

function StartChecking(key, rate) {
  let curLogFile = "";
  //Get newest log file and keep a consistantly updated instance user count ;P
  setInterval(() => {
    //Reads the VRChat folder
    fs.readdir(VRCPath, function (err, files) {
      if (err) {
        if (DEBUG) log.error("[FileSystem]", err);
        return;
      }
      var sortedFiles = [];
      files.forEach((file) => {
        //Scans each file inside to see if that match the log file name
        if (/^output/.test(file)) {
          //if so then add their creation dates to an array so we can get the newest one
          const { birthtime } = fs.statSync(path.join(VRCPath, file));
          sortedFiles.push({ file, birthtime });
        }
      });
      //Sort the array by date
      sortedFiles.sort(dateSort);
      //Is this a new log file we haven't seen before?
      if (curLogFile != sortedFiles[sortedFiles.length - 1].file) {
        curLogFile = sortedFiles[sortedFiles.length - 1].file;
        if (DEBUG)
          log.info(
            "[FileSystem]",
            `Found newest log file: ${curLogFile}, using this!`
          );
      }
      //Read the log file and parse it locally using the VRCDN log parser.
      logParser
        .parseLog(path.join(VRCPath, sortedFiles[sortedFiles.length - 1].file))
        .then((events) => {
          //Get the instanceId of the newest instance
          let instanceId = Object.keys(events.instanceInfo)[
            Object.keys(events.instanceInfo).length - 1
          ];
          if (DEBUG)
            log.notice(
              "[InstanceInfo]",
              ` Got new info for ${instanceId.split("~")[0]}: ${
                events.instanceInfo[instanceId]
              }`
            );
          //Create our JSON data to push to the API
          let instanceUpdateData = {
            count: events.instanceInfo[instanceId],
            instanceId,
          };
          if (DEBUG)
            log.info(
              "[API]",
              `Pushing this information to the API: `,
              instanceUpdateData
            );

          //Send that instaceUpdateData object to the API
          fetch(`${API_URL}/api/bots/update`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "vrcdn-api-key": key,
            },
            body: JSON.stringify(instanceUpdateData),
          })
            .then((res) => res.json())
            .then((instanceUpdateRes) => {
              //check if the update was successful
              if (instanceUpdateRes.success) {
                log.notice(
                  "[API]",
                  `Successfully updated player count for your instance on bot ${instanceUpdateRes.bot}`
                );
              } else {
                log.notice("[API]", `Failed to update player count`);
              }
            })
            .catch((err) => {
              //An oopsie occured somewhere
              log.error("[API]", "An error occured: ", err);
            });

          //Inform the user we are now waiting.
          log.notice(
            "[Timer]",
            `Waiting ${rate} minutes before reading log file again`
          );
        });
    });
  }, 1000 * 60 * rate);
}

function checkForUpdate() {
  //First things first, lets check our version vs the newest version
  fetch(`${API_URL}/api/bots/tool`)
    .then((res) => res.json())
    .then((toolInfo) => {
      //Does it match?
      if (toolInfo.version != require("./package.json").version) {
        log.notice(
          "[UPDATE]",
          "Your version differs from the release version, please contact VRCDN to obtain a new version."
        );
      }
      //Enter the madness
      GetKey();
    })
    .catch((err) => {
      log.error("[API]", "An error occured: ", err);
    });
}

checkForUpdate();
