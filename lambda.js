/**
 * This skill serves up notes played via mp3 files based on user input
 */

var aws = require('aws-sdk');
var noteLib = "https://s3.amazonaws.com/musicmakerskill/guitar/";

// this is used by the VoiceLabs analytics
var APP_ID = 'amzn1.ask.skill.6e5055b7-6b7f-41ce-a4fe-08b186412edc';
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

// chord translation
var chords = [
    {"chordName":"cmajor","chordDesc":"C Major","strings":[0,1,0,2,3,-1],"fingers":[2,4,5]},
    {"chordName":"amajor","chordDesc":"A Major","strings":[0,1,1,1,0,-1],"fingers":[4,3,2]},
    {"chordName":"gmajor","chordDesc":"G Major","strings":[3,0,0,0,2,1],"fingers":[5,6,1]},
    {"chordName":"emajor","chordDesc":"E Major","strings":[0,0,1,2,2,0],"fingers":[3,5,4]},
    {"chordName":"dmajor","chordDesc":"D Major","strings":[2,3,2,0,-1,-1],"fingers":[3,1,2]},
    {"chordName":"aminor","chordDesc":"A Minor","strings":[0,1,2,2,0,-1],"fingers":[2,4,3]},
    {"chordName":"eminor","chordDesc":"E Minor","strings":[0,0,0,2,2,0],"fingers":[0,5,4]},
    {"chordName":"dminor","chordDesc":"D Minor","strings":[1,3,2,0,-1,-1],"fingers":[1,3,2]}
];

// this is the song catalog, including different variations on how someone may request it

var songsAvailable = [
    {"requestName":"home on the range", "songName":"Twinkle Twinkle Little Star", "songID":0},
    {"requestName":"yellow rose of texas", "songName":"Twinkle Twinkle Little Star", "songID":0},
    {"requestName":"happy birthday", "songName":"Happy Birthday", "songID":1},
    {"requestName":"amazing grace", "songName":"Jingle Bells", "songID":2}
];

var songData = [
    {
        "songID":0,
        "numSections": 1,
        "clipDivide":[4],
        "notes":[
            "D, D, G, A, B",
            "A, G, E, C, C, C",
            "C, C, D, G, G",
            "G, F Sharp, G, A",
            "D, D, G, A, B",
            "A, G, E, C, C, C",
            "C, C, B, A, G",
            "F Sharp, G, A, G"
        ],
        "soundClips":[
            "home_pt1.mp3",
            "home_pt2.mp3",
            "home_pt3.mp3",
            "home_pt4.mp3",
            "home_pt1.mp3",
            "home_pt2.mp3",
            "home_pt5.mp3",
            "home_pt6.mp3"
        ],
        "userPause":[
            "8s","8s","8s","8s",
            "8s","8s","8s","8s"
        ],
        "extraComments":[
            "The first part starts with the following series of notes ",
            "Now lets move up the scale in the next part. The notes are ",
            "Followed by a part playing notes ",
            "Then ending the first have with notes ",
            "Now repeat the beginning with notes ",
            "Followed by a repeat of the notes ",
            "Now change the next part playing notes ",
            "Then ending with the notes "
        ]
    }
];

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        /**
         * This validates that the applicationId matches what is provided by Amazon.
         */
        if (event.session.application.applicationId !== "amzn1.ask.skill.6e5055b7-6b7f-41ce-a4fe-08b186412edc") {
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
    } else if ("TeachNote" === intentName) {
        teachNote(session, callback);
    } else if ("NextPart" === intentName) {
        if (session.attributes == null) {
            teachNote(session, callback);
        } else if (session.attributes.stringLesson === 1) {
            secondString(session, callback);
        } else if (session.attributes.stringLesson === 2) {
            thirdString(session, callback);
        } else {
            teachNote(session, callback);
        }
    } else if ("TeachChord" === intentName) {
        teachChord(session, callback);
    } else if ("HowChord" === intentName) {
        teachIndivChord(intent, session, callback);
    } else if ("TeachSong" === intentName) {
        teachSong(session, callback);
    } else if ("PlayGuitar" === intentName) {
        playGuitar(session, callback);
    } else if ("PlayChord" === intentName) {
        chordRequest(intent, session, callback);
    } else if ("Replay" === intentName || "AMAZON.RepeatIntent" === intentName) {
        replayPriorNotes(intent, session, callback);
    } else if ("GuitarTuner" === intentName) {
        tuneGuitar(intent, session, callback);
    } else if ("NextString" === intentName || "RepeatString" === intentName) {
        tuneGuitar(intent, session, callback);
    } else if ("AMAZON.StartOverIntent" === intentName) {
        getWelcomeResponse(session, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        getHelpResponse(session, callback);
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
    var cardTitle = "Welcome to Guitar Teacher";

    console.log("Welcome Message Invoked");

    // initialize voice analytics 
    console.log("initialize session");
    VoiceInsights.initialize(session, VI_APP_TOKEN);

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput +  "Welcome to Guitar Teacher.";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/homeOnTheRange.mp3\" />";
        audioOutput = audioOutput + "Your tool for learning how to play the guitar. " + 
            "To get started, you can say Teach Notes, Teach Chords, Play Guitar, or Tune Guitar. " +
            "If you want more detailed instructions, say Help.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "Welcome to Guitar Teacher\n" +
        "Say Teach Notes to get instruction on picking individual notes on a guitar.\n" +
        "Say Teach Chords to get instruction on strumming basic guitar chords.\n" +
    //    "Say Teach Songs to get lessons on how to play different classic songs.\n" +
        "Say Play Guitar to instruct Alexa to play back notes or chords.\n" +
        "Say Tune Guitar to instruct Alexa to play each basic note on the guitar.";

    var repromptText = "Please start by saying something like Play Guitar";

	VoiceInsights.track('WelcomeMessage', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
    });
}

