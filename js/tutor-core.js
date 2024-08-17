import { sendAudioToServer } from './api-service.js';
import { trimSilence, bufferToWave } from './audio-utils.js';

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
const SILENCE_THRESHOLD = 22;
const SOUND_DETECTION_DURATION = 20; // Decreased to 90% of 80ms
const SILENCE_DURATION_TO_STOP = 1000;
const MIN_VALID_DURATION = 3 * SOUND_DETECTION_DURATION/100; // Changed to 3 times the sampling interval

const tutorController = {
    isActive: false,
    isRecording: false,
    selectedMicrophoneId: null,
    formElements: null,
    uiCallbacks: null,
    chatObject: null,

    setFormElements: function(elements) {
        this.formElements = elements;
    },

    setUICallbacks: function(callbacks) {
        this.uiCallbacks = callbacks;
    },

    start: function() {
        this.isActive = true;
        this.chatObject = {
            chat_history: [],
            tutors_comments: [],
            summary: []
        };
        this.startMonitoring();
    },

    stop: function() {
        this.isActive = false;
        this.chatObject = null;
        stopTutor();
    },

    startMonitoring: function() {
        soundDetectedTime = null;
        
        const constraints = {
            audio: {
                deviceId: this.selectedMicrophoneId ? {exact: this.selectedMicrophoneId} : undefined
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(str => {
                stream = str;
                setupAudioContext();
                startMonitoring();
                if (this.uiCallbacks.onMonitoringStart) {
                    this.uiCallbacks.onMonitoringStart();
                }
            })
            .catch(err => {
                console.error("Error accessing microphone:", err);
                this.stop();
                if (this.uiCallbacks.onError) {
                    this.uiCallbacks.onError("Error accessing microphone: " + err.message);
                }
            });
    },

    setMicrophone: function(deviceId) {
        this.selectedMicrophoneId = deviceId;
    },

    async processAndPlayAudio(audioBlob) {
        try {
            if (this.uiCallbacks.onProcessingStart) {
                this.uiCallbacks.onProcessingStart();
            }
    
            const formElementsWithChat = {
                ...this.formElements,
                chatObject: this.chatObject
            };
    
            const result = await sendAudioToServer(audioBlob, formElementsWithChat);
            
            console.time('clientProcessing');
            
            if (this.uiCallbacks.onChatHistoryReceived) {
                this.uiCallbacks.onChatHistoryReceived(result.chat);
            }
            
            // Update chatObject with the response from the server
            this.chatObject = result.chatObject;
            
            if (this.uiCallbacks.onAPIResponseReceived) {
                this.uiCallbacks.onAPIResponseReceived(result);
            }
            
            // Display tutor's feedback
            if (this.uiCallbacks.onTutorsFeedbackReceived) {
                this.uiCallbacks.onTutorsFeedbackReceived(result.tutors_feedback);
            }
            
            // Display updated summary
            if (this.uiCallbacks.onSummaryUpdated) {
                this.uiCallbacks.onSummaryUpdated(result.updated_summary);
            }
            
            // Decode audio data
            const audioBuffer = await decodeAudioData(result.audio_base64);
            
            // Play audio
            if (this.uiCallbacks.onAudioPlayStart) {
                this.uiCallbacks.onAudioPlayStart();
            }
            const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
            await playDecodedAudio(audioBuffer, playbackSpeed);
            
            console.timeEnd('clientProcessing');
            
            return { success: true };
        } catch (error) {
            console.error('Error processing or playing audio:', error);
            if (this.uiCallbacks.onError) {
                this.uiCallbacks.onError("Error processing or playing audio: " + error.message);
            }
            return { success: false, error: error.message };
        } finally {
            // Ensure monitoring restarts regardless of success or failure
            if (this.isActive) {
                this.startMonitoring();
            }
        }
    },

    async onRecordingComplete(result) {
        if (result.discarded) {
            if (this.uiCallbacks.onRecordingDiscarded) {
                this.uiCallbacks.onRecordingDiscarded(result.reason);
            }
            this.startMonitoring();
        } else {
            const processResult = await this.processAndPlayAudio(result.audioBlob);
            
            if (processResult.success) {
                // Resume monitoring after successful audio playback
                if (this.isActive) {
                    this.startMonitoring();
                }
            }
        }
    },

    startMonitoringInterval: function() {
        return setInterval(() => {
            if (this.isActive) {
                const { average, isSilent } = monitorSound();
                if (this.uiCallbacks.onSoundLevelUpdate) {
                    this.uiCallbacks.onSoundLevelUpdate(average, isSilent);
                }
            } else {
                if (this.uiCallbacks.onSoundLevelUpdate) {
                    this.uiCallbacks.onSoundLevelUpdate(null, null);
                }
            }
        }, 72); // Decreased to 90% of 80ms
    }
};

function setupAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
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
    if (!isMonitoring || !analyser || !dataArray) {
        return { average: 0, isSilent: true };
    }

    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;
    const isSilent = average < SILENCE_THRESHOLD;

    if (!isRecording) {
        handlePreRecordingState(isSilent);
    } else {
        handleRecordingState(isSilent);
    }

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
                tutorController.onRecordingComplete(result);
            });
        }
    } else {
        silenceStartTime = null;
    }
}

function startRecording() {
    isRecording = true;
    tutorController.isRecording = true;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };
    mediaRecorder.start();
    silenceStartTime = null;
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        tutorController.isRecording = false;
        stopMonitoring();
        
        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, {type: 'audio/wav'});
                const trimmedBlob = await trimSilence(
                    audioBlob, 
                    audioContext, 
                    SILENCE_DURATION_TO_STOP / 1000, 
                    MIN_VALID_DURATION
                );
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
}

function stopTutor() {
    stopMonitoring();
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

function decodeAudioData(base64Audio) {
    return new Promise((resolve, reject) => {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        audioContext.decodeAudioData(bytes.buffer, resolve, reject);
    });
}

function playDecodedAudio(audioBuffer, playbackSpeed) {
    return new Promise((resolve) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackSpeed;
        source.connect(audioContext.destination);
        source.onended = resolve;
        source.start(0);
    });
}

export { 
    tutorController, 
    decodeAudioData, 
    playDecodedAudio
};