# Guitar Teacher Skill

This is an Alexa skill that provides instruction in how to play a guitar.

![](graphics/logo_108x108.png)

**Table of Contents**

- [Where are the graphics stored?](#graphics)
- [Where are the NLU models stored?](#nlu-models)
- [How does this skill play sound recordings?](#how-to-play-mp3-files-in-a-skill)
- [How does it remember which string was previously played?](#how-to-save-session-data)

## Graphics

The Icons that are used in the Amazon Alexa skill store are found in the /graphics folder.
These are used when publishing the skill.

The notations for playing the different chords are stored in a folder in S3.
There is a naming notation to them that maps to the code within the skill.
This includes a suffix of -small.PNG vs. -large.PNG matching the format required by Alexa.
So when the user requests a different note or chord to be played, the response dynamically changes to include the note.
Here is the helper function that processes this logic, and the note - i.e. the objectName - is what gets passed in.

```
var noteLib = "https://s3.amazonaws.com/musicmakerskill/guitar/"; // this is the folder in the s3 bucket where all images are stored.

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
```

## NLU Models

The intent schema, custom slots, sample utterances, and other data attributes in the NLU models are stored in the /models folder.
This includes two custom slots, one with the notes in the scale, the other of the major and minor chord names that this skill teaches.

## How to Play MP3 files in a Skill

Throughout this skill, the voice of Alexa is combined with guitar playing.
This is done using SSML - Speech Synthesis Markup Language.
An example of this is in the introduction. Here is the markup syntax that integrates the two.

```
var audioOutput = "<speak>";
    audioOutput = audioOutput +  "Welcome to Guitar Teacher.";
    audioOutput = audioOutput + "<audio src=\"https://s3.amazonaws.com/musicmakerskill/guitar/homeOnTheRange.mp3\" />";
    audioOutput = audioOutput + "Your tool for learning how to play the guitar. " + 
        "To get started, you can say Teach Notes, Teach Chords, Play Guitar, or Tune Guitar. " +
        "If you want more detailed instructions, say Help.";
    audioOutput = audioOutput + "</speak>";

var repromptText = "Please start by saying something like Play Guitar";
buildAudioResponse(cardTitle, audioOutput, cardOutput, repromptText, shouldEndSession));
```

The markup needs to have "speak" notated to indicate that SSML will be used.
Then within the SSML, use the markup "audio src="https://s3.aws.../file.mp3"" to provide the location of the mp3 file.

For an example of a skill using the current version of the NodeJS SDK, please use [this repo](https://github.com/terrenjpeterson/pianoplayer).

## How to Save Session Data

The Alexa request/response model has the ability to save state within the message being passed back and forth to the device.
So while the Lambda function may be stateless, the state is actually within the message.
This is how when playing multiple strings in a dialog with a user, the skill knows which was the last string played.