// this provides an overview of how to play notes and chords from the skill

function playGuitar(session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Playing Guitar from your Alexa";

    console.log("Play Guitar Invoked");

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "You can play both strings and chords using this skill. ";

        audioOutput = audioOutput + "If you want to play an individual note, just say something like " +
            "Play E and the specific note will be played through the skill like this. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/e3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        
        audioOutput = audioOutput + "If you want to play a chord, say something like Play C Major and the " +
            "chord will be played like this.";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/Chordcmajor.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "Play Guitar\n" +
        "For notes, say the letter between A-G including sharps and flats.\n" +
        "Available chords\nMajor C, A, G, E and D. \nMinor A, E, D.\n";

    var repromptText = "Please start by saying something like Play E";

	VoiceInsights.track('PlayGuitar', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
    });
}

// this is the function that starts of on basic note instruction starting with the first string on the guitar

function teachNote(session, callback) {
    var shouldEndSession = false;
    var cardTitle = "Note Instruction";

    console.log("Teach Note Invoked");

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput +  "Guitar Teacher can help you learn individual notes on the guitar. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/e3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "What you just heard was the note E. It's the native note on the first string " +
            "of the guitar. If we start by focusing on the notes for the first string, it's the best place to start " +
            "learning how the scale works. ";
        audioOutput = audioOutput + "The fretboard is the part of the guitar that the strings run along, and allow " +
            "for placement of your fingers to press down on the strings. The top of the fretboard is called the nut. " +
            "Using your index finger, press on the first string between the nut and the first fret, then play the string. " +
            "It should sound like this. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/f3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "That sound is one note higher than the E, and is called F. " +
            "Now lets move your index finger up one more fret and play the string again. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/f3sharp.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "That is the next key on the scale, and is called F Sharp. " +
            "We can think of Sharp as a half-key, meaning that the sounds is half-way between F and G. ";

        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "Now you're probably noticing the pattern, but let's keep going. Go up one more fret " +
            "and play the string again. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/g3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "This note is G, and is one step above F Sharp. " +
            "So the first lesson is that for each fret we move our finger on, it plays a higher note. ";

        audioOutput = audioOutput + "If you're ready for the next step in learning notes, say Next.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play individual notes.";
    var objectOutput = "FirstString";

    var repromptText = "Please start by saying something like Where is E and I will walk you through how to find it.";

    // now save off data for session
    var sessionAttributes = {};
        sessionAttributes.lastIntent = "TeachNote";
        sessionAttributes.stringLesson = 1;

    // track analytics and callback with the response
	VoiceInsights.track('TeachNote', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, objectOutput, repromptText, shouldEndSession));
    });
}

// this is the function that starts of on basic note instruction starting with the second string on the guitar

