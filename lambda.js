/**
 * This skill serves up notes played via mp3 files based on user input
 */

var aws = require('aws-sdk');

// this is used by the VoiceLabs analytics
var APP_ID = 'amzn1.ask.skill.ed108ca5-b703-4b4c-9d89-ace3517c2fa9';
var VoiceInsights =require('voice-insights-sdk'),
  VI_APP_TOKEN = '7bdd2730-e1da-11a6-3a6b-0eb19d13e26e';

// six string guitar notes
var fretboard = {
    "string1":["e3","f3","f3sharp","g3","g3sharp","a4","a4sharp","b4","c4","c4sharp","d4","d4sharp"],
    "string2":["b3","c3","c3sharp","d3","d3sharp","e3","f3","f3sharp","g3","g3sharp","a4","a4sharp"],
    "string3":["g2","g2sharp","a3","a3sharp","b3","c3","c3sharp","d3","d3sharp","e3","f3","f3sharp"],
    "string4":["d2","d2sharp","e2","f3","f3sharp","g2","g2sharp","a3","a3sharp","b3","c3","c3sharp"],
    "string5":["a2","a2sharp","b2","c2","c2sharp","d2","d2sharp","e2","f3","f3sharp","g2","g2sharp"],
    "string6":["e1","f1","f1sharp","g1","g1sharp","a2","a2sharp","b2","c2","c2sharp","d2","d2sharp"]
};

// this is the song catalog, including different variations on how someone may request it

var songsAvailable = [
    {"requestName":"home on the range", "songName":"Twinkle Twinkle Little Star", "songID":0},
    {"requestName":"yellow rose of texas", "songName":"Twinkle Twinkle Little Star", "songID":0},
    {"requestName":"happy birthday", "songName":"Happy Birthday", "songID":1},
    {"requestName":"amazing grace", "songName":"Jingle Bells", "songID":2}
];

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        /**
         * This validates that the applicationId matches what is provided by Amazon.
         */
        if (event.session.application.applicationId !== "amzn1.ask.skill.ed108ca5-b703-4b4c-9d89-ace3517c2fa9") {
             context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId +
        ", sessionId=" + session.sessionId);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId +
        ", sessionId=" + session.sessionId);

    // Dispatch to your skill's launch.
    getWelcomeResponse(session, callback);
}

