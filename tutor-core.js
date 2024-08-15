// Global variables
let audioContext;
let analyser;
let dataArray;
let mediaRecorder;
let audioChunks = [];
let stream;
let isMonitoring = false;
let isRecording = false;
let silenceStartTime = null;
let soundDetectedTime = null;

// Constants for sound detection
const SILENCE_THRESHOLD = 20;
const SOUND_DETECTION_DURATION = 72; // Decreased to 90% of 80ms
const SILENCE_DURATION_TO_STOP = 1000;
const MIN_VALID_DURATION = 3 * SOUND_DETECTION_DURATION / 1000; // Changed to 3 times the sampling interval

// Controller
const tutorController = {
    isActive: false,
    start: function() {
        this.isActive = true;
        this.startMonitoring();
    },
    stop: function() {
        this.isActive = false;
        stopTutor();
    },
    startMonitoring: function() {
        soundDetectedTime = null;
        
        const constraints = {
            audio: {
                deviceId: microphoneSelect.value ? {exact: microphoneSelect.value} : undefined
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(str => {
                stream = str;
                setupAudioContext();
                startMonitoring();
            })
            .catch(err => {
                console.error("Error accessing microphone:", err);
                this.stop();
            });
    },
    handleRecordingComplete: function(result) {
        if (this.onRecordingComplete) {
            this.onRecordingComplete(result);
        }
    },
    onRecordingComplete: null // This will be set in tutor-ui.js
};

function setupAudioContext() {
    if (audioContext) {
        audioContext.close();
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function startMonitoring() {
    isMonitoring = true;
    monitorSound();
}

function monitorSound() {
    if (!isMonitoring) return;

    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;
    const isSilent = average < SILENCE_THRESHOLD;

    if (!isRecording) {
        handlePreRecordingState(isSilent);
    } else {
        handleRecordingState(isSilent);
    }

    // Call monitorSound again as soon as possible
    requestAnimationFrame(monitorSound);
    
    return { average, isSilent };
}

function handlePreRecordingState(isSilent) {
    if (!isSilent) {
        if (!soundDetectedTime) {
            soundDetectedTime = Date.now();
        } else if (Date.now() - soundDetectedTime >= SOUND_DETECTION_DURATION) {
            startRecording();
        }
    } else {
        soundDetectedTime = null;
    }
}

function handleRecordingState(isSilent) {
    if (isSilent) {
        if (!silenceStartTime) {
            silenceStartTime = Date.now();
        } else if (Date.now() - silenceStartTime >= SILENCE_DURATION_TO_STOP) {
            stopRecording().then(result => {
                tutorController.handleRecordingComplete(result);
            });
        }
    } else {
        silenceStartTime = null;
    }
}

function startRecording() {
    isRecording = true;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };
    mediaRecorder.start();
    silenceStartTime = null;
}

async function trimSilence(audioBlob) {
    const audioBuffer = await audioBlob.arrayBuffer()
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const silenceDuration = SILENCE_DURATION_TO_STOP / 1000; // Convert to seconds
    const trimmedLength = audioBuffer.length - sampleRate * silenceDuration;

    // Check if the trimmed audio is too short
    if (trimmedLength / sampleRate <= MIN_VALID_DURATION) {
        return null; // Return null for too short recordings
    }

    const trimmedBuffer = audioContext.createBuffer(
        numberOfChannels,
        trimmedLength,
        sampleRate
    );

    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        trimmedBuffer.copyToChannel(channelData.slice(0, trimmedLength), channel);
    }

    return new Promise(resolve => {
        const offlineContext = new OfflineAudioContext(
            numberOfChannels,
            trimmedLength,
            sampleRate
        );
        const source = offlineContext.createBufferSource();
        source.buffer = trimmedBuffer;
        source.connect(offlineContext.destination);
        source.start();
        offlineContext.startRendering().then(renderedBuffer => {
            const trimmedBlob = bufferToWave(renderedBuffer, trimmedLength);
            resolve(trimmedBlob);
        });
    });
}

function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {             // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);        // write 16-bit sample
            pos += 2;
        }
        offset++; // next source sample
    }

    // create Blob
    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        stopMonitoring();
        
        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, {type: 'audio/wav'});
                const trimmedBlob = await trimSilence(audioBlob);
                if (trimmedBlob === null) {
                    resolve({ discarded: true, reason: "Recording too short" });
                } else {
                    resolve({ discarded: false, audioBlob: trimmedBlob });
                }
            };
        });
    }
    return Promise.resolve({ discarded: true, reason: "No active recording" });
}

function stopMonitoring() {
    isMonitoring = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
}

function stopTutor() {
    stopMonitoring();
}

export { tutorController, monitorSound, startRecording, stopRecording, stopTutor };