function secondString(session, callback) {
    var shouldEndSession = false;
    var cardTitle = "Note Instruction";

    console.log("Teach Note Invoked - Next Section");
    
    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "Let's go down to the second string and play more notes. ";
        audioOutput = audioOutput + "If we play the second string without using any fingers on the fretboard " +
            "The sound that will be played is the note B. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/b3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Now use your index finger and press down on the string for the first fret. " +
            "Then play the second string and it should play the note C. Go ahead and do that now. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/c3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Let's continue moving up the fretboard and move your index finger one fret " +
            "and then play the second string again. This should be the note C Sharp. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/c3sharp.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Keep up the pattern by moving over another fret and pick the second string again. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/d3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "This note is D. Let's go over one more fret and pick the second string again.";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/d3sharp.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "If you're ready for the next step in learning notes, say Next.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play individual notes on the second string.";
    var objectOutput = "SecondString";

    var repromptText = "When you are ready for the next section, please say Next.";

    // now save off data for session
    var sessionAttributes = {};
        sessionAttributes.lastIntent = "TeachNote";
        sessionAttributes.stringLesson = 2;

	VoiceInsights.track('SecondString', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, objectOutput, repromptText, shouldEndSession));
    });
}

// this is the function that starts of on basic note instruction starting with the third string on the guitar

function thirdString(session, callback) {
    var shouldEndSession = false;
    var cardTitle = "Note Instruction";

    console.log("Teach Note Invoked - Third Section");
    
    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "Let's go down to the third string and play more notes. ";
        audioOutput = audioOutput + "If we play the third string without using any fingers on the fretboard " +
            "The sound that will be played is the note G. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/g2.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Now use your index finger and press down on the string for the first fret. " +
            "Then play the third string and it should play the note G Sharp. Go ahead and do that now. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/g2sharp.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Let's continue moving up the fretboard and move your index finger one fret " +
            "and then play the third string again. This should be the note A. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/a3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "Keep up the pattern by moving over another fret and pick the third string again. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/a3sharp.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "This note is A Sharp. Let's go over one more fret and pick the third string again.";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/b3.mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

        audioOutput = audioOutput + "If you're ready for the next step in learning notes, say Next.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play individual notes on the third string.";
    var objectOutput = "ThirdString";

    var repromptText = "When you are ready for the next section, please say Next.";

    // now save off data for session
    var sessionAttributes = {};
        sessionAttributes.lastIntent = "TeachNote";
        sessionAttributes.stringLesson = 3;

	VoiceInsights.track('ThirdString', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, objectOutput, repromptText, shouldEndSession));
    });
}

// this is the function that gets called to format the response to the user when they first boot the app

function teachChord(session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Chord Instruction";

    console.log("Teach Chord Invoked");

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput +  "Guitar Teacher can help you learn how to play chords on the guitar. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/Chordcmajor.mp3\" />";
        audioOutput = audioOutput + "Let's get started on how chords work. What you just heard is a very basic " +
            "chord called C Major. It's played by pressing three fingers on different strings, then strumming all " +
            "all six strings across the guitar. The difference between the chords are all about finger placement " +
            "on the frets. Each fret plays a different note, so by positioning your fingers on different ones, " +
            "a different set of notes will be played. If you're ready to get started, say something like " +
            "Teach me how to play C Major, and I will walk you through the finger placement and play what the chord " +
            "should sound like. ";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play chords\n";

    var repromptText = "Please start by saying something like Teach me how to play C Major " +
        "and I will walk you through the finger positions to play them.";

	VoiceInsights.track('TeachChord', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, "Chordcmajor", repromptText, shouldEndSession));
    });
}

// this is the function that gets called to format the response to the user when they first boot the app