/**
 * Called when the user specifies an intent for this skill. This drives
 * the main logic for the function.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId +
        ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;
        
    console.log("processing " + intentName);

    // Dispatch to the individual skill handlers

    if ("PlayNote" === intentName || "PlayFlat" === intentName || "PlaySharp" === intentName) {
        playNote(intent, session, callback);
    } else if ("Replay" === intentName || "AMAZON.RepeatIntent" === intentName) {
        replayPriorNotes(intent, session, callback);
    } else if ("AMAZON.StartOverIntent" === intentName) {
        getWelcomeResponse(session, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        getHelpResponse(callback);
    } else if ("AMAZON.RepeatIntent" === intentName) {
        getWelcomeResponse(session, callback);
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName) {
        handleSessionEndRequest(callback);
    } else {
        throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId +
        ", sessionId=" + session.sessionId);
}

// --------------- Base Functions that are invoked based on standard utterances -----------------------

// this is the function that gets called to format the response to the user when they first boot the app

function getWelcomeResponse(session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to Guitar Player";

    console.log("Welcome Message Invoked");

    // initialize voice analytics 
    console.log("initialize session");
    VoiceInsights.initialize(session, VI_APP_TOKEN);

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput +  "Welcome to Guitar Player.";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/homeOnTheRange.mp3\" />";
        audioOutput = audioOutput + "Your tool for learning how to play a 12-string guitar. " + 
            "To get started, you can say play D.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "Welcome to Music Maker. Your tool for playing music based on phrases " +
        "and commands given through Alexa.";

    var repromptText = "Please start by giving the letter for a note based on the key. " +
        "For example, say something like the letter D and we will play back that note.";

	VoiceInsights.track('WelcomeMessage', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
    });
}

// this is the function that gets called to format the response to the user when they ask for help
function replayPriorNotes(intent, session, callback) {
    var sessionAttributes = {};
    var cardTitle = "Replay Mode";
    var shouldEndSession = false;

    console.log("Replay Mode Invoked");
    
    // first check to make sure that notes exist from prior session
    if (session.attributes == null || session.attributes.noteHistory == null) {
        speechOutput = "Sorry, no prior notes to replay. Please first ask for some notes to be played.";
        repromptText = "If you would like to use this feature, first ask for some notes. For example, say Play C.";

        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
    } else {
        // the playback last five notes
        var noteLib = "https://s3.amazonaws.com/musicmakerskill/guitar/";
        var notePlayback = 0;
        var maxPlayback = 5;
        
        console.log("length: " + JSON.stringify(session.attributes.noteHistory));
        
        // currently the limit for number of notes to playback is five
        if (session.attributes.noteHistory.length > maxPlayback) {
            notePlayback = maxPlayback;
        } else {
            notePlayback = session.attributes.noteHistory.length;
        }
        
        // create audio response
        var playbackNotes = session.attributes.noteHistory;
        var audioOutput = "<speak>";
        var cardOutput = "Playback of Prior Notes\n";
        var analyticNotes = "";
        
        for (i = 0; i < notePlayback ; i++) {
            if (playbackNotes[i].accent == "none") {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + playbackNotes[i].musicNote + ".mp3\" />";
                cardOutput = cardOutput + playbackNotes[i].musicNote + "\n";
                analyticNotes = analyticNotes + playbackNotes[i].musicNote + ",";
            } else if (playbackNotes[i].accent == "sharp") {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + playbackNotes[i].musicNote + "sharp.mp3\" />";
                cardOutput = cardOutput + playbackNotes[i].musicNote + " sharp\n";
                analyticNotes = analyticNotes + playbackNotes[i].musicNote + "-sharp,";
            } else {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + playbackNotes[i].musicNote + "flat.mp3\" />";
                cardOutput = cardOutput + playbackNotes[i].musicNote + " flat\n"; 
                analyticNotes = analyticNotes + playbackNotes[i].musicNote + "-flat,";
            }
        }
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "Ready to add more? If so, please say so now by providing additional note names.";
        audioOutput = audioOutput + "</speak>";
        
        sessionAttributes.noteHistory = playbackNotes;
        
        var repromptText = "If you would like to add more notes to the session for playback, please play them then come back to this.";

    	VoiceInsights.track('ReplayNotes', null, null, (err, res) => {
    	    console.log('voice insights logged' + JSON.stringify(res));

            callback(sessionAttributes,
                buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
        });
    }
}

// this is the function that gets called to format the response to the user when they ask for help
function getHelpResponse(callback) {
    var sessionAttributes = {};
    var cardTitle = "Help";
    // this will be what the user hears after asking for help

    console.log("Help Message Invoked");

    var speechOutput = "Guitar Player is an interactive tool showing off how Alexa can interpret " +
        "voice commands and play musical notes based on the requests. The notes played for this " +
        "are through the C major scale. For the top of the octave, please say High C.";
        
    // if the user still does not respond, they will be prompted with this additional information

    var repromptText = "Please tell me a letter and I will play back that note. For example, " +
        "say just the letter F.";
        
    var shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
}

// this is the function that gets called to format the response when the user is done
function handleSessionEndRequest(callback) {
    var cardTitle = "Thanks for using Guitar Player";
    var speechOutput = "Thank you for trying out Guitar Player. Please take a moment to comment on the skill " +
        "within the app on your mobile device to provide feedback on how we can improve. Have a nice day!";
        
    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

    // temp code to test analytics
    VoiceInsights.track('EndSession', null, null, (err, res) => {
        console.log('voice insights logged' + JSON.stringify(res));

        callback({}, buildSpeechletResponse(cardTitle, speechOutput, speechOutput, null, shouldEndSession));
    });
}

// This plays back the note that was requested, and is the main function within the skill.

function playNote(intent, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var noteHistory = [];
    var increaseOctave = false;

    // check if notes have been played before and are saved into the session. If so, load into local array
    if (session.attributes == null || session.attributes.noteHistory == null) {
        console.log("no prior history");
    } else {
        console.log("prior history: " + JSON.stringify(session.attributes.noteHistory));
        noteHistory = session.attributes.noteHistory;
        sessionAttributes.noteHistory = session.attributes.noteHistory;
    }

    // this represents the octave starting with C major
    var octave = "3";

    console.log("Play Note invoked: " + intent.slots.Note.value);

    // if a note is passed, scrub it from all invalid characters
    if (intent.slots.Note.value) {
        var scrubNote = "" + intent.slots.Note.value.toLowerCase();
        var noteRequest = "";
        for (i = 0; i < scrubNote.length; i++ ) {
            console.log(scrubNote[i]);
            if (scrubNote[i] === " ") {
                console.log("removed space");
            } else if (scrubNote[i] === ".") {
                console.log("removed dot");
            } else {
                noteRequest = noteRequest + scrubNote[i];
            }
        }
    } else {
        var cardTitle = "Missing Musical Note";
        var speechOutput = "I'm sorry, you didn't provide a note.  If you'd like to try again, please say " +
            "the name of a musical note now. The scale is represented by letters between A and G.";
        var repromptText = "If you would like to continue to use the skill, please say a musical note now.";

        callback({}, buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
    }

    // request sometimes appends a period to a letter - remove. this is common within the Alexa VUI
    if (noteRequest[1]==".") {
        noteRequest = noteRequest[0];
    }

    // translate high-c to standard format
    if (noteRequest === "highc" || noteRequest === "hic") {
        noteRequest = "c";
        increaseOctave = true;
    }

    // validate that the single character passed in was a valid note - a through g
    var validNote = false;
    var multiNote = false;
    var validNotes = ["a","b","c","d","e","f","g"];
    var validSharp = ["a","c","d","f","g"];
    var validFlat  = ["a","b","d","e","g"];
    
    for (i = 0; i < validNotes.length; i++) {
        if (noteRequest === validNotes[i] && "PlayNote" === intent.name) {
            validNote = true;
        }
    }
    
    for (i = 0; i < validSharp.length; i++) {
        if (noteRequest === validSharp[i] && "PlaySharp" === intent.name) {
            validNote = true;
        }
    }

    for (i = 0; i < validFlat.length; i++) {
        if (noteRequest === validFlat[i] && "PlayFlat" === intent.name) {
            validNote = true;
        }
    }
    
    // process multiple notes in one utterance
    if (noteRequest.length > 1) {
        multiNote = true;
        var totalValidNotes = 0;
        console.log("length of response is greater than 1");
        for (i = 0; i < noteRequest.length; i++) {
            //console.log("check value: " + noteRequest[i]);
            for (j = 0; j < validNotes.length; j++) {
                if (noteRequest[i] == validNotes[j]) {
                    totalValidNotes = totalValidNotes + 1;
                }
            }
        }
        if (noteRequest.length === totalValidNotes) {
            validNote = true;
            console.log("all the notes are valid");
        }
    }
    
    if (validNote) {
        var cardTitle = "Play Note";

        // if multiple notes requested, ensure that not too many
        var notesRequested = 1;
        if (noteRequest.length > 5) {
            notesRequested = 5;
        } else {
            notesRequested = noteRequest.length;
        }

        // now create the response by assembling the information in correct SSML format
        var audioOutput = "<speak>";
        
        for (i = 0; i < notesRequested; i++) {

            // adjust octave to match major scale (if a/b) or requested earlier
            if (noteRequest[i] == "a" || noteRequest[i] == "b" || increaseOctave) {
                octave = "4";
            } else {
                octave = "3";
            }

            // create object to retrieve based on note and octave
            var musicNote = noteRequest[i] + octave;
            var saveNote = {};
                saveNote.musicNote = musicNote;

            if ("PlaySharp" === intent.name) {
                saveNote.accent = "sharp";
            } else if ("PlayFlat" === intent.name) {
                saveNote.accent = "flat";
            } else {
                saveNote.accent = "none";
            }

            // save the note into an array
            noteHistory.push(saveNote);
            
            var noteLib = "https://s3.amazonaws.com/musicmakerskill/guitar/";
            
            if ("PlayNote" === intent.name) {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + musicNote + ".mp3\" />";
            } else if ("PlaySharp" === intent.name) {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + musicNote + "sharp.mp3\" />";
            } else {
                audioOutput = audioOutput + "<audio src=\"" + noteLib + musicNote + "flat.mp3\" />";
            }
        }
            //audioOutput = audioOutput + "<break time=\"1s\"/>Ready for another note? Just request the next one now.";
            audioOutput = audioOutput + "</speak>";

        // save the note History for the session to be used later
        sessionAttributes.noteHistory = noteHistory;

        var cardOutput = musicNote;

        var repromptText = "If you are ready to play another note, please say so now by indicating the letter " +
            "representing the note.";
            
        VoiceInsights.track('PlayNote', null, null, (err, res) => {
            console.log('voice insights logged' + JSON.stringify(res));

            callback(sessionAttributes,
                buildAudioCardResponse(cardTitle, audioOutput, cardOutput, musicNote, repromptText, shouldEndSession));
        });
    } else {
        var cardTitle = "Invalid Musical Note Note";
        
        // improved error handling as there is confusion around which notes have sharps and flats
        if ("PlaySharp" === intent.name && noteRequest == "b") {
            speechOutput = "I'm sorry - there is no such key as B sharp. Did you mean to say D sharp? Please " +
                "request a valid key and I will play it.";
        } else if ("PlaySharp" == intent.name && noteRequest == "e") {
            speechOutput = "I'm sorry - there is no such key as E sharp. Did you mean to say D sharp? Please " +
                "request a valid key and I will play it.";            
        } else if ("PlayFlat" == intent.name && noteRequest == "c") {
            speechOutput = "I'm sorry - there is no such key as C flat. Did you mean to say C sharp? Please " +
                "request a valid key and I will play it.";
        } else if ("PlayFlat" == intent.name && noteRequest == "f") {
            speechOutput = "I'm sorry - there is no such key as F flat. Did you mean to say F sharp? Please " +
                "request a valid key and I will play it.";            
        } else {
            var speechOutput = "I'm sorry, that wasn't a valid note.  If you'd like to try again, please say " +
                "the name of a musical note now. The scale is represented by letters between A and G.";
        }
        
        var repromptText = "If you would like to continue to use the skill, please say another musical note now.";

        // we don't want to lose the session history even though the last note was invalid
        sessionAttributes.noteHistory = noteHistory;

        callback({}, 
            buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
    }    
}

// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, cardInfo, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        card: {
            type: "Simple",
            title: title,
            content: cardInfo
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildAudioResponse(title, output, cardInfo, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "SSML",
            ssml: output
        },
        card: {
            type: "Simple",
            title: title,
            content: cardInfo
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildAudioCardResponse(title, output, cardInfo, objectName, repromptText, shouldEndSession) {
    var smallImagePath = "https://s3.amazonaws.com/musicmakerskill/small-images/" + objectName + "-small.PNG";
    var largeImagePath = "https://s3.amazonaws.com/musicmakerskill/large-images/" + objectName + "-large.PNG";
    return {
        outputSpeech: {
            type: "SSML",
            ssml: output
        },
        card: {
            type: "Standard",
            title: title,
            text: cardInfo,
            image: {
                smallImageUrl: smallImagePath,
                largeImageUrl: largeImagePath
            }
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}