function teachIndivChord(intent, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Chord Instruction";

    console.log("Teach Individual Chord Invoked");

    // if a chord is passed, scrub it from all invalid characters
    if (intent.slots.Chord.value) {
        var scrubChord = "" + intent.slots.Chord.value.toLowerCase();
        var chordRequest = "";
        for (i = 0; i < scrubChord.length; i++ ) {
            //console.log(scrubChord[i]);
            if (scrubChord[i] === " ") {
                console.log("removed space");
            } else if (scrubChord[i] === ".") {
                console.log("removed dot");
            } else {
                chordRequest = chordRequest + scrubChord[i];
            }
        }
    } else {
        var cardTitle = "Missing Musical Chord";
        var speechOutput = "I'm sorry, you didn't provide a chord.  If you'd like to try again, please say " +
            "the name of a musical chord now. For example, say Teach me how to play C Major.";
        var repromptText = "If you would like to continue to use the skill, please say a musical chord now.";

        VoiceInsights.track('ErrorMissingChord', null, null, (err, res) => {
	        console.log('voice insights logged' + JSON.stringify(res));
            callback({}, buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
        });
    }

    // validate that the chord exists
    var validChord = false;
    var chordData = {};
    console.log("user provided:" + chordRequest);

    for (i = 0; i < chords.length; i++) {
        //console.log("check: " + chords[i].chordName)
        if (chordRequest === chords[i].chordName) {
            validChord = true;
            chordData = chords[i];
            console.log("we have a match");
        }
    }
    
    // final check - if the chord is valid, pass to the function to pass back result. else error handling
    if (validChord) {
        outputIndivChord(chordData, intent, session, callback)
    } else {
	    VoiceInsights.track('ErrorInvalidChord', null, null, (err, res) => {
	        console.log('voice insights logged' + JSON.stringify(res));

            callback(sessionAttributes,
                buildAudioCardResponse(cardTitle, audioOutput, cardOutput, objectOutput, repromptText, shouldEndSession));
        });        
    }
}

// this is the function that gets called to format the response to the user when they first boot the app

function outputIndivChord(chordData, intent, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Chord Instruction";

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput +  "Okay, let's get started on how to play the chord " + chordData.chordDesc + ". ";
        audioOutput = audioOutput + "<audio src=\"" + noteLib + "Chord" + chordData.chordName + ".mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "Here are the finger positions. ";

    if (chordData.fingers[0] > 0) {
        audioOutput = audioOutput + "Your index finger will be on string " + 
            chordData.fingers[0] + " pressing down on fret " + chordData.strings[chordData.fingers[0] - 1] + ". ";
        audioOutput = audioOutput + "<break time=\"2s\"/>";
    }

    if (chordData.fingers[1] > 0) {        
        audioOutput = audioOutput + "Your middle finger will be on string " + chordData.fingers[1] +
            " pressing down on fret " + chordData.strings[chordData.fingers[1] - 1] + ". ";
        audioOutput = audioOutput + "<break time=\"2s\"/>";
    }
    
    if (chordData.fingers[2] > 0) {
        audioOutput = audioOutput + "Finally, your ring finger will be on string " + chordData.fingers[2] +
            " pressing down on fret " + chordData.strings[chordData.fingers[2] - 1] + ". ";
        audioOutput = audioOutput + "<break time=\"2s\"/>";
    }
        
        audioOutput = audioOutput + "Now go ahead and play the chord " + chordData.chordDesc + ". ";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "<audio src=\"" + noteLib + "Chord" + chordData.chordName + ".mp3\" />";

        audioOutput = audioOutput + "One more time. ";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "<audio src=\"" + noteLib + "Chord" + chordData.chordName + ".mp3\" />";

        audioOutput = audioOutput + "<break time=\"2s\"/>";
        audioOutput = audioOutput + "If you're ready for another chord to learn, please ask for it now.";
        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play " + chordData.chordDesc;
    var objectOutput = "Chord" + chordData.chordName;

    var repromptText = "Please start by saying something like Teach me how to play C Major " +
        "and I will walk you through the finger positions to play them.";

	VoiceInsights.track('TeachIndivChord', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, objectOutput, repromptText, shouldEndSession));
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

// this describes what songs are available for playback

function teachSong(session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Song Instruction";

    console.log("Teach Song Invoked");

    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "Guitar Teacher can teach you how to play a basic song. ";
        audioOutput = audioOutput + "Choose from the following options by saying Teach me Home on the Range. ";
        audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/homeOnTheRange.mp3\" />";
        audioOutput = audioOutput + "The Yellow Rose of Texas. ";
        audioOutput = audioOutput + "Happy Birthday Song. ";
        audioOutput = audioOutput + "Amazing Grace. ";

        audioOutput = audioOutput + "</speak>";

    var cardOutput = "How to play chords\n";

    var repromptText = "Please start by requesting a song, saying something like Teach me how to play Amazing Grace " +
        "and I will walk you through the individual notes to play them.";

	VoiceInsights.track('TeachSong', null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
    });
}

// this is the function that gets called to tune the guitar

function tuneGuitar(intent, session, callback) {
    var cardTitle = "Tune Guitar";
    var tuneString = 0;

    console.log("Tune Guitar Invoked via " + intent.name);
    console.log("session: " + JSON.stringify(session));
    
    // if this is not the first time through, retrieve from saved session
    if (session.attributes == null || session.attributes.string == null) {
        tuneString = 1;
        console.log("new session");
    } else {
        tuneString = session.attributes.string;
        console.log("prior session. retrieved string " + tuneString);
        // check if we've gone through all of the strings and need to start again from the beginning
        if (tuneString == 6) {
            tuneString = 1;
        }
    }
    
    // set the string name based on which intent invoked the function
    if ("GuitarTuner" === intent.name) {
        tuneString = 1;
    } else if ("NextString" === intent.name) {
        tuneString = tuneString + 1;
        console.log("increment string");
    } else if ("RepeatString" === intent.name ) {
        console.log("repeating string");
    } else {
        tuneString = 1;
    }
    
    // this incrementally constructs the SSML message combining voice in text into the same output stream
    console.log("building SSML");

    //var noteLib = "https://s3.amazonaws.com/musicmakerskill/guitar/";
    
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "Now tuning string " + tuneString + ". ";
        audioOutput = audioOutput + "<break time=\"1s\"/>";
        audioOutput = audioOutput + "<audio src=\"" + noteLib + "tuner/string" + tuneString + ".mp3\" />";
        audioOutput = audioOutput + "<break time=\"1s\"/>";

    if (tuneString < 6) {
        audioOutput = audioOutput + "Please say Repeat String or Next String.";
    } else {
        audioOutput = audioOutput + "Please say Repeat String, or Next String if you want to go back to string 1.";
    }
        audioOutput = audioOutput + "</speak>";

    // if the user still does not respond, they will be prompted with this additional information

    var cardOutput = "Tuning String " + tuneString;

    var repromptText = "If you are ready to go to the next string, please say Next String.";
        
    var shouldEndSession = false;

    var sessionAttributes = {};
        sessionAttributes.string = tuneString;
        sessionAttributes.intent = "TuneGuitar";

	VoiceInsights.track(intent.name, null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
    });
    
}

// this is the function that gets called to format the response to the user when they ask for help
function getHelpResponse(session, callback) {
    var sessionAttributes = {};
    var cardTitle = "Guitar Teacher Help";

    console.log("Help Message Invoked");

    // this is what shows up as text instructions on the mobile app that accompanies the skill
    var cardOutput = "Guitar Teacher Features\n";
        cardOutput = cardOutput + "Teach Notes - Learn how to play individual notes on a guitar. " +
            "This technique is also called picking, and requires understanding how to find each note on the guitar, " +
            "then playing it based on placement of your fingers.\n";
        cardOutput = cardOutput + "Teach Chords - Learn how to play multiple notes at once. " +
            "These are called chords, and the technique is sometimes referred to as strumming the guitar. " +
            "The focus is around finger placement, and how to recognize the different names.\n"
        //cardOutput = cardOutput + "Teach Music is a feature that "
        cardOutput = cardOutput + "Play Guitar - Alexa will playback individual notes or chords based on your requests.\n";

    // this is the verbiage that Alexa speaks. Some background is given on each main feature of the app.
    var speechOutput = "Guitar Teacher is an interactive tool where Alexa can be your private instructor. ";
        speechOutput = speechOutput + "Teach Notes is a feature that enables how to play individual notes on a guitar. " +
            "This technique is also called picking, and requires understanding how to find each note on the instrument, " +
            "then playing it based on placement of an individual finger pressing down on a string. ";
        speechOutput = speechOutput + "Teach Chords is a feature that enables how to play multiple notes at once. " +
            "These are called chords, and the technique is sometimes referred to as strumming the guitar. " +
            "The focus is placing multiple fingers on different strings, and how to recognize the different names. "
        //speechOutput = speechOutput + "Teach Music is a feature that walks through the steps to play a song. ";
        speechOutput = speechOutput + "Play Guitar is a feature that enables Alexa to playback individual notes " +
            "or chords through your device based on voice requests. ";
        speechOutput = speechOutput + "Tune Guitar is a feature that walks through the steps to tune each of the six " +
            "strings on your guitar. ";
        speechOutput = speechOutput + "To get started, say one of the following. Teach Notes, Teach Chords, Play Guitar, Tune Guitar.";
        
    // if the user still does not respond, they will be prompted with this additional information

    var repromptText = "To get started, please say something like Teach Notes and I will walk you through " +
        "the steps to get started.";
        
    var shouldEndSession = false;

	VoiceInsights.track("Help", null, null, (err, res) => {
	    console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, shouldEndSession));
	});
}

// this is the function that gets called to format the response when the user is done
function handleSessionEndRequest(callback) {
    var cardTitle = "Thanks for using Guitar Player";
    var speechOutput = "Thank you for trying out Guitar Player. Please take a moment to comment on the skill " +
        "within the app on your mobile device to provide feedback on how we can improve. Have a nice day!";
        
    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

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

        VoiceInsights.track('PlayNote', null, null, (err, res) => {
            console.log('voice insights logged' + JSON.stringify(res));

            callback({}, 
                buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
        });
    }    
}

// This processes the logic when a chord is requested. If successful, it hands off to another function

function chordRequest(intent, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var noteHistory = [];
    var increaseOctave = false;
    var chordRequest = "";
    var chordDesc = "";

    // check if notes have been played before and are saved into the session. If so, load into local array
    if (session.attributes == null || session.attributes.noteHistory == null) {
        console.log("no prior history");
    } else {
        console.log("prior history: " + JSON.stringify(session.attributes.noteHistory));
        noteHistory = session.attributes.noteHistory;
        sessionAttributes.noteHistory = session.attributes.noteHistory;
    }

    console.log("Play Chord invoked: " + intent.slots.Chord.value);

    // if a chord value is passed, scrub it from all invalid characters. If no chord provided, pass back error
    if (intent.slots.Chord.value) {
        var scrubChord = "" + intent.slots.Chord.value.toLowerCase();
        for (i = 0; i < scrubChord.length; i++ ) {
            //console.log(scrubChord[i]);
            if (scrubChord[i] === " ") {
                console.log("removed space");
            } else if (scrubChord[i] === ".") {
                console.log("removed dot");
            } else {
                chordRequest = chordRequest + scrubChord[i];
            }
        }
    } else {
        var cardTitle = "Missing Musical Chord";
        var speechOutput = "I'm sorry, you didn't provide a chord.  If you'd like to try again, please say " +
            "the name of a musical chord now.";
        var repromptText = "If you would like to continue to use the skill, please say a musical chord now.";

        VoiceInsights.track('NoChordRequest', null, null, (err, res) => {
            console.log("No musical chord provided");
            callback({}, buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
        });
    }

    // validate that the chord exists
    var validChord = false;
    console.log("user provided:" + chordRequest);

    for (i = 0; i < chords.length; i++) {
        console.log("check: " + chords[i].chordName)
        if (chordRequest === chords[i].chordName) {
            validChord = true;
            console.log("we have a match");
        }
    }
    
    // final check - if the chord is valid, pass to the function to pass back result. else error handling
    if (validChord) {
        playChord(chordRequest, intent, session, callback)
    } else {

        console.log("Not a valid chord");
        var speechOutput = "Sorry, please tell me a valid chord that you would like me to play. For example " +
            "say something like Play C Major";
        var repromptText = "If you would like to continue to use the skill, please say another musical note now.";

        // we don't want to lose the session history even though the last note was invalid
        sessionAttributes.noteHistory = noteHistory;

        VoiceInsights.track('InvalidChordRequest', null, null, (err, res) => {
            callback({}, 
                buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, shouldEndSession));
        });
    }    
}

// This generates a user response back when a valid chord is provided, so the SSML gets generated

function playChord(chord, intent, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;

    console.log("Processing Chord Response for " + chord);

    var cardTitle = "Play Chord";

    var musicLib = "https://s3.amazonaws.com/musicmakerskill/guitar/Chord";

    // now create the response by assembling the information in correct SSML format
    var audioOutput = "<speak>";
        audioOutput = audioOutput + "Playing " + intent.slots.Chord.value + ". ";
        audioOutupt = audioOutput + "<break time=\"1s\"/";
        audioOutput = audioOutput + "<audio src=\"" + musicLib + chord + ".mp3\" />";

        //audioOutput = audioOutput + "<break time=\"1s\"/>Ready for another note? Just request the next one now.";
        audioOutput = audioOutput + "</speak>";

    // save the note History for the session to be used later
    //sessionAttributes.noteHistory = noteHistory;

    var cardOutput = "Playing: " + intent.slots.Chord.value;
    var displayObject = "Chord" + chord;

    var repromptText = "If you are ready to play another note, please say so now by indicating the letter " +
        "representing the note.";

    VoiceInsights.track('PlayChord', intent.slots, null, (err, res) => {
        console.log('voice insights logged' + JSON.stringify(res));

        callback(sessionAttributes,
            buildAudioCardResponse(cardTitle, audioOutput, cardOutput, displayObject, repromptText, shouldEndSession));
    });
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
    var smallImagePath = noteLib + "small-images/" + objectName + "-small.PNG";
    var largeImagePath = noteLib + "large-images/" + objectName + "-large.PNG";
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